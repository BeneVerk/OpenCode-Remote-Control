// Volatile-only: fetch live each load, no localStorage / persistent client cache.
const API = "";

// R1: HTML-escape every field interpolated from /api/sessions before it touches the DOM.
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function load() {
  try {
    const resp = await fetch(`${API}/api/sessions`);
    const sessions = await resp.json();
    document.getElementById("count").textContent = sessions.length;
    const active = sessions.filter((s) => s.status === "online");
    const history = sessions.filter((s) => s.status !== "online");
    document.getElementById("active-list").innerHTML =
      active.map(cardHtml).join("") || "<p class='muted'>No active sessions.</p>";
    document.getElementById("history-list").innerHTML =
      history.map(cardHtml).join("") || "<p class='muted'>No history.</p>";
  } catch (e) {
    document.getElementById("active-list").innerHTML =
      `<p style="color:var(--red)">Error: ${esc(e.message)}</p>`;
  }
}

function cardHtml(s) {
  const b64 = btoa(s.project_path || "/");
  const url = `/${encodeURIComponent(b64)}/session/${encodeURIComponent(s.id)}`;
  const time = new Date(s.updated_at).toLocaleString();
  return `<a class="card" href="${esc(url)}">
    <span class="title">${esc(s.title || s.id)}</span>
    <span class="status ${esc(s.status)}">${esc(s.status)}</span>
    <span class="time">${esc(time)}</span>
  </a>`;
}

load();
setInterval(load, 10000); // auto-refresh every 10s
