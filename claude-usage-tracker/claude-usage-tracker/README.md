# Claude Usage Tracker (local-only)

Two slim progress bars in the message composer — **5-hour session** and **7-day
weekly** — that change colour blue → amber → red as you approach your limits,
plus an estimated **token counter** in the header. Everything runs locally; the
only network request is a same-origin read of *your own* usage data using the
session cookie your browser already has.

Works in Chrome and Opera (and other Chromium browsers: Edge, Brave, Arc).

---

## Install (unpacked)

### Chrome / Edge / Brave
1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** and select this `claude-usage-tracker` folder
4. Open `https://claude.ai`

### Opera
1. Go to `opera://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** and select this folder
4. Open `https://claude.ai`

> Opera can also install Chrome Web Store extensions via the "Install Chrome
> Extensions" add-on, but for a local build, *Load unpacked* is simplest.

---

## One-time setup: teach it your endpoint

The extension does **not** hard-code Claude's internal usage URL (it is
org-specific and changes over time). Instead it watches the request your own
browser makes:

1. After installing, open **claude.ai → Settings → Usage** once.
2. That page calls the usage endpoint; the extension captures the exact URL and
   from then on polls it in the background.

After that, the bars populate on any chat page and refresh on your chosen
interval. If you ever want to set the endpoint by hand, open the extension's
**Settings** page for instructions (DevTools → Network → find the response
containing `five_hour`/`seven_day` → paste its URL).

---

## How it works

- `src/interceptor.js` runs in the page and patches `fetch`/`XMLHttpRequest`
  only to *notice* when Claude requests its own usage data, then forwards the
  URL + JSON to the content script. It makes no requests of its own.
- `src/content.js` polls that learned endpoint with `credentials:"include"`
  (same-origin, so your existing cookie authenticates it), renders the bars and
  token estimate, and keeps them mounted as Claude's single-page app re-renders.
- The latest reading is cached in `chrome.storage.local` so the toolbar popup
  can show it too.

## Privacy

- Host permissions are limited to `claude.ai` only.
- The sole network call is a GET to your usage endpoint on claude.ai.
- No chat content — or anything else — is sent anywhere. There is no analytics,
  no remote server, no telemetry. All state lives in `chrome.storage.local`.

## Settings

Open via the toolbar popup → **Settings**:
- Refresh interval (min 30s)
- Amber / red thresholds (%)
- Decimal places
- Token counter on/off
- Manual endpoint override (advanced)

---

## Honest limitations (please read)

- **Decimals are capped by the source.** The usage API has been observed to
  return `utilization` as whole numbers (e.g. `35.0`). The UI shows the
  decimals you configure, but it cannot manufacture precision the API doesn't
  send — so you may see `35.00%`.
- **Free plan is not guaranteed.** The `five_hour`/`seven_day` shape is the
  Pro/Max subscription model. The free tier may expose different (or no) fields;
  the bars will show whatever your account actually returns, and a row reads
  `—` when its field is absent.
- **The token counter is an estimate.** There's no official in-browser
  tokenizer for current Claude models, so it approximates (~chars/4) and is
  marked with `≈`. Treat it as a ballpark, not the server's exact count.
- **DOM anchoring is heuristic.** Claude's interface changes; if the bars can't
  find the composer they pin to the bottom of the window instead, and the
  header badge falls back to a floating badge. Selectors in `content.js` may
  occasionally need a tweak after a Claude UI update.

This is a personal, local utility. It reads only data Claude already serves to
your browser and does not bypass or alter any limit — it just shows you where
you stand.
