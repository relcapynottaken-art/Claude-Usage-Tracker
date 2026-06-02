/*
 * content.js  (isolated world)
 *
 * - Receives the learned usage endpoint/data from interceptor.js
 * - Polls that endpoint with credentials:'include' (your own session cookie,
 *   same-origin) on an interval so the bars update while you chat
 * - Renders two progress bars in/near the composer and an estimated token
 *   count in the header
 * - Persists the latest reading to chrome.storage.local so the toolbar popup
 *   can show it too
 *
 * Privacy: the only network request is a same-origin GET to YOUR usage
 * endpoint, authenticated by the cookie your browser already holds. No chat
 * content, and no data of any kind, is sent anywhere else.
 */
(function () {
  "use strict";

  const TAG = "__CUT_MSG__";
  const STORE_KEYS = {
    endpoint: "cut_endpoint",
    lastUsage: "cut_last_usage",
    settings: "cut_settings",
  };

  const DEFAULT_SETTINGS = {
    pollSeconds: 60, // how often to re-fetch usage (min enforced at 30)
    amberAt: 70, // >= this % -> amber
    redAt: 90, // >= this % -> red
    showTokens: true, // header token estimate on/off
    decimals: 2, // displayed precision (capped by what the API returns)
  };

  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let learnedEndpoint = null;
  let lastUsage = null; // { five_hour, seven_day, _at }
  let pollTimer = null;

  // ---------- storage helpers ----------
  function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [STORE_KEYS.endpoint, STORE_KEYS.settings, STORE_KEYS.lastUsage],
        (res) => {
          if (res[STORE_KEYS.settings]) {
            settings = Object.assign({}, DEFAULT_SETTINGS, res[STORE_KEYS.settings]);
          }
          if (res[STORE_KEYS.endpoint]) learnedEndpoint = res[STORE_KEYS.endpoint];
          if (res[STORE_KEYS.lastUsage]) lastUsage = res[STORE_KEYS.lastUsage];
          resolve();
        }
      );
    });
  }
  function saveEndpoint(url) {
    learnedEndpoint = url;
    chrome.storage.local.set({ [STORE_KEYS.endpoint]: url });
  }
  function saveUsage(u) {
    lastUsage = u;
    chrome.storage.local.set({ [STORE_KEYS.lastUsage]: u });
  }

  // React to settings changes from the options page without a reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORE_KEYS.settings]) {
      settings = Object.assign({}, DEFAULT_SETTINGS, changes[STORE_KEYS.settings].newValue || {});
      render();
      restartPolling();
    }
    if (changes[STORE_KEYS.endpoint]) {
      learnedEndpoint = changes[STORE_KEYS.endpoint].newValue || learnedEndpoint;
      poll();
    }
  });

  // ---------- learn endpoint from page traffic ----------
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d[TAG] !== true || d.kind !== "usage") return;
    if (d.url && d.url !== learnedEndpoint) saveEndpoint(d.url);
    if (d.data) ingestUsage(d.data);
  });

  // ---------- normalise + store a usage payload ----------
  function pickUtil(node) {
    if (!node || typeof node !== "object") return null;
    if (typeof node.utilization === "number") return node.utilization;
    return null;
  }
  function ingestUsage(data) {
    const u = {
      five_hour: {
        utilization: pickUtil(data.five_hour),
        resets_at: data.five_hour ? data.five_hour.resets_at : null,
      },
      seven_day: {
        utilization: pickUtil(data.seven_day),
        resets_at: data.seven_day ? data.seven_day.resets_at : null,
      },
      _at: Date.now(),
      _raw: data,
    };
    saveUsage(u);
    render();
  }

  // ---------- polling ----------
  async function poll() {
    if (!learnedEndpoint) return; // nothing to poll until we've learned it
    try {
      const res = await fetch(learnedEndpoint, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json, text/plain, */*" },
      });
      if (!res.ok) return;
      const json = await res.json();
      ingestUsage(json);
    } catch (_) {
      /* offline / transient — keep last reading */
    }
  }
  function restartPolling() {
    if (pollTimer) clearInterval(pollTimer);
    const secs = Math.max(30, Number(settings.pollSeconds) || 60);
    pollTimer = setInterval(poll, secs * 1000);
  }

  // ---------- token estimate ----------
  // No official browser tokenizer exists for current Claude models, so this is
  // an approximation (~1 token per 4 chars, blended with a per-word floor).
  function estimateTokens(text) {
    if (!text) return 0;
    const chars = text.length;
    const words = (text.trim().match(/\S+/g) || []).length;
    return Math.max(Math.round(chars / 4), Math.round(words * 1.33));
  }
  function currentConversationText() {
    // Best-effort: the rendered transcript plus whatever is typed in the box.
    const main = document.querySelector("main") || document.body;
    let text = main ? main.innerText || "" : "";
    const box = findComposer();
    if (box) {
      const typed = box.value !== undefined ? box.value : box.innerText || "";
      text += "\n" + typed;
    }
    return text;
  }

  // ---------- DOM anchoring ----------
  function findComposer() {
    // Heuristics that survive class-name churn: a large editable region.
    const ta = document.querySelector(
      'main textarea, textarea[enterkeyhint], div[contenteditable="true"][role="textbox"], div[contenteditable="true"]'
    );
    return ta;
  }
  function composerCard(box) {
    if (!box) return null;
    // Climb to the OUTERMOST composer wrapper (the rounded card), so we can
    // mount the bars as a sibling ABOVE it rather than inside the input area
    // (mounting inside caused the bars to overlap the placeholder/typed text).
    let el = box;
    let best = box;
    for (let i = 0; i < 10 && el.parentElement; i++) {
      el = el.parentElement;
      if (el === document.body || el.tagName === "MAIN") break;
      const w = el.clientWidth;
      if (w >= 360) best = el;
      // Stop once the parent is noticeably wider than this element, meaning
      // `el` is the card sitting inside a wider centred column.
      const pw = el.parentElement ? el.parentElement.clientWidth : w;
      if (w >= 360 && pw - w > 60) {
        best = el;
        break;
      }
    }
    return best;
  }
  function findHeaderHost() {
    return (
      document.querySelector('header') ||
      document.querySelector('[role="banner"]') ||
      document.querySelector("nav") ||
      null
    );
  }

  // ---------- rendering ----------
  function colorFor(pct) {
    if (pct == null) return "var(--cut-muted)";
    if (pct >= settings.redAt) return "var(--cut-red)";
    if (pct >= settings.amberAt) return "var(--cut-amber)";
    return "var(--cut-blue)";
  }
  function fmtPct(pct) {
    if (pct == null) return "—";
    const d = Math.max(0, Math.min(4, Number(settings.decimals) || 0));
    return pct.toFixed(d) + "%";
  }
  function resetTitle(label, resets_at) {
    if (!resets_at) return label;
    const t = new Date(resets_at);
    if (isNaN(t)) return label;
    return label + " · resets " + t.toLocaleString();
  }

  // Compact countdown until reset, e.g. "in 4h 09m", "in 2d 3h", "in 47s".
  // Returns "—" if unknown and "resetting…" if the moment has passed.
  function fmtCountdown(resets_at) {
    if (!resets_at) return "—";
    const t = new Date(resets_at);
    if (isNaN(t)) return "—";
    let ms = t.getTime() - Date.now();
    if (ms <= 0) return "resetting…";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `in ${d}d ${h}h`;
    if (h > 0) return `in ${h}h ${String(m).padStart(2, "0")}m`;
    if (m > 0) return `in ${m}m ${String(sec).padStart(2, "0")}s`;
    return `in ${sec}s`;
  }

  function ensureBars() {
    let bar = document.getElementById("cut-bars");

    if (!bar) {
      bar = document.createElement("div");
      bar.id = "cut-bars";
      bar.innerHTML = `
        <div class="cut-row" id="cut-row-session" title="5-hour session window">
          <span class="cut-label">Session</span>
          <div class="cut-track"><div class="cut-fill"></div></div>
          <span class="cut-val">—</span>
          <span class="cut-reset" id="cut-reset-session">—</span>
        </div>
        <div class="cut-row" id="cut-row-week" title="7-day weekly window">
          <span class="cut-label">Weekly</span>
          <div class="cut-track"><div class="cut-fill"></div></div>
          <span class="cut-val">—</span>
          <span class="cut-reset" id="cut-reset-week">—</span>
        </div>`;
    }

    // Pin the bars to the top of the viewport so they're always visible
    // without scrolling, independent of where the composer is.
    bar.classList.add("cut-pinned-top");
    if (bar.parentElement !== document.body) document.body.appendChild(bar);
    return bar;
  }

  function setRow(rowId, util, resets_at, label) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const fill = row.querySelector(".cut-fill");
    const val = row.querySelector(".cut-val");
    const reset = row.querySelector(".cut-reset");
    const pct = util == null ? null : Math.max(0, Math.min(100, util));
    fill.style.width = (pct == null ? 0 : pct) + "%";
    fill.style.background = colorFor(pct);
    val.textContent = fmtPct(util);
    val.style.color = colorFor(pct);
    if (reset) {
      reset.textContent = fmtCountdown(resets_at);
      reset.dataset.resetsAt = resets_at || "";
    }
    row.title = resetTitle(label, resets_at);
  }

  function ensureTokenBadge() {
    if (!settings.showTokens) {
      const ex = document.getElementById("cut-tokens");
      if (ex) ex.remove();
      return null;
    }
    let badge = document.getElementById("cut-tokens");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "cut-tokens";
      badge.title = "Estimated tokens in this conversation (approximate)";
      badge.textContent = "≈ … tok";
    }
    const host = findHeaderHost();
    if (host && badge.parentElement !== host) host.appendChild(badge);
    else if (!host && badge.parentElement !== document.body) {
      badge.classList.add("cut-floating-badge");
      document.body.appendChild(badge);
    }
    return badge;
  }

  function renderTokens() {
    const badge = ensureTokenBadge();
    if (!badge) return;
    const n = estimateTokens(currentConversationText());
    badge.textContent = "≈ " + n.toLocaleString() + " tok";
  }

  function render() {
    ensureBars();
    const u = lastUsage || { five_hour: {}, seven_day: {} };
    setRow("cut-row-session", u.five_hour && u.five_hour.utilization, u.five_hour && u.five_hour.resets_at, "5-hour session");
    setRow("cut-row-week", u.seven_day && u.seven_day.utilization, u.seven_day && u.seven_day.resets_at, "7-day weekly");
    renderTokens();
  }

  // ---------- keep mounted through SPA re-renders ----------
  let rafScheduled = false;
  function scheduleRender() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      render();
    });
  }

  function observe() {
    const mo = new MutationObserver(() => scheduleRender());
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", (e) => {
      const box = findComposer();
      if (box && (e.target === box || box.contains(e.target))) renderTokens();
    });
  }

  // ---------- live countdown ticker ----------
  // Updates only the two reset labels once per second (cheap), so the timers
  // tick down smoothly between the heavier usage polls.
  function tickCountdowns() {
    document.querySelectorAll("#cut-bars .cut-reset").forEach((el) => {
      el.textContent = fmtCountdown(el.dataset.resetsAt || "");
    });
  }

  // ---------- boot ----------
  (async function init() {
    await load();
    render();
    observe();
    restartPolling();
    poll(); // immediate attempt if we already know the endpoint
    setInterval(tickCountdowns, 1000);
  })();
})();
