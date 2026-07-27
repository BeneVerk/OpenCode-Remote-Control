export { SessionRelay } from "./relay";

// R14: session IDs double as Durable-Object names; constrain length + charset.
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
// R11: cap registration body size.
const MAX_REGISTER_BODY = 4096;
// R4: prune offline sessions older than this (reaper runs on the hourly cron).
const STALE_SESSION_MS = 7 * 24 * 3600 * 1000;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API: list sessions (dashboard data source).
    if (url.pathname === "/api/sessions") {
      const result = await env.DB.prepare(
        "SELECT id, machine, project_path, title, status, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 100",
      ).all();
      return Response.json(result.results);
    }

    // Registration endpoint: agent POSTs {sessionId, ...} here; the body is read
    // to resolve the DO, then re-sent to the DO's /register handler.
    if (url.pathname === "/register" && request.method === "POST") {
      const declared = Number(request.headers.get("Content-Length") || 0);
      if (declared > MAX_REGISTER_BODY) return json({ error: "body too large" }, 413);
      const bodyText = await request.text();
      if (bodyText.length > MAX_REGISTER_BODY) return json({ error: "body too large" }, 413);
      let sessionId: unknown;
      try {
        sessionId = (JSON.parse(bodyText) as { sessionId?: unknown }).sessionId;
      } catch {
        return json({ error: "invalid JSON body" }, 400);
      }
      if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
        return json({ error: "sessionId invalid (1-128 chars, [A-Za-z0-9_-])" }, 400);
      }
      const stub = env.SESSION_RELAY.getByName(sessionId);
      const doRequest = new Request(new URL("/register", url), {
        method: "POST",
        headers: request.headers,
        body: bodyText,
      });
      return stub.fetch(doRequest);
    }

    // Session route: /<b64(project)>/session/<sessionId>[/subpath...]
    const match = url.pathname.match(/^\/([^/]+)\/session\/([^/]+)(\/.*)?$/);
    if (match) {
      const sessionId = match[2];
      if (!SESSION_ID_RE.test(sessionId)) return json({ error: "invalid session id" }, 400);
      const subPath = match[3] || "/";
      const stub = env.SESSION_RELAY.getByName(sessionId);
      // WebSocket upgrades: forward the original request so the Upgrade header survives.
      if (request.headers.get("Upgrade") === "websocket") {
        return stub.fetch(request);
      }
      // HTTP: strip the session prefix so the DO and proxied backend see clean paths.
      const doUrl = new URL(request.url);
      doUrl.pathname = subPath;
      return stub.fetch(new Request(doUrl, request));
    }

    // Default: static dashboard assets.
    return env.ASSETS.fetch(request);
  },

  // R4: hourly reaper -- delete offline sessions older than STALE_SESSION_MS.
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const cutoff = Date.now() - STALE_SESSION_MS;
    try {
      await env.DB.prepare("DELETE FROM sessions WHERE status = 'offline' AND updated_at < ?")
        .bind(cutoff)
        .run();
    } catch (e) {
      console.error("reaper failed:", String(e));
    }
  },
} satisfies ExportedHandler<Env>;

export interface Env {
  ASSETS: Fetcher;
  SESSION_RELAY: DurableObjectNamespace;
  DB: D1Database;
  /** Comma-separated hostname suffixes permitted as session backends (R3). */
  BACKEND_SUFFIXES?: string;
}
