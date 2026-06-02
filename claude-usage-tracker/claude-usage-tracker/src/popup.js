const $ = (id) => document.getElementById(id);
const DEFAULTS = { amberAt: 70, redAt: 90, decimals: 2 };

function color(pct, s) {
  if (pct == null) return "#9ca3af";
  if (pct >= s.redAt) return "#ef4444";
  if (pct >= s.amberAt) return "#f59e0b";
  return "#3b82f6";
}
function fmt(pct, s) {
  if (pct == null) return "—";
  return pct.toFixed(Math.max(0, Math.min(4, s.decimals))) + "%";
}
function resetText(resets_at) {
  if (!resets_at) return "";
  const t = new Date(resets_at);
  if (isNaN(t)) return "";
  let ms = t.getTime() - Date.now();
  if (ms <= 0) return "resetting…";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  let rel;
  if (d > 0) rel = `${d}d ${h}h`;
  else if (h > 0) rel = `${h}h ${String(m).padStart(2, "0")}m`;
  else rel = `${m}m`;
  return "resets in " + rel + " · " + t.toLocaleString();
}
function paint(rowV, rowF, rowM, node, s) {
  const u = node && typeof node.utilization === "number" ? node.utilization : null;
  const pct = u == null ? null : Math.max(0, Math.min(100, u));
  $(rowV).textContent = fmt(u, s);
  $(rowV).style.color = color(u, s);
  $(rowF).style.width = (pct == null ? 0 : pct) + "%";
  $(rowF).style.background = color(u, s);
  $(rowM).textContent = node ? resetText(node.resets_at) : "";
}

chrome.storage.local.get(["cut_settings", "cut_last_usage"], (res) => {
  const s = Object.assign({}, DEFAULTS, res.cut_settings || {});
  const u = res.cut_last_usage;
  if (u) {
    paint("sv", "sf", "sm", u.five_hour, s);
    paint("wv", "wf", "wm", u.seven_day, s);
    if (u._at) $("foot").textContent = "Updated " + new Date(u._at).toLocaleTimeString();
  }
});

$("opts").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
