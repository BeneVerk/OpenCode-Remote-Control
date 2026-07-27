import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// Schema inlined (not read from disk) because the test runs in the workerd runtime,
// where node:fs path handling differs from Node. D1 .exec() splits per line, so each
// statement is on a single line.
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, machine TEXT NOT NULL, project_path TEXT NOT NULL, title TEXT, backend TEXT NOT NULL, password_hash TEXT, status TEXT NOT NULL DEFAULT 'online', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);",
  "CREATE TABLE IF NOT EXISTS machines (id TEXT PRIMARY KEY, hostname TEXT NOT NULL, backend TEXT NOT NULL, last_seen INTEGER NOT NULL);",
  "CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);",
  "CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);",
].join("\n");

// Apply the schema to the in-test (Miniflare) D1 before any case runs.
beforeAll(async () => {
  await env.DB.exec(SCHEMA);
});

describe("OpenCode Remote Control worker", () => {
  it("GET /api/sessions returns 200 and an array", async () => {
    const r = await SELF.fetch("https://example.test/api/sessions");
    expect(r.status).toBe(200);
    const body = (await r.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("R14: rejects an invalid sessionId (space)", async () => {
    const r = await SELF.fetch("https://example.test/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "bad id", machine: "t", backend: "https://t.cfargotunnel.com", project: "p", title: "t" }),
    });
    expect(r.status).toBe(400);
  });

  it("R3: rejects a non-tunnel backend (open-proxy mitigation)", async () => {
    const r = await SELF.fetch("https://example.test/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "ses-r3-1", machine: "t", backend: "https://example.com", project: "p", title: "t" }),
    });
    expect(r.status).toBe(400);
  });

  it("R3: rejects a non-https backend", async () => {
    const r = await SELF.fetch("https://example.test/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "ses-r3-2", machine: "t", backend: "http://localhost:4192", project: "p", title: "t" }),
    });
    expect(r.status).toBe(400);
  });

  it("accepts a valid tunnel backend and registers (register -> DO -> D1)", async () => {
    const r = await SELF.fetch("https://example.test/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "ses-ok-1", machine: "box", backend: "https://box.cfargotunnel.com", project: "C:\\proj", title: "ok" }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ack: "registered", sessionId: "ses-ok-1" });
    // The session should now be listed.
    const list = await SELF.fetch("https://example.test/api/sessions");
    const rows = (await list.json()) as Array<{ id: string; status: string }>;
    expect(rows.some((s) => s.id === "ses-ok-1" && s.status === "online")).toBe(true);
  });

  it("R11: rejects an oversized registration body", async () => {
    const big = "x".repeat(5000);
    const r = await SELF.fetch("https://example.test/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "ses-big", machine: "t", backend: "https://t.cfargotunnel.com", title: big }),
    });
    expect(r.status).toBe(413);
  });

  it("R14: rejects an invalid session id in the session route", async () => {
    const r = await SELF.fetch("https://example.test/abc/session/bad%20id");
    expect(r.status).toBe(400);
  });

  it("serves the dashboard at /", async () => {
    const r = await SELF.fetch("https://example.test/");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("OpenCode Remote Control");
  });
});
