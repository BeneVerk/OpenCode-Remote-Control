export { SessionRelay } from "./relay";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API: list sessions (dashboard data source).
    if (url.pathname === "/api/sessions") {
      const result = await env.DB.prepare(
        "SELECT id, machine, project_path, title, status, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 200",
      ).all();
      return Response.json(result.results);
    }

    // Registration endpoint: agent POSTs {sessionId, ...} here; the body is read
    // to resolve the DO, then re-sent to the DO's /register handler.
    if (url.pathname === "/register" && request.method === "POST") {
      const bodyText = await request.text();
      let sessionId: unknown;
      try {
        sessionId = (JSON.parse(bodyText) as { sessionId?: unknown }).sessionId;
      } catch {
        return Response.json({ error: "invalid JSON body" }, { status: 400 });
      }
      if (typeof sessionId !== "string" || !sessionId) {
        return Response.json({ error: "sessionId required" }, { status: 400 });
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
} satisfies ExportedHandler<Env>;

export interface Env {
  ASSETS: Fetcher;
  SESSION_RELAY: DurableObjectNamespace;
  DB: D1Database;
}
