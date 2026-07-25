import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

interface SessionMeta {
  sessionId: string;
  machine: string;
  backend: string;
  project: string;
  title: string;
  passwordHash: string | null;
}

const HEARTBEAT_TTL_MS = 60_000;

export class SessionRelay extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Machine registers a session.
    if (url.pathname === "/register" && request.method === "POST") {
      const body = (await request.json()) as SessionMeta & { password?: string };
      const meta: SessionMeta = {
        sessionId: body.sessionId,
        machine: body.machine,
        backend: body.backend,
        project: body.project,
        title: body.title || body.sessionId,
        passwordHash: body.password ? await this.hashPassword(body.password) : null,
      };
      await this.ctx.storage.put("meta", meta);
      await this.persistToD1(meta);
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_TTL_MS);
      return Response.json({ ack: "registered", sessionId: meta.sessionId });
    }

    // WebSocket upgrade: machine control connection or browser client.
    if (request.headers.get("Upgrade") === "websocket") {
      const role = url.searchParams.get("role") === "machine" ? "machine" : "browser";
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, [role]);
      server.send(JSON.stringify({ type: "connected", role }));

      // When a browser joins, ack the machine so it knows a client is viewing,
      // and tell the browser it's ready.
      if (role === "browser") {
        for (const m of this.ctx.getWebSockets("machine")) {
          m.send(JSON.stringify({ type: "client_connected" }));
        }
        server.send(JSON.stringify({ type: "ready" }));
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    // HTTP data-path proxy: forward to the machine's backend (spike-proven).
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return new Response("session not found", { status: 404 });
    const target = meta.backend + url.pathname + url.search;
    const resp = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    });
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    });
  }

  // Relay messages between connected WS (browser <-> machine).
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const msg = typeof message === "string" ? message : new TextDecoder().decode(message);
    for (const conn of this.ctx.getWebSockets()) {
      if (conn !== ws) {
        try {
          conn.send(msg);
        } catch {
          /* connection may be closing */
        }
      }
    }
    // Any message resets the offline alarm (heartbeat).
    await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_TTL_MS);
    // Ack specific client events.
    try {
      const parsed = JSON.parse(msg) as { type?: string };
      if (parsed.type === "client_connected") {
        ws.send(JSON.stringify({ type: "ack", event: "client_connected" }));
      }
    } catch {
      /* non-JSON control frame -- already relayed above */
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("SessionRelay WebSocket error:", error);
    try {
      ws.close(1011, "websocket error");
    } catch {
      /* closing */
    }
  }

  // Alarm fires when no heartbeat has been received for HEARTBEAT_TTL_MS.
  // Auto-ping/pong (setWebSocketAutoResponse) does NOT wake the DO, so presence
  // is determined by whether any WS connection is still attached.
  async alarm(): Promise<void> {
    // If the machine is still connected, the session stays online; just reschedule.
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_TTL_MS);
      return;
    }
    // No live connections -> mark the session offline.
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (meta) {
      await this.env.DB.prepare(
        "UPDATE sessions SET status = 'offline', updated_at = ? WHERE id = ?",
      )
        .bind(Date.now(), meta.sessionId)
        .run();
    }
  }

  private async persistToD1(meta: SessionMeta): Promise<void> {
    const now = Date.now();
    await this.env.DB.prepare(
      `INSERT INTO sessions (id, machine, project_path, title, backend, password_hash, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'online', ?7, ?7)
       ON CONFLICT(id) DO UPDATE SET
         machine = ?2, project_path = ?3, title = ?4, backend = ?5,
         password_hash = ?6, status = 'online', updated_at = ?7`,
    )
      .bind(meta.sessionId, meta.machine, meta.project, meta.title, meta.backend, meta.passwordHash, now)
      .run();
  }

  private async hashPassword(password: string): Promise<string> {
    const data = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }
}
