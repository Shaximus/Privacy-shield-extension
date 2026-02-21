# AIShield Security Patch Integration Guide

**For:** Gemini (workhorse)
**From:** Hannah (Claude) + Shax
**Date:** 2026-02-13
**Current Version:** 2.2.0
**Target Version:** 2.3.0

---

## TL;DR

Kimi audited AIShield ~1 month ago and produced 6 patch files. The codebase has evolved since then (now v2.2.0), so the patches can NOT be applied as-is. This document tells you exactly what to take from each patch, what's already done, and how to integrate without breaking existing functionality.

---

## PATCH STATUS OVERVIEW

| Patch File | Status | Action |
|-----------|--------|--------|
| `AIShield_PATCH_content-autoactivate.js` | **ALREADY APPLIED** | Skip entirely. Current `content-autoactivate.js` already uses safe DOM, no innerHTML. |
| `AIShield_PATCH_rules_malware.json` | **NEW - Apply** | Add as `rules/rules_malware.json` |
| `AIShield_PATCH_manifest.json` | **PARTIALLY OUTDATED** | Cherry-pick 3 additions into current manifest.json |
| `AIShield_PATCH_background.js` | **MERGE REQUIRED** | Extract security patterns, merge into existing background.js |
| `AIShield_PATCH_background_FIXED.js` | **USE INSTEAD OF ABOVE** | Better GHOSTPULSE detection (hash-based, not broad URL). Use this version's malware logic. |
| `AIShield_PATCH_cloudflare-worker.js` | **NEW - Deploy** | New server-side worker. Replace placeholder secrets before deploy. |

---

## STEP 1: Add Malware Blocking Rule

**Create file:** `rules/rules_malware.json`

```json
[
  {
    "id": 9001,
    "priority": 100,
    "action": {
      "type": "block"
    },
    "condition": {
      "urlFilter": "cdn.discordapp.com/attachments/265218620949266432",
      "resourceTypes": [
        "main_frame",
        "sub_frame",
        "script",
        "image",
        "xmlhttprequest",
        "other"
      ]
    }
  }
]
```

This blocks a specific Discord CDN attachment path used as a GHOSTPULSE malware C2 channel. It does NOT block general Discord uploads.

---

## STEP 2: Update manifest.json

The current manifest is v2.2.0. Kimi's patch manifest is v2.0.0 and is missing many current features (WAA detection, proper content script URLs, etc.). **Do NOT replace the manifest.** Instead, cherry-pick these 3 additions:

### 2a. Add `notifications` permission

Current permissions array:
```json
"permissions": [
  "cookies",
  "declarativeNetRequest",
  "declarativeNetRequestFeedback",
  "declarativeNetRequestWithHostAccess",
  "privacy",
  "storage",
  "tabs"
]
```

Add `"notifications"` to enable GHOSTPULSE block alerts:
```json
"permissions": [
  "cookies",
  "declarativeNetRequest",
  "declarativeNetRequestFeedback",
  "declarativeNetRequestWithHostAccess",
  "notifications",
  "privacy",
  "storage",
  "tabs"
]
```

### 2b. Add malware ruleset to declarative_net_request

Current `declarative_net_request` section:
```json
"declarative_net_request": {
  "rule_resources": [
    {
      "id": "ruleset_surveillance",
      "enabled": true,
      "path": "rules/blocklist.json"
    },
    {
      "id": "ruleset_google_headers",
      "enabled": true,
      "path": "rules/google_header_scrub.json"
    }
  ]
}
```

Add the malware ruleset:
```json
"declarative_net_request": {
  "rule_resources": [
    {
      "id": "ruleset_surveillance",
      "enabled": true,
      "path": "rules/blocklist.json"
    },
    {
      "id": "ruleset_google_headers",
      "enabled": true,
      "path": "rules/google_header_scrub.json"
    },
    {
      "id": "ruleset_malware_protection",
      "enabled": true,
      "path": "rules/rules_malware.json"
    }
  ]
}
```

### 2c. Add Content Security Policy

Add this to the manifest (currently missing):
```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; connect-src https://ai-shield-license.kingsley-w-m-curtis.workers.dev https://ai-shield-rules.kingsley-w-m-curtis.workers.dev https://reflexionsoftware.com https://www.reflexionsoftware.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'"
}
```

Note: Use the ACTUAL worker endpoints (not Kimi's placeholder `*.workers.dev`).

### 2d. Update version

Change `"version": "2.2.0"` to `"version": "2.3.0"`.

### 2e. Also update manifest_prod.json and manifest_firefox.json

Apply the same 3 changes (notifications permission, malware ruleset, CSP) to both variant manifests. For Firefox, the CSP syntax is the same in MV3.

---

## STEP 3: Merge Security Fixes into background.js

This is the biggest task. The current `background.js` (v2.1.0, 423 lines) has functionality the patches don't know about: WAA detection, site pause, strict mode, animated badge, diagnostics. **Do NOT replace background.js.** Merge these specific security patterns in:

### 3a. Add HMAC Signing Utility (top of file, after constants)

```javascript
// ── HMAC Signing (Security Patch P0-2) ──────────────────────────
async function generateHMAC(message, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### 3b. Harden License Verification (modify existing `verifyLicense` function)

The current function sends the license key as a GET request with an `X-License-Key` header. The patch upgrades this to POST with HMAC signing.

**Find the existing `verifyLicense` function** and replace it with:

```javascript
async function verifyLicense(licenseKey) {
  // Rate limiting (P2-3)
  const now = Date.now();
  if (now - lastVerifyTime < 5000) {
    return { error: true, message: 'Please wait before trying again' };
  }
  lastVerifyTime = now;

  // Format validation (P0-3)
  if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(licenseKey)) {
    return { error: true, message: 'Invalid license key format' };
  }

  try {
    const extId = await getOrCreateExtensionId();
    const timestamp = Date.now().toString();

    // HMAC signing (P0-2)
    const signaturePayload = `${licenseKey}:${extId}:${timestamp}`;
    const signature = await generateHMAC(signaturePayload, CLIENT_SECRET);

    const response = await fetch(LICENSE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-License-Key': licenseKey,
        'X-Extension-Id': extId,
        'X-Timestamp': timestamp,
        'X-Signature': signature
      },
      body: JSON.stringify({
        extensionId: extId,
        timestamp: timestamp,
        platform: 'chrome',
        version: '2.3.0'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.valid) {
      await chrome.storage.local.set({
        licenseKey: licenseKey,
        licenseType: data.type || 'premium',
        licenseExpires: data.expires || null,
        licenseVerified: Date.now()
      });
      await fetchPremiumRules(licenseKey, extId);
      return { success: true, type: data.type };
    } else {
      return { error: true, message: data.message || 'Invalid license key' };
    }
  } catch (error) {
    console.error('[AIShield] License verification failed:', error.message);
    return { error: true, message: 'Network error. Please try again.' };
  }
}
```

**Important:** You need to add a `CLIENT_SECRET` constant near the top of the file. For the Chrome Web Store build, this should be injected at build time or stored in a config that's .gitignored:

```javascript
// Build-time secret (do NOT commit to git)
const CLIENT_SECRET = 'REPLACE_AT_BUILD_TIME';
```

### 3c. Harden External Message Handler (P0-4)

**Find the existing `chrome.runtime.onMessageExternal.addListener`** and add exact origin validation:

```javascript
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  // Exact origin validation (P0-4) - no subdomain wildcards
  const ALLOWED_ORIGINS = [
    'https://reflexionsoftware.com',
    'https://www.reflexionsoftware.com',
    'https://reflexionsoftware.pages.dev'
  ];

  const senderOrigin = sender.origin || (sender.url ? new URL(sender.url).origin : '');

  if (!ALLOWED_ORIGINS.includes(senderOrigin)) {
    console.warn('[AIShield] Blocked external message from:', senderOrigin);
    sendResponse({ success: false, error: 'Unauthorized' });
    return false;
  }

  // ... rest of existing handler (activateLicense, checkStatus) unchanged ...
});
```

### 3d. Harden Stats Reporting (P1-2)

**Find the existing stats reporting function** and add HMAC signing:

```javascript
async function reportStats() {
  // ... existing stats gathering code ...

  try {
    const extId = await getOrCreateExtensionId();
    const timestamp = Date.now().toString();
    const payload = JSON.stringify({
      extensionId: extId,
      stats: stats,
      platform: 'chrome',
      timestamp: timestamp
    });

    const signature = await generateHMAC(payload, CLIENT_SECRET);

    await fetch(STATS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': timestamp
      },
      body: payload
    });
  } catch (e) {
    // Non-critical, silent fail
  }
}
```

### 3e. Add GHOSTPULSE Malware Detection + Alerting

Add this block near the bottom of background.js, before the `onInstalled` listener:

```javascript
// ── GHOSTPULSE Malware Detection (P3-1) ─────────────────────────
const MALWARE_LOG_KEY = 'malware_block_log';
const MALWARE_LOG_MAX = 1000;

// Known GHOSTPULSE indicators
const GHOSTPULSE_PATTERNS = [
  /cdn\.discordapp\.com\/attachments\/265218620949266432/i,
  /cdn\.discordapp\.com.*\.avif.*\?.*key=/i
];

async function logMalwareBlock(details) {
  const entry = {
    timestamp: new Date().toISOString(),
    url: details.url,
    tabId: details.tabId,
    type: details.type,
    ruleId: details.ruleId || 9001,
    malwareFamily: 'GHOSTPULSE',
    severity: 'critical'
  };

  const result = await chrome.storage.local.get(MALWARE_LOG_KEY);
  const logs = result[MALWARE_LOG_KEY] || [];
  logs.unshift(entry);
  if (logs.length > MALWARE_LOG_MAX) logs.length = MALWARE_LOG_MAX;
  await chrome.storage.local.set({ [MALWARE_LOG_KEY]: logs });

  // Desktop notification
  try {
    await chrome.notifications.create(`ghostpulse-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Malware Blocked: GHOSTPULSE',
      message: 'AIShield blocked a connection to a known GHOSTPULSE C2 server.',
      priority: 2,
      requireInteraction: true
    });
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 10000);
  } catch (e) {
    console.error('[AIShield] Notification failed:', e);
  }

  return entry;
}

// Hook into onRuleMatchedDebug if available
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  const existingListener = null; // preserve existing listener reference if needed

  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    // Existing blocked-request counter logic stays — add malware check:
    if (info.rule.ruleId === 9001) {
      logMalwareBlock({
        url: info.request.url,
        tabId: info.request.tabId,
        type: info.request.type,
        ruleId: 9001
      });
    }

    // ... existing totalBlocked counter logic stays here ...
  });
}

// Fallback: webRequest error listener for malware URLs
chrome.webRequest?.onErrorOccurred?.addListener((details) => {
  if (GHOSTPULSE_PATTERNS.some(p => p.test(details.url))) {
    logMalwareBlock({
      url: details.url,
      tabId: details.tabId,
      type: details.type,
      error: details.error
    });
  }
}, { urls: ['*://cdn.discordapp.com/*'] });
```

**Also add these message handlers** to the existing `chrome.runtime.onMessage` switch:

```javascript
case 'getMalwareLogs':
  chrome.storage.local.get(MALWARE_LOG_KEY).then(r => {
    sendResponse({ logs: r[MALWARE_LOG_KEY] || [] });
  });
  return true;

case 'clearMalwareLogs':
  chrome.storage.local.remove(MALWARE_LOG_KEY).then(() => {
    sendResponse({ success: true });
  });
  return true;
```

### 3f. IMPORTANT: Preserve Existing Functionality

Do NOT remove or modify:
- WAA detection logic (lines 38-99 in current file)
- Site pause system
- Strict Google Mode
- Animated badge/icon code
- getDiagnostics handler
- Existing blocked request counter

The patches from Kimi don't know about these features. They must stay intact.

---

## STEP 4: Harden Premium Rules Fetching (P1-1)

**Modify the existing `fetchPremiumRules` function** to verify rule signatures:

```javascript
async function fetchPremiumRules(licenseKey, extId) {
  try {
    const timestamp = Date.now().toString();
    const signature = await generateHMAC(
      `${licenseKey}:${extId}:${timestamp}`, CLIENT_SECRET
    );

    const response = await fetch(RULES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-License-Key': licenseKey,
        'X-Extension-Id': extId,
        'X-Timestamp': timestamp,
        'X-Signature': signature
      },
      body: JSON.stringify({ platform: 'chrome', version: '2.3.0' })
    });

    if (!response.ok) return;
    const data = await response.json();

    // Rule integrity verification (P1-1)
    if (data.rules && data.signature) {
      const expectedSig = await generateHMAC(
        JSON.stringify(data.rules), CLIENT_SECRET
      );
      if (data.signature !== expectedSig) {
        console.error('[AIShield] Rule signature mismatch — rules rejected');
        return;
      }
    }

    if (data.rules && data.rules.length > 0) {
      // Preserve WAA allow rule (ID 205) and malware rules (ID 9001+)
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const protectedIds = [205, 9001];
      const toRemove = existingRules
        .map(r => r.id)
        .filter(id => !protectedIds.includes(id));

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: toRemove,
        addRules: data.rules
      });
    }
  } catch (error) {
    console.error('[AIShield] Premium rules fetch failed:', error.message);
  }
}
```

---

## STEP 5: Deploy Cloudflare Worker

The file `AIShield_PATCH_cloudflare-worker.js` is a complete server-side rewrite. Before deploying:

### 5a. Replace Placeholder Secrets

The patch has `'your-license-secret-here'`, `'your-rules-signing-key'`, `'your-stats-secret-here'`. These must be set as Cloudflare Worker Secrets:

```bash
# In the worker project directory:
wrangler secret put LICENSE_SECRET
wrangler secret put RULES_SIGNING_KEY
wrangler secret put STATS_SECRET
```

Then reference them via `env.LICENSE_SECRET` etc. in the worker code (not hardcoded constants).

### 5b. Fix the Worker Code

Replace the hardcoded secret constants at the top with `env` references:

```javascript
// REMOVE these lines:
const LICENSE_SECRET = 'your-license-secret-here';
const RULES_SIGNING_KEY = 'your-rules-signing-key';
const STATS_SECRET = 'your-stats-secret-here';

// In each handler function, access secrets via env parameter:
// e.g., in handleLicenseVerify(request, clientIp, env)
//       use env.LICENSE_SECRET instead of LICENSE_SECRET
```

### 5c. Implement Database Functions

The worker has two placeholder functions:

```javascript
async function validateLicenseInDatabase(licenseKey, extensionId) {
  // TODO: Implement with D1 or KV
}

async function getPremiumRules() {
  // TODO: Load from KV
}
```

These need real implementations. The current live worker (`ai-shield-license.kingsley-w-m-curtis.workers.dev`) likely already has this logic. Port it into the new hardened worker structure.

### 5d. Update Endpoints

The current live endpoints are:
- `https://ai-shield-license.kingsley-w-m-curtis.workers.dev/verify-license`
- `https://ai-shield-rules.kingsley-w-m-curtis.workers.dev/report-stats`
- `https://ai-shield-rules.kingsley-w-m-curtis.workers.dev/rules`

The patched worker uses different routes:
- `/license/verify`
- `/stats/report`
- `/rules/fetch`

**Decision needed:** Either update the background.js endpoints to match the new routes, OR update the worker routes to match the existing endpoints. Pick one and be consistent.

### 5e. Keep Rate Limiting

The in-memory `Map()` rate limiter works for single-instance Workers but resets on cold starts. For production, consider Cloudflare Rate Limiting (built-in) or KV-based counters. The in-memory approach is fine as a starting point.

---

## STEP 6: Skip content-autoactivate.js

**No action needed.** The current file already uses safe DOM construction (createElement/textContent). Kimi's patch for this (P0-5 XSS fix) has already been applied.

Verify by checking the current file has NO `innerHTML` assignments. It shouldn't.

---

## STEP 7: Build & Test

### 7a. Test Checklist

- [ ] Extension loads without errors (chrome://extensions → "Errors" button)
- [ ] Popup opens and shows stats
- [ ] License key entry works (format validation fires on bad input)
- [ ] WAA detection still works (visit Google AI Studio API key page)
- [ ] Model swap detector still works on claude.ai
- [ ] Site pause still works (30s and 10min)
- [ ] Strict Google Mode toggle works
- [ ] Stats export (JSON) works
- [ ] `rules/rules_malware.json` loads (check `chrome.declarativeNetRequest.getEnabledRulesets()`)
- [ ] No `innerHTML` anywhere in the codebase (grep for it)
- [ ] CSP doesn't break popup or premium page

### 7b. Build

```bash
cd /home/shax/Projects/revenue/AIShield-main
bash build.sh
```

This creates `deploy/chrome/`, `deploy/firefox/`, `deploy/chrome-test/`.

---

## SECURITY FIXES SUMMARY (Kimi's Original Numbering)

| ID | Severity | Fix | Where |
|----|----------|-----|-------|
| P0-1 | Critical | Remove stack traces from error responses | Cloudflare Worker |
| P0-2 | Critical | HMAC-signed license verification | background.js + Worker |
| P0-3 | Critical | License key format validation | background.js (already partial in v2.2.0) |
| P0-4 | Critical | Exact origin validation for external messages | background.js |
| P0-5 | Critical | XSS via innerHTML → safe DOM | **ALREADY APPLIED** |
| P1-1 | High | Rule signature verification | background.js + Worker |
| P1-2 | High | HMAC-authenticated stats reporting | background.js + Worker |
| P1-5 | High | Rate limiting on license verification | background.js + Worker |
| P2-3 | Medium | Rate limiting cooldown UX | background.js |
| P3-1 | Low | GHOSTPULSE Discord CDN C2 blocking | rules_malware.json + background.js |

---

## FILES CHANGED (Summary for PR)

```
MODIFIED:
  manifest.json          +notifications perm, +malware ruleset, +CSP, version bump
  manifest_prod.json     same changes
  manifest_firefox.json  same changes
  background.js          +HMAC signing, +origin validation, +malware detection, +rule verification

NEW:
  rules/rules_malware.json   GHOSTPULSE C2 blocking rule

DEPLOY:
  cloudflare-worker.js       New hardened server-side worker (separate deploy)

UNCHANGED:
  content-autoactivate.js    Already patched
  model-swap-detector.js     No changes needed
  popup.html                 No changes needed
  popup.js                   No changes needed (optional: add malware log viewer)
  premium.html               No changes needed
  rules/blocklist.json       No changes needed
  rules/google_header_scrub.json  No changes needed
```

---

## OPTIONAL ENHANCEMENTS (If Time Permits)

1. **Popup malware log viewer** — Add a "Malware Blocks" section to popup.html/popup.js that calls `getMalwareLogs` and displays entries
2. **Ed25519 rule signing** — Replace HMAC rule verification with Ed25519 (asymmetric, more secure since the extension only needs the public key)
3. **Stripe webhook** — Instead of client-side license activation, have Stripe webhooks hit the Worker which provisions the license in D1
4. **CLIENT_SECRET build injection** — Use `build.sh` to replace the placeholder at build time from a `.env` file

---

*Generated by Hannah for Gemini. All patch source files are on Shax's Desktop. The main project is at `/home/shax/Projects/revenue/AIShield-main/`.*
