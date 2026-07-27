// Opencode Remote Fleet — dashboard mockup logic (vanilla JS, no build).
// Renders from a sample data object + drives notification toasts + theme + filtering.
// In the real aggregator this data comes from /api/machines (+ live updates); here it is
// hard-coded for design iteration.

const SAMPLE = {
  machines: [
    {
      id: "desktop-linux",
      hostname: "arch-desktop",
      backend: "https://desktop-linux.cfargotunnel.com",
      sessions: [
        { id: "ses_8af2", title: "fiscalorion/api-refactor", status: "waiting", detail: "Permission: run pnpm test", updated_at: Date.now() - 1000 * 60 * 2 },
        { id: "ses_22b1", title: "fiscalorion/auth", status: "online", detail: "idle", updated_at: Date.now() - 1000 * 60 * 12 },
        { id: "ses_91c0", title: "scratch/playground", status: "offline", detail: "no heartbeat for 3m", updated_at: Date.now() - 1000 * 60 * 3 * 60 },
      ],
    },
    {
      id: "mbp-14",
      hostname: "mbp-14",
      backend: "https://mbp-14.cfargotunnel.com",
      sessions: [
        { id: "ses_5d7e", title: "opencode-remote-fleet/worker", status: "online", detail: "busy · generating", updated_at: Date.now() - 1000 * 30 },
      ],
    },
  ],
  notifications: [
    { id: "n1", sessionId: "ses_8af2", machineId: "desktop-linux", title: "Session needs your input", body: "Permission request: run `pnpm test` in fiscalorion/api-refactor", at: Date.now() - 1000 * 60 * 2 },
  ],
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function sessionHref(machineId, sessionId) {
  // Cloud mode: apex path that redirects to the per-machine subdomain (see data-flows).
  return `/${machineId}/${sessionId}`;
}

function render(filter = "") {
  const root = $("#machines");
  root.innerHTML = "";
  const q = filter.trim().toLowerCase();
  let totalSessions = 0, waiting = 0;

  const matched = SAMPLE.machines.filter(
    (m) => !q || m.hostname.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) ||
      m.sessions.some((s) => (s.title || "").toLowerCase().includes(q) || s.id.toLowerCase().includes(q)),
  );

  if (matched.length === 0) {
    root.append(el("div", "empty", "No machines or sessions match your filter."));
  }

  for (const m of matched) {
    const sessions = m.sessions.filter(
      (s) => !q || (s.title || "").toLowerCase().includes(q) || s.id.toLowerCase().includes(q) ||
        m.hostname.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
    if (sessions.length === 0) continue;
    const section = el("section", "machine");
    const head = el("div", "machine__head");
    head.append(el("h2", "machine__title", m.hostname));
    head.append(el("span", "machine__sub", `${m.id} · `));
    head.append(el("a", "machine__sub", `${m.backend.replace("https://", "")}`));
    section.append(head);

    const grid = el("div", "machine__sessions");
    for (const s of sessions) {
      totalSessions++;
      if (s.status === "waiting") waiting++;
      const card = el("a", `card${s.status === "waiting" ? " card--waiting" : ""}`);
      card.href = sessionHref(m.id, s.id);
      const title = el("div", "card__title");
      title.append(document.createTextNode(s.title || s.id));
      card.append(title);
      card.append(el("div", "card__meta", `${s.id} · ${s.detail} · ${timeAgo(s.updated_at)}`));
      card.append(el("span", `card__pill pill--${s.status}`, s.status));
      grid.append(card);
    }
    section.append(grid);
    root.append(section);
  }

  $("#stat-machines").textContent = matched.length;
  $("#stat-sessions").textContent = totalSessions;
  $("#stat-waiting").textContent = waiting;
}

function toast(n) {
  const root = $("#toasts");
  const t = el("div", "toast");
  t.append(el("div", "toast__title", n.title));
  t.append(el("div", "toast__body", n.body));
  const actions = el("div", "toast__actions");
  const open = el("button", "toast__btn toast__btn--primary", "Open session");
  open.onclick = () => { location.href = sessionHref(n.machineId, n.sessionId); };
  const dismiss = el("button", "toast__btn", "Dismiss");
  dismiss.onclick = () => t.remove();
  actions.append(open, dismiss);
  t.append(actions);
  root.append(t);
  // Also fire a native Web Notification (mock: request + show).
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(n.title, { body: n.body });
  }
}

function setupTheme() {
  const btn = $("#theme-toggle");
  const saved = localStorage.getItem("fleet-theme");
  if (saved) document.documentElement.dataset.theme = saved;
  btn.onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("fleet-theme", next);
  };
}

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  render();
  $("#search").addEventListener("input", (e) => render(e.target.value));

  // Ask for notification permission, then surface the sample notification.
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().then(() => SAMPLE.notifications.forEach(toast));
  } else {
    SAMPLE.notifications.forEach(toast);
  }
});
