const SETTINGS_KEY = "cut_settings";
const ENDPOINT_KEY = "cut_endpoint";
const DEFAULTS = { pollSeconds: 60, amberAt: 70, redAt: 90, showTokens: true, decimals: 2 };

const $ = (id) => document.getElementById(id);

function restore() {
  chrome.storage.local.get([SETTINGS_KEY, ENDPOINT_KEY], (res) => {
    const s = Object.assign({}, DEFAULTS, res[SETTINGS_KEY] || {});
    $("showTokens").checked = !!s.showTokens;
    $("pollSeconds").value = s.pollSeconds;
    $("amberAt").value = s.amberAt;
    $("redAt").value = s.redAt;
    $("decimals").value = s.decimals;
    $("endpoint").value = res[ENDPOINT_KEY] || "";
  });
}

function save() {
  const s = {
    showTokens: $("showTokens").checked,
    pollSeconds: Math.max(30, parseInt($("pollSeconds").value, 10) || 60),
    amberAt: Math.min(100, Math.max(1, parseInt($("amberAt").value, 10) || 70)),
    redAt: Math.min(100, Math.max(1, parseInt($("redAt").value, 10) || 90)),
    decimals: Math.min(4, Math.max(0, parseInt($("decimals").value, 10) || 0)),
  };
  const ep = $("endpoint").value.trim();
  const toStore = { [SETTINGS_KEY]: s };
  if (ep) toStore[ENDPOINT_KEY] = ep;
  chrome.storage.local.set(toStore, () => {
    const tag = $("saved");
    tag.hidden = false;
    setTimeout(() => (tag.hidden = true), 1500);
  });
}

document.addEventListener("DOMContentLoaded", restore);
$("save").addEventListener("click", save);
