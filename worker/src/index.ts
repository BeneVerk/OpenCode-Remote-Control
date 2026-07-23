import { DurableObject } from "cloudflare:workers";

export class SessionRelay extends DurableObject {
  // Implemented in Task 3
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response("OpenCode Remote Control — scaffold", { status: 200 });
  },
} satisfies ExportedHandler<Env>;

export interface Env {
  ASSETS: Fetcher;
  SESSION_RELAY: DurableObjectNamespace;
  DB: D1Database;
}
