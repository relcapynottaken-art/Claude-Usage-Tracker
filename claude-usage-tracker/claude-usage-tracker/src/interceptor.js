/*
 * interceptor.js  (runs in the page's MAIN world, at document_start)
 *
 * Purpose: the extension must NOT guess Claude's internal usage URL (it changes
 * and is org-scoped). Instead we watch the requests the page itself makes. When
 * Claude's own code fetches its usage endpoint (e.g. when you open
 * Settings -> Usage), we capture the exact URL + JSON and hand it to the
 * isolated content script via window.postMessage.
 *
 * This script uses NO chrome.* APIs and sends NO network traffic of its own.
 * It only observes calls the page was already making.
 */
(function () {
  "use strict";
  const TAG = "__CUT_MSG__";
  const ORIGIN = window.location.origin;

  function looksLikeUsage(obj) {
    if (!obj || typeof obj !== "object") return false;
    return (
      "five_hour" in obj ||
      "seven_day" in obj ||
      ("utilization" in obj && "resets_at" in obj)
    );
  }

  function post(kind, payload) {
    try {
      window.postMessage(Object.assign({ [TAG]: true, kind }, payload), ORIGIN);
    } catch (_) {}
  }

  function maybeForward(url, text) {
    if (!url || !/usage/i.test(String(url))) return;
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      return;
    }
    if (looksLikeUsage(json)) {
      post("usage", { url: String(url), data: json });
    }
  }

  // ---- patch fetch ----
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      const url =
        input && typeof input === "object" && "url" in input ? input.url : input;
      const p = origFetch.apply(this, arguments);
      p.then((res) => {
        try {
          if (res && /usage/i.test(String(url))) {
            res
              .clone()
              .text()
              .then((t) => maybeForward(url, t))
              .catch(() => {});
          }
        } catch (_) {}
      }).catch(() => {});
      return p;
    };
  }

  // ---- patch XMLHttpRequest ----
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cut_url = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const xhr = this;
    xhr.addEventListener("load", function () {
      try {
        const rt = xhr.responseType;
        if (rt === "" || rt === "text") {
          maybeForward(xhr.__cut_url, xhr.responseText);
        } else if (rt === "json" && looksLikeUsage(xhr.response)) {
          post("usage", { url: String(xhr.__cut_url), data: xhr.response });
        }
      } catch (_) {}
    });
    return origSend.apply(this, arguments);
  };
})();
