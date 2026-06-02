# Claude Usage Tracker

> A privacy-first browser extension that shows your Claude session and weekly usage — right at the top of your screen — without digging through the settings page.

![Chrome](https://img.shields.io/badge/Chrome-supported-4285F4?logo=googlechrome&logoColor=white)
![Opera](https://img.shields.io/badge/Opera-supported-FF1B2D?logo=opera&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-supported-0078D7?logo=microsoftedge&logoColor=white)
![Brave](https://img.shields.io/badge/Brave-supported-FB542B?logo=brave&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![No data sent](https://img.shields.io/badge/data%20sent%20externally-none-brightgreen)

---

## What it does

A slim, always-visible strip pinned to the top of the page shows two live progress bars and a countdown timer:

| Bar | What it tracks |
|---|---|
| **Session** | Your rolling 5-hour message window |
| **Weekly** | Your rolling 7-day message quota |

Both bars change colour as you approach your limits — **blue → amber → red** — and each one shows:
- The exact utilisation percentage (e.g. `25.00%`)
- A live countdown to when that window resets (e.g. `in 3h 12m`, ticking every second)

A small estimated token counter (`≈ 4,200 tok`) also appears in the header for the current conversation.

The extension reads the same usage endpoint that powers Claude's own Settings page, using your existing logged-in session. **Nothing leaves your browser.**

---

## Install

This extension is not on the Chrome Web Store — load it directly from the source.

### Chrome · Edge · Brave · Arc
1. Download or clone this repo and unzip it
2. Go to `chrome://extensions`
3. Enable **Developer mode** (toggle, top-right)
4. Click **Load unpacked** → select the `claude-usage-tracker` folder
5. Navigate to [claude.ai](https://claude.ai)

### Opera
1. Download or clone this repo and unzip it
2. Go to `opera://extensions`
3. Enable **Developer mode** (toggle, top-right)
4. Click **Load unpacked** → select the `claude-usage-tracker` folder
5. Navigate to [claude.ai](https://claude.ai)

---

## One-time setup

The extension does **not** hard-code Claude's internal usage URL — it's account-specific and changes without notice. Instead, the extension learns it automatically by watching your own browser traffic.

**After installing, open `claude.ai → Settings → Usage` once.**

That's it. The extension captures the exact endpoint URL from that page visit and polls it from then on. You'll never need to touch Settings → Usage again unless you clear extension storage.

> **Tip:** If you open DevTools → Network on the Settings/Usage page, look for the request whose JSON response contains `five_hour` and `seven_day` — that's the URL the extension learns. You can also paste it manually in the extension's own Settings page if you prefer.

---

## How it works

The extension has two content scripts:

**`src/interceptor.js`** — runs in the page's MAIN world at document start. It monkey-patches `window.fetch` and `XMLHttpRequest` to silently observe responses that look like usage data (containing `five_hour`/`seven_day` fields). When it finds one, it forwards the URL and JSON to the content script via `postMessage`. It makes zero network requests of its own.

**`src/content.js`** — runs in the isolated extension world. It:
- receives the learned endpoint + data from the interceptor
- polls that endpoint on a configurable interval (default: every 60 seconds) using `credentials: "include"` so your existing session cookie authenticates it automatically
- renders and keeps the bar strip mounted as Claude's SPA re-renders
- ticks the countdown timers every second without re-fetching
- caches the latest reading in `chrome.storage.local` so the toolbar popup can show it too

---

## Privacy

| | |
|---|---|
| **Host permissions** | `claude.ai` only |
| **Network requests** | One same-origin GET to your own usage endpoint |
| **Chat content sent** | Never |
| **External servers** | None |
| **Analytics / telemetry** | None |
| **Storage** | `chrome.storage.local` — stays on your device |

The extension is read-only. It does not modify, intercept, or interfere with any Claude functionality.

---

## Settings

Click the extension icon → **Settings** (or right-click → Extension options):

| Setting | Default | Description |
|---|---|---|
| Refresh interval | 60s | How often to re-fetch usage (min 30s) |
| Amber threshold | 70% | Bar turns amber at or above this |
| Red threshold | 90% | Bar turns red at or above this |
| Decimal places | 2 | Digits shown after the decimal point |
| Token counter | On | Show/hide the `≈ N tok` header badge |
| Endpoint override | — | Paste a URL here to skip auto-detection |

---

## File structure

```
claude-usage-tracker/
├── manifest.json          # MV3 manifest (host: claude.ai only)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── interceptor.js     # MAIN-world fetch/XHR watcher
    ├── content.js         # Polls usage, renders bars + token count
    ├── content.css        # Injected styles for the bar strip
    ├── popup.html         # Toolbar popup
    ├── popup.js
    ├── options.html       # Settings page
    └── options.js
```

---

## Known limitations

**Decimal precision is capped by the API.** Claude's usage endpoint has been observed to return `utilization` as whole numbers (`35.0`, `6.0`). The UI will show the decimal places you configure, but can't recover precision the server doesn't send — so `35.00%` is the real value, not truncated.

**Free plan support is uncertain.** The `five_hour` / `seven_day` data shape is the Pro/Max subscription model. Free-tier accounts may get different or no fields; rows show `—` when their field is absent from the response.

**Token counter is an estimate.** There's no public in-browser tokenizer for current Claude models. The `≈` badge uses a character/word heuristic and should be treated as a rough guide, not an exact count.

**DOM selectors are heuristic.** Claude's front-end changes periodically. If the bar strip loses its anchor after an update, it falls back to a bottom-of-viewport position and keeps working. The selectors in `content.js` (`findComposer`, `findHeaderHost`) may need a small tweak after a major Claude UI change.

---

## Contributing

Issues and PRs welcome. A few useful starting points:

- **Better tokenizer** — plugging in a real BPE tokenizer (even a lightweight port) would make the token estimate accurate
- **Free plan field mapping** — if you're on a free account and can share (anonymised) what your usage endpoint returns, it would help confirm or fix free-plan support
- **Selector resilience** — if Claude's UI changes break the anchor, a PR with updated selectors is very welcome

---

## License

 Apache License

---

*This is an unofficial personal utility. It is not affiliated with or endorsed by Anthropic.*
