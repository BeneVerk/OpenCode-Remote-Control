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
// Hop-by-hop (RFC 7230 §6.1) + identity-leak headers never forwarded to the backend.
const STRIPPED_PROXY_HEADERS = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "host",
  "cf-access-jwt-assertion", "cf-access-client-id", "cookie",
];

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

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
      return this.handleRegister(request);
    }

    // WebSocket upgrade: machine control connection or browser client.
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request, url);
    }

    // HTTP data-path proxy: forward to the machine's backend (spike-proven).
    return this.handleProxy(request, url);
  }

  private async handleRegister(request: Request): Promise<Response> {
    const body = (await request.json()) as SessionMeta & { password?: string };
    // R3: only allow backends on a tunnel hostname (default *.cfargotunnel.com).
    const backendErr = this.validateBackend(body.backend);
    if (backendErr) return Response.json({ error: backendErr }, { status: 400 });

    const meta: SessionMeta = {
      sessionId: body.sessionId,
      machine: body.machine,
      backend: body.backend,
      project: body.project,
      title: body.title || body.sessionId,
      passwordHash: body.password ? await this.hashPassword(body.password) : null,
    };
    await this.ctx.storage.put("meta", meta);
    await this.persistSession(meta);
    await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_TTL_MS);
    console.log("register", { sid: meta.sessionId, machine: meta.machine });
    return Response.json({ ack: "registered", sessionId: meta.sessionId });
  }

  private handleWebSocket(request: Request, url: URL): Response {
    // R10: reject cross-origin browser WS upgrades (CSWSH). Non-browser clients
    // (the agent) send no Origin and are allowed.
    const origin = request.headers.get("Origin");
    if (origin) {
      try {
        if (new URL(origin).hostname !== url.hostname) {
          return new Response("origin mismatch", { status: 403 });
        }
      } catch {
        return new Response("invalid origin", { status: 400 });
      }
    }
    const role = url.searchParams.get("role") === "machine" ? "machine" : "browser";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [role]);
    server.send(JSON.stringify({ type: "connected", role }));

    if (role === "browser") {
      for (const m of this.ctx.getWebSockets("machine")) {
        m.send(JSON.stringify({ type: "client_connected" }));
      }
      server.send(JSON.stringify({ type: "ready" }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleProxy(request: Request, url: URL): Promise<Response> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return new Response("session not found", { status: 404 });
    const target = meta.backend + url.pathname + url.search;
    // R12: strip hop-by-hop + identity-leak headers before forwarding.
    const headers = new Headers(request.headers);
    for (const h of STRIPPED_PROXY_HEADERS) headers.delete(h);
    try {
      const resp = await fetch(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      });
      const respHeaders = new Headers(resp.headers);
      for (const h of STRIPPED_PROXY_HEADERS) respHeaders.delete(h);
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: respHeaders,
      });
    } catch (e) {
      console.error("proxy error", { sid: meta.sessionId, target, msg: String(e) });
      return new Response("backend unreachable", { status: 502 });
    }
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
    // Note: the alarm self-reschedules from connection count; we do NOT call
    // setAlarm on every frame (would be a storage write per message on the hot path).
    try {
      const parsed = JSON.parse(msg) as { type?: string };
      if (parsed.type === "client_connected") {
        ws.send(JSON.stringify({ type: "ack", event: "client_connected" }));
      }
    } catch {
      /* non-JSON control frame -- already relayed above */
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
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
  // Auto-ping/pong does NOT wake the DO, so presence is determined by whether
  // any WS connection is still attached.
  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_TTL_MS);
      return;
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (meta) {
      await this.env.DB.prepare(
        "UPDATE sessions SET status = 'offline', updated_at = ? WHERE id = ?",
      )
        .bind(Date.now(), meta.sessionId)
        .run();
    }
  }

  private validateBackend(backend: string): string | null {
    let u: URL;
    try {
      u = new URL(backend);
    } catch {
      return "backend is not a valid URL";
    }
    if (u.protocol !== "https:") return "backend must be https";
    const host = u.hostname.toLowerCase();
    const allowed = (this.env.BACKEND_SUFFIXES || "cfargotunnel.com")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!allowed.some((sfx) => host === sfx || host.endsWith("." + sfx))) {
      return "backend hostname not allowed (must match an allowed tunnel suffix)";
    }
    return null;
  }

  private async persistSession(meta: SessionMeta): Promise<void> {
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
    // R16: keep the machines registry in step (wires the previously-dead table).
    await this.env.DB.prepare(
      `INSERT INTO machines (id, hostname, backend, last_seen)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET hostname = ?2, backend = ?3, last_seen = ?4`,
    )
      .bind(meta.machine, meta.machine, meta.backend, now)
      .run();
  }

  // R6: PBKDF2-SHA256 with per-password salt (replaces unsalted SHA-256).
  private async hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iterations = 600_000;
    const keyMaterial = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, keyMaterial, 256,
    );
    return `pbkdf2$${iterations}$${bytesToB64(salt)}$${bytesToB64(new Uint8Array(bits))}`;
  }
}
