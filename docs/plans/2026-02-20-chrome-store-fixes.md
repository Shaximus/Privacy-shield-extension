# Chrome Web Store Submission Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 27 code review and security review findings so AI Privacy Shield v3.2.0 passes Chrome Web Store review and counts every block in real time for production users.

**Architecture:** Keep `webRequest` for real-time block counting (the core UX). Add `getMatchedRules()` alarm-based polling for company-level breakdown. Fix double-counting, stale version strings, pause cleanup, and all security findings. Extract inline CSS for CSP hardening.

**Tech Stack:** Chrome MV3, declarativeNetRequest, chrome.alarms, AES-GCM, PBKDF2

---

## Task 1: Extract Inline CSS to popup.css

Remove `'unsafe-inline'` from CSP by moving all styles to an external stylesheet.

**Files:**
- Create: `popup.css`
- Modify: `popup.html` (remove `<style>` block, add `<link>`)
- Modify: `manifest.json`, `manifest_prod.json`, `manifest_firefox.json` (CSP: remove `'unsafe-inline'`)

**Step 1:** Extract the entire `<style>...</style>` block from `popup.html` (lines 7-261) into a new file `popup.css`.

**Step 2:** Replace the `<style>` block in `popup.html` with:
```html
<link rel="stylesheet" href="popup.css">
```

**Step 3:** In all 3 manifests, change CSP `style-src 'self' 'unsafe-inline'` to `style-src 'self'`.

**Step 4:** Verify — load extension unpacked, open popup, confirm all styles render correctly.

**Commit:** `fix: extract inline CSS to popup.css, remove unsafe-inline from CSP`

---

## Task 2: Fix All Three Manifests

**Files:**
- Modify: `manifest.json`
- Modify: `manifest_prod.json`
- Modify: `manifest_firefox.json`

**Step 1: Remove `privacy` permission** from all 3 manifests. It's declared but never used. Chrome reviewers flag unused permissions.

**Step 2: Fix dev manifest CSP** — In `manifest.json` only, change `connect-src` from:
```
connect-src https://ai-shield-license.kingsley-w-m-curtis.workers.dev https://ai-shield-rules.kingsley-w-m-curtis.workers.dev https://reflexionsoftware.com https://www.reflexionsoftware.com
```
to:
```
connect-src https://api.reflexionsoftware.com https://reflexionsoftware.com https://www.reflexionsoftware.com
```
(Matches prod manifest. The old worker URLs are dead.)

**Step 3: Tighten `externally_connectable`** — In all 3 manifests, remove the wildcard pages.dev entry:
```json
"externally_connectable": {
    "matches": [
        "https://reflexionsoftware.com/*",
        "https://*.reflexionsoftware.com/*"
    ]
}
```
(Any Cloudflare Pages preview deployment could message the extension with the wildcard.)

**Step 4:** Keep `webRequest` — it's needed for real-time block counting. We will write Chrome Store justification notes in Task 8.

**Step 5:** Keep `http://*/*` in host_permissions — trackers exist on HTTP sites too.

**Step 6:** Keep `alarms` — we'll use it in Tasks 3 and 4.

**Step 7:** Verify — load extension, confirm no permission errors in console.

**Commit:** `fix: remove unused permissions, fix dev CSP, tighten externally_connectable`

---

## Task 3: Production Block Counter (CRITICAL)

The core fix. Currently `onRuleMatchedDebug` (dev-only) is the primary counter. Production users see zero blocks. Fix: use `onErrorOccurred` as the single real-time counter, add `getMatchedRules()` polling for company breakdown.

**Files:**
- Modify: `background.js`

**Step 1: Add version constant and alarm-based polling at the top of background.js** (after the ENDPOINT_PROVIDERS section, around line 80):

```js
// === VERSION ===
const EXTENSION_VERSION = '3.2.0';

// === BLOCK COUNTER POLLING (Production) ===
// getMatchedRules provides rule-ID-to-company mapping in production
// where onRuleMatchedDebug is not available
const MATCHED_RULES_POLL_ALARM = 'poll-matched-rules';
const MATCHED_RULES_POLL_INTERVAL = 1; // minutes (minimum for packed extensions)
let lastMatchedRulesTimestamp = Date.now();
```

**Step 2: Add the matched rules polling function** (after the `reportStats` function):

```js
// === MATCHED RULES POLLING (Company breakdown for production) ===
async function pollMatchedRules() {
  try {
    if (!browserAPI.declarativeNetRequest.getMatchedRules) return;

    const result = await browserAPI.declarativeNetRequest.getMatchedRules({
      minTimeStamp: lastMatchedRulesTimestamp
    });
    lastMatchedRulesTimestamp = Date.now();

    if (!result || !result.rulesMatchedInfo || result.rulesMatchedInfo.length === 0) return;

    const stats = await getStats();
    stats.blockedByRule = stats.blockedByRule || {};

    for (const match of result.rulesMatchedInfo) {
      const ruleId = match.rule.ruleId;
      stats.blockedByRule[ruleId] = (stats.blockedByRule[ruleId] || 0) + 1;
    }

    await browserAPI.storage.local.set({ stats });
  } catch (e) {
    // getMatchedRules may throw if rate-limited; non-critical
    console.warn('[AIShield] getMatchedRules poll error:', e.message);
  }
}
```

**Step 3: Refactor the `onRuleMatchedDebug` listener** — remove stats counting, keep only malware detection:

```js
// === TRACK BLOCKED REQUESTS & MALWARE ===
// Dev-only: onRuleMatchedDebug for malware detection and detailed diagnostics
if (browserAPI.declarativeNetRequest.onRuleMatchedDebug) {
  browserAPI.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    try {
      // Malware Check only — stats handled by onErrorOccurred
      if (info.rule.ruleId === 9001) {
        logMalwareBlock({
          url: info.request.url,
          tabId: info.request.tabId,
          type: info.request.type,
          ruleId: 9001
        });
      }
    } catch (e) { /* Non-critical */ }
  });
}
```

**Step 4: Refactor the `onErrorOccurred` listener** — this is now the SINGLE source of truth for block counting (works in both dev and production):

```js
// Production + Dev: onErrorOccurred is the PRIMARY block counter
// Fires for every declarativeNetRequest block (ERR_BLOCKED_BY_CLIENT)
if (browserAPI.webRequest && browserAPI.webRequest.onErrorOccurred) {
  browserAPI.webRequest.onErrorOccurred.addListener(async (details) => {
    // GHOSTPULSE malware detection
    if (GHOSTPULSE_PATTERNS.some(p => p.test(details.url))) {
      logMalwareBlock({
        url: details.url,
        tabId: details.tabId,
        type: details.type,
        error: details.error
      });
    }

    // Count ALL blocks (single source of truth — no double counting)
    if (details.error === 'net::ERR_BLOCKED_BY_CLIENT') {
      try {
        const s = await getStats();
        s.totalBlocked = (s.totalBlocked || 0) + 1;
        if (details.url) {
          try {
            const domain = new URL(details.url).hostname;
            s.blockedByDomain = s.blockedByDomain || {};
            s.blockedByDomain[domain] = (s.blockedByDomain[domain] || 0) + 1;
          } catch (e) {}
        }
        await browserAPI.storage.local.set({ stats: s });

        const diag = await getDiagnostics();
        diag.endpointsBlocked = (diag.endpointsBlocked || 0) + 1;
        await browserAPI.storage.local.set({ diagnostics: diag });

        pulseIcon();
        browserAPI.runtime.sendMessage({ action: 'blockOccurred' }).catch(() => {});
      } catch (e) {}
    }
  }, { urls: ['<all_urls>'] });
}
```

**Step 5: Set up alarms in the onInstalled listener and add alarm handler:**

In the `onInstalled` listener, add:
```js
// Set up matched rules polling alarm
browserAPI.alarms.create(MATCHED_RULES_POLL_ALARM, { periodInMinutes: MATCHED_RULES_POLL_INTERVAL });
```

Add alarm listener (before the INIT section):
```js
// === ALARM HANDLERS ===
browserAPI.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === MATCHED_RULES_POLL_ALARM) {
    await pollMatchedRules();
  } else if (alarm.name.startsWith('unpause-')) {
    const domain = alarm.name.replace('unpause-', '');
    await unpauseSite(domain);
  }
});
```

**Step 6: Also set up the alarm on service worker startup** (not just onInstalled, since alarms persist but it's good practice):

Add after `restoreCachedRulesOnStartup()`:
```js
// Ensure polling alarm exists (persists across SW restarts, but re-create on startup as safety net)
browserAPI.alarms.get(MATCHED_RULES_POLL_ALARM, (alarm) => {
  if (!alarm) {
    browserAPI.alarms.create(MATCHED_RULES_POLL_ALARM, { periodInMinutes: MATCHED_RULES_POLL_INTERVAL });
  }
});
```

**Step 7:** Replace all `version: '3.0.0'` in background.js with `version: EXTENSION_VERSION` (lines 293 and 407).

**Verify:** Load unpacked. Browse to a site with trackers. Confirm:
- Block counter increments in real time (within 1 second)
- Company breakdown populates
- Icon pulses on blocks
- No double counting (compare old stats vs new)

**Commit:** `feat: production block counter via onErrorOccurred + getMatchedRules polling`

---

## Task 4: Fix Pause System (Alarms Instead of setTimeout)

`setTimeout` in a MV3 service worker dies when the worker is killed (idle timeout ~30s). Pauses up to 10 minutes need `chrome.alarms`.

**Files:**
- Modify: `background.js`

**Step 1:** Replace the `pauseSite` function:

```js
async function pauseSite(domain, duration) {
  const until = Date.now() + duration;
  const result = await browserAPI.storage.local.get(['pausedSites']);
  const paused = result.pausedSites || {};
  paused[domain] = until;
  await browserAPI.storage.local.set({ pausedSites: paused });

  // Use alarm instead of setTimeout (survives SW restart)
  await browserAPI.alarms.create(`unpause-${domain}`, { delayInMinutes: duration / 60000 });

  return { success: true, domain, until };
}
```

**Step 2:** The alarm handler was already added in Task 3 Step 5. Verify `unpause-` prefix handling is present.

**Step 3:** Verify — pause a site for 30s, close the popup, wait 30s, reopen popup, confirm pause cleared.

**Commit:** `fix: use chrome.alarms for pause cleanup instead of setTimeout`

---

## Task 5: Fix Miscellaneous Bugs

**Files:**
- Modify: `background.js`
- Modify: `popup.js`

**Step 1: Fix VERIFY_FIRST handler** — In `fetchPremiumRules`, change the VERIFY_FIRST handler to actually re-verify:

```js
if (data.code === 'VERIFY_FIRST') {
  console.warn('[AIShield] Server says verify first — re-verifying');
  await verifyLicense(licenseKey);
  return;
}
```

**Step 2: Fix license expiry check** — In the `getLicenseStatus` message handler, add expiry check:

```js
case 'getLicenseStatus':
  browserAPI.storage.local.get(['licenseKey', 'licenseType', 'licenseVerified', 'licenseExpires'])
    .then(data => {
      const expired = data.licenseExpires && Date.now() > data.licenseExpires;
      sendResponse({
        valid: !!data.licenseKey && !expired,
        licensed: !!data.licenseKey && !expired,
        type: data.licenseType || 'none',
        verified: data.licenseVerified || null,
        expired: !!expired
      });
    });
  return true;
```

**Step 3: Fix Report Tracker URL** — In `popup.js`, change:
```js
browserAPI.tabs.create({ url: 'https://github.com/anthropics/claude-code/issues' });
```
to:
```js
browserAPI.tabs.create({ url: 'https://reflexionsoftware.com/report-tracker' });
```

**Step 4: Fix export version** — In `popup.js`, change:
```js
const data = { timestamp: new Date().toISOString(), version: '2.3.0', stats, diagnostics: diag };
```
to:
```js
const version = browserAPI.runtime.getManifest().version;
const data = { timestamp: new Date().toISOString(), version, stats, diagnostics: diag };
```

**Step 5: Fix pauseSite crash on non-HTTP tabs** — In `popup.js`, replace the pauseSite function:

```js
function pauseSite(durationMs, label) {
    browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].url) return;
        let domain;
        try {
            const parsed = new URL(tabs[0].url);
            if (!['https:', 'http:'].includes(parsed.protocol)) {
                alert('Pause is not available on this page.');
                return;
            }
            domain = parsed.hostname;
            if (!domain) return;
        } catch (e) { return; }
        browserAPI.runtime.sendMessage({ action: 'pauseSite', domain, duration: durationMs }, (response) => {
            if (response && response.success) alert(`Paused on ${domain} for ${label}`);
        });
    });
}
```

**Step 6: Fix stats privacy** — In `reportStats`, don't send `blockedByDomain` (user browsing behavior):

```js
async function reportStats(stats) {
  const now = Date.now();
  if (now - lastStatsReport < STATS_INTERVAL) return;
  lastStatsReport = now;

  try {
    const extId = await getExtensionId();
    await fetchWithFailover('stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extensionId: extId,
        totalBlocked: stats.totalBlocked || 0,
        platform: 'chrome',
        version: EXTENSION_VERSION,
        timestamp: Date.now().toString()
      })
    });
  } catch (e) { /* Non-critical */ }
}
```

**Step 7: Bump version** to `3.2.0` in all 3 manifests.

**Step 8: Fix the background.js header comment** from `v2.3.0` to `v3.2.0`.

**Verify:** Load unpacked. Test each fix:
- Click "Report New Tracker" → opens reflexionsoftware.com/report-tracker
- Export logs → JSON has version "3.2.0"
- Open popup on chrome://extensions → Pause shows "not available" instead of crashing
- License expiry check (if testable)

**Commit:** `fix: version strings, pause crash, report URL, license expiry, stats privacy`

---

## Task 6: Security Hardening

**Files:**
- Modify: `background.js` (PBKDF2 salt)
- Modify: `model-swap-detector.js` (reader, domain matching)
- Modify: `meta-fingerprint-shield.js` (canvas size guard)

**Step 1: Fix PBKDF2 hardcoded salt** — In `decryptRules`, use `ruleSalt` as the PBKDF2 salt instead of a constant:

```js
async function decryptRules(payload, iv, licenseKey, ruleSalt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(licenseKey),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(ruleSalt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const encryptedBytes = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    encryptedBytes
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}
```

**IMPORTANT:** This changes the key derivation. The server-side encryption MUST be updated to match — derive the key from `licenseKey` as key material with `ruleSalt` as PBKDF2 salt (not `licenseKey + ruleSalt` as key material with a constant salt). Coordinate with the Cloudflare Worker update.

**Step 2: Fix stream reader leak** — In `model-swap-detector.js`, wrap the reader loop in try/finally:

```js
// Read and check the response for model
try {
  let returnedModel = null;

  if (contentType.includes('text/event-stream')) {
    const reader = clone.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (buffer.length < 10000) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        returnedModel = extractModelFromStream(buffer);
        if (returnedModel) break;
      }
    } finally {
      reader.cancel().catch(() => {});
    }
```

**Step 3: Fix domain matching** — In `model-swap-detector.js`, change:
```js
const isAIPlatform = AI_DOMAINS.some(d => currentHost.includes(d));
```
to:
```js
const isAIPlatform = AI_DOMAINS.some(d => currentHost === d || currentHost.endsWith('.' + d));
```

**Step 4: Add canvas size guard** — In `meta-fingerprint-shield.js`, modify `addCanvasNoise`:

```js
function addCanvasNoise(canvas) {
    // Only add noise to small canvases (likely fingerprint, not visible content)
    // Skip large canvases that are probably rendering real UI
    if (canvas.width > 400 || canvas.height > 400) return;
    if (canvas.width === 0 || canvas.height === 0) return;

    try {
      const ctx = originalGetContext.call(canvas, '2d');
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < 10; i++) {
        const idx = (Math.floor(Math.random() * (data.length / 4)) * 4) + 3;
        data[idx] = data[idx] ^ 1;
      }
      ctx.putImageData(imageData, 0, 0);
    } catch (e) { /* Canvas may be tainted */ }
}
```

**Verify:** Load unpacked. Visit meta.ai, check for visual artifacts on large canvases. Visit claude.ai, check model swap detector doesn't match on unrelated domains.

**Commit:** `security: fix PBKDF2 salt, stream reader leak, domain matching, canvas guard`

---

## Task 7: Icon Reset on Service Worker Startup

**Files:**
- Modify: `background.js`

**Step 1:** Add icon reset at the top of `restoreCachedRulesOnStartup()`:

```js
async function restoreCachedRulesOnStartup() {
  // Reset icon to clean state (may have frozen mid-animation if SW was killed)
  try {
    browserAPI.action.setIcon({ path: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' } });
  } catch (e) {}

  try {
    const stored = await browserAPI.storage.local.get(['licenseKey', 'licenseType']);
    // ... rest of function unchanged
```

**Commit:** `fix: reset icon on service worker startup to prevent frozen animation frame`

---

## Task 8: Chrome Web Store Preparation

**Files:**
- Create: `CHROME_STORE_REVIEW_NOTES.md`
- Verify: `PRIVACY_POLICY.md`

**Step 1:** Create `CHROME_STORE_REVIEW_NOTES.md` with justification for sensitive permissions:

```markdown
# Chrome Web Store Review Notes

## Permission Justifications

### webRequest
Used for `webRequest.onErrorOccurred` to count blocked surveillance requests in real time.
The extension uses `declarativeNetRequest` for actual blocking — `webRequest` is read-only
observation of block results. This is the standard pattern for privacy extensions that need
to report blocking statistics to users (similar to uBlock Origin, Privacy Badger, Ghostery).
No request modification occurs via webRequest.

### declarativeNetRequest + declarativeNetRequestFeedback + declarativeNetRequestWithHostAccess
Core functionality: blocks 216+ AI surveillance trackers using static and dynamic rule sets.
`declarativeNetRequestFeedback` is used for `getMatchedRules()` to provide per-company
blocking statistics in the popup UI.

### host_permissions: https://*/* and http://*/*
AI surveillance trackers (Google Analytics, Segment, Statsig, Datadog, etc.) appear on
any website. The extension must observe and block these requests regardless of which
site the user visits. This is standard for tracker-blocking extensions.

### cookies
Used for "Strict Google Mode" feature — deletes known tracking cookies (_ga, _gid, _gcl,
_fbp, _fbc, NID) when the user explicitly enables strict mode via the popup toggle.

### Content Scripts (MAIN world)
- model-swap-detector.js: Intercepts fetch/XHR on AI platforms (Claude, ChatGPT, Gemini,
  Grok) to verify the AI model returned matches the model requested. Must run in MAIN
  world to intercept page-level fetch calls before the platform's own code processes them.
  Only reads the `model` field from request/response bodies.
- meta-fingerprint-shield.js: Blocks device fingerprinting on meta.ai by neutralizing
  canvas fingerprinting and blocking fingerprint cookies. Must run in MAIN world to
  intercept the page's canvas API calls.

### Data Collection
The extension reports only aggregate total blocked count to the server (no per-domain
data, no URLs, no browsing history). See PRIVACY_POLICY.md for full disclosure.
```

**Step 2:** Review `PRIVACY_POLICY.md` and ensure it accurately describes:
- What data is collected (aggregate stats only, no per-domain)
- What is stored locally (license key, stats, diagnostics, malware logs)
- What is sent to server (extensionId, totalBlocked, platform, version)

**Commit:** `docs: Chrome Web Store review justification notes`

---

## Summary of Changes by File

| File | Changes |
|------|---------|
| `popup.html` | Remove `<style>` block, add `<link>` to popup.css |
| `popup.css` | NEW — all styles extracted from popup.html |
| `popup.js` | Fix report URL, export version, pauseSite crash |
| `background.js` | Production counter, alarm-based pause, version constant, PBKDF2 fix, stats privacy, VERIFY_FIRST fix, license expiry, icon reset |
| `model-swap-detector.js` | Reader try/finally, domain matching fix |
| `meta-fingerprint-shield.js` | Canvas size guard |
| `manifest.json` | CSP fix, remove privacy, tighten externally_connectable, bump 3.2.0 |
| `manifest_prod.json` | Remove privacy, tighten externally_connectable, bump 3.2.0 |
| `manifest_firefox.json` | Remove privacy, tighten externally_connectable, bump 3.2.0 |
| `CHROME_STORE_REVIEW_NOTES.md` | NEW — reviewer justification |

## Issues NOT Fixed (Deferred / Server-Side)

These require server-side changes or are low priority:

| Issue | Reason Deferred |
|-------|-----------------|
| License key stored plaintext in storage | Requires session token architecture — server change |
| License key in URL query param | Requires Stripe redirect flow change — server change |
| HMAC signing mismatch (worker vs client) | Need to verify live server matches worker code |
| Worker sends plaintext, client expects encrypted | Need to verify live server behavior |
| CORS `*` on worker | Server-side fix |
| Worker mock license validation | Server-side fix |
| Model alias false positives | Needs alias mapping research — separate task |
| Strict mode cookies re-set after deletion | Needs `cookies.onChanged` listener — separate enhancement |
