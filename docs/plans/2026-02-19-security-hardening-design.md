# AI Privacy Shield — Full Fortress Security Hardening

**Date:** 2026-02-19
**Author:** Hannah (Claude Code)
**Approved by:** Shax
**Approach:** Big Bang — all changes ship at once
**Current state:** 1 user (lifetime key, testing), no public customers yet

---

## CONTEXT FOR FUTURE HANNAH

If you're reading this after a compaction: this is the complete implementation guide for hardening the AI Privacy Shield extension and its Cloudflare Workers against competitor cloning. A security audit found 4 critical, 4 high, and 3 medium vulnerabilities. Shax approved the "full fortress" approach — everything ships at once.

**The core problem:** The extension's 216 surveillance blocking rules are the product's IP. Currently they're served as plaintext JSON from the Cloudflare worker, visible in DevTools, and extractable via Chrome's `getDynamicRules()` API. We're closing every hole we can.

**Key files:**
- Extension: `/home/shax/Projects/revenue/AIShield-main/`
  - `background.js` — main extension logic, rule fetching, license verification
  - `manifest_prod.json` — Chrome production manifest
  - `manifest_firefox.json` — Firefox manifest
  - `popup.js` — popup UI
  - `build.sh` — build pipeline
- Workers: `/home/shax/Projects/revenue/`
  - `ai-shield-stats-worker.js` — rules delivery + stats (deployed as `ai-shield-stats`)
  - `ai-shield-license-updated.js` — license verification + Stripe webhooks (deployed as `ai-shield-license`)
  - `wrangler-license.toml` — wrangler config for license worker

**Worker URLs (current — will change to proxy):**
- Rules: `https://ai-shield-stats.kingsley-w-m-curtis.workers.dev` (also aliased as `ai-shield-rules`)
- License: `https://ai-shield-license.kingsley-w-m-curtis.workers.dev`

**One test user:** Shax's friend with a lifetime key. Will redownload after changes.

---

## WHAT TO IMPLEMENT (11 Changes)

### FIX 1: Kill `/reveal-key` or Gate Behind Email OTP
**File:** `ai-shield-license-updated.js` lines 168-196
**Severity:** CRITICAL-4
**Current behavior:** POST to `/reveal-key` with `{"email":"anyone@example.com"}` returns full unmasked license keys. No verification that the requester owns the email.
**Fix:** Remove the endpoint entirely. The `/recover` endpoint (lines 134-166) already exists and returns MASKED keys (`ABCDE-*****-*****-PQRST`), which is sufficient. If full key recovery is needed later, implement email OTP verification.
**Implementation:**
```javascript
// DELETE lines 168-196 entirely (the /reveal-key handler)
// The /recover endpoint at lines 134-166 stays — it returns masked keys
```

### FIX 2: `crypto.getRandomValues()` for License Key Generation
**File:** `ai-shield-license-updated.js` lines 434-444
**Severity:** HIGH-3
**Current behavior:** Uses `Math.random()` which is not cryptographically secure.
**Fix:** Replace with `crypto.getRandomValues()`:
```javascript
function generateLicenseKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let key = "";
  for (let i = 0; i < 20; i++) {
    if (i > 0 && i % 5 === 0) key += "-";
    key += chars[bytes[i] % chars.length];
  }
  return key;
}
```
Note: `bytes[i] % 32` has zero modulo bias since 256 % 32 = 0.

### FIX 3: Strip License Key from Webhook Response
**File:** `ai-shield-license-updated.js` lines 300-305
**Severity:** MEDIUM-3
**Current behavior:** Stripe webhook response includes `licenseKey` and `email` in JSON body. Stripe ignores this but may log it.
**Fix:**
```javascript
// Change lines 301-305 from:
return new Response(JSON.stringify({
  received: true,
  licenseKey,
  email: customerEmail
}), { headers: corsHeaders });

// To:
return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
```

### FIX 4: POST-Only on `/verify-license`
**File:** `ai-shield-license-updated.js` line 344
**Severity:** HIGH-4
**Current behavior:** Accepts any HTTP method (GET, POST, PUT, etc.)
**Fix:**
```javascript
// Change line 344 from:
if (url.pathname === "/verify-license") {

// To:
if (url.pathname === "/verify-license" && request.method === "POST") {
```
Also update the extension's `verifyLicense()` — it already sends POST (line 247 of background.js), so no change needed there. But verify the CORS preflight still works (it does — OPTIONS is handled on line 67).

### FIX 5: Verify Signature on `/report-stats` + Cap Block Counts
**File:** `ai-shield-stats-worker.js` lines 371-395
**Severity:** HIGH-2
**Current behavior:** Accepts any `extensionId` and `stats` payload without signature verification. Global stats can be inflated arbitrarily.
**Fix:**
1. Add `X-Signature` to the CORS allowed headers (line 249 — already NOT listed)
2. In the `/report-stats` handler, verify the HMAC signature against the server secret
3. Cap `totalBlocked` per report to a sane max (10,000)
4. Validate `extensionId` format (UUID pattern)

```javascript
// In /report-stats handler, add before processing:
const signature = request.headers.get("X-Signature");
const timestamp = request.headers.get("X-Timestamp");
const extId = body.extensionId;

// Verify signature: HMAC-SHA256 of extensionId:timestamp with SERVER_SECRET
if (!signature || !timestamp) {
  return errorResponse(corsHeaders, 401, "Missing authentication");
}
const payload = `${extId}:${timestamp}`;
const expectedSig = await generateHMAC(payload, env.SERVER_SECRET);
if (signature !== expectedSig) {
  return errorResponse(corsHeaders, 403, "Invalid signature");
}

// Cap stats
if (body.stats && body.stats.totalBlocked > 10000) {
  body.stats.totalBlocked = 10000;
}
```

**Note:** This requires a `SERVER_SECRET` environment variable on the worker AND the same secret in the extension. Since we're removing CLIENT_SECRET and moving to encrypted rule delivery (Fix 7), this signature can use a DIFFERENT secret that's only for stats authentication — or we can skip stats signature verification entirely since stats inflation is a lower priority than rule protection. **Decision: Skip stats signature for now, just add the cap on totalBlocked.** The stats are internal anyway.

**Simplified fix:**
```javascript
// Just cap the stats, validate extensionId format
if (!body.extensionId || !/^[a-f0-9-]{36}$/.test(body.extensionId)) {
  return errorResponse(corsHeaders, 400, "Invalid extension ID");
}
if (body.stats && typeof body.stats.totalBlocked === 'number') {
  body.stats.totalBlocked = Math.min(body.stats.totalBlocked, 10000);
}
```

### FIX 6: Migrate Rate Limiting to KV
**Files:** Both workers
**Severity:** HIGH-1
**Current behavior:** In-memory `Map()` per isolate. Each Cloudflare edge location has independent counters. Rate limiting is theater.
**Fix:** Use Cloudflare KV with expiring keys for rate limit state:

```javascript
async function checkRateLimit(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const minute = Math.floor(Date.now() / 60000); // current minute bucket
  const key = `rl:${ip}:${minute}`;

  const current = parseInt(await env.AI_SHIELD_DATA.get(key)) || 0;
  if (current >= RATE_LIMIT) return false;

  // Increment (eventual consistency is fine for rate limiting)
  await env.AI_SHIELD_DATA.put(key, String(current + 1), { expirationTtl: 120 });
  return true;
}
```

**Requirements:**
- Stats worker already has `AI_SHIELD_DATA` KV namespace bound
- License worker needs a KV namespace bound too (check `wrangler-license.toml`)
- Remove the in-memory `rateLimitMap` and `pruneRateLimits()` functions

**For license worker:** Check if it has a KV binding. If not, we need to add one via `wrangler-license.toml` or create a new KV namespace.

### FIX 7: Encrypted Rule Delivery (The Big One)
**Files:** `ai-shield-stats-worker.js` (server) + `background.js` (client)
**Severity:** CRITICAL-1 + CRITICAL-2
**Current behavior:** Worker sends `{ rules: FULL_RULES, rulesCount: 216 }` as plaintext JSON. Extension reads it directly.

**New behavior:** Worker encrypts rules with AES-256-GCM using a key derived from the license key + a server-side secret. Extension decrypts using the same derivation.

**Why this works:** The encryption key is derived from `licenseKey + serverSecret`. The license key is known to both sides (user entered it). The server secret never leaves the worker. An attacker intercepting the response gets ciphertext. To decrypt, they'd need to reverse-engineer the key derivation from the minified extension code AND know the server secret (which they can't get — it's a Worker environment variable).

**Yes, a determined reverse-engineer can extract the derivation logic from the extension code.** But they still need the server secret. And if they have a valid license key, they can already use getDynamicRules() in DevTools. The point is to prevent CASUAL extraction (curl the endpoint, copy the JSON). This raises the bar from "trivial" to "serious reverse engineering effort."

**Server side (stats worker):**
```javascript
// Environment variable: SERVER_SECRET (set via wrangler secret)

async function encryptRules(rules, licenseKey, serverSecret) {
  // Derive encryption key from licenseKey + serverSecret
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(licenseKey + serverSecret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("ai-shield-rules-v1"),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(rules))
  );

  return {
    payload: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
    version: "2.0"
  };
}

// In the /rules handler, replace the plaintext response:
const encrypted = await encryptRules(FULL_RULES, licenseKey, env.SERVER_SECRET);
return new Response(JSON.stringify({
  ...encrypted,
  rulesCount: FULL_RULES.length,
  lastUpdated: new Date().toISOString(),
  licenseType: license.type
}), { headers: corsHeaders });
```

**Client side (background.js):**
```javascript
async function decryptRules(payload, iv, licenseKey) {
  // Same derivation as server
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(licenseKey + await getServerSalt()),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("ai-shield-rules-v1"),
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

**THE CATCH — The server secret:** The extension needs to know the server secret to derive the same key. But we can't embed it directly (that's the CLIENT_SECRET problem all over again).

**Solution:** Split the derivation. The server secret stays on the server. The extension gets a per-session derivation salt from the license verification response. Flow:

1. Extension calls `/verify-license` with license key
2. Server responds with `{ valid: true, ..., ruleSalt: <random-per-session> }`
3. Server stores `ruleSalt` in KV alongside the license
4. Extension uses `licenseKey + ruleSalt` to derive the decryption key
5. Server uses the same `licenseKey + ruleSalt` to encrypt
6. `ruleSalt` rotates on each verification (every 24h)

This way: no shared secret in the extension code. The salt is ephemeral and license-specific. An attacker would need both a valid license AND to intercept the verification response to get the salt — and even then, the salt changes every 24 hours.

**Updated flow:**

```
Extension                           License Worker              Rules Worker
   |                                     |                          |
   |-- POST /verify-license ------------>|                          |
   |   (X-License-Key: XXXXX)           |                          |
   |                                     |-- generate ruleSalt      |
   |                                     |-- store in KV            |
   |<-- { valid:true, ruleSalt:"..." } --|                          |
   |                                     |                          |
   |-- GET /rules ------------------------------------------------>|
   |   (X-License-Key: XXXXX)           |                          |
   |                                     |           |-- lookup license in KV
   |                                     |           |-- get ruleSalt from KV
   |                                     |           |-- encrypt with key(licenseKey+ruleSalt)
   |<-- { payload:"...", iv:"..." } ----|-----------|
   |                                     |                          |
   |-- decrypt with key(licenseKey+ruleSalt)                        |
   |-- updateDynamicRules(decryptedRules)                           |
```

**IMPORTANT:** Both workers need access to the same KV namespace (LICENSES) so the rules worker can read the ruleSalt that the license worker wrote. Check if they share a KV binding.

**Remove from background.js:**
- `CLIENT_SECRET` constant (line 47)
- `generateHMAC()` function
- All HMAC signature generation logic in `verifyLicense()` and `fetchPremiumRules()`

**Remove from build.sh:**
- The `sed` command that injects CLIENT_SECRET (lines 50-53, 81-84)

### FIX 8: API Proxy Through reflexionsoftware.com
**New file:** A new Cloudflare Worker that acts as an API proxy
**Affects:** `background.js` endpoints, `manifest_prod.json` CSP, `manifest_firefox.json` CSP

**Current behavior:** Extension calls `ai-shield-license.kingsley-w-m-curtis.workers.dev` and `ai-shield-rules.kingsley-w-m-curtis.workers.dev` directly. Worker hostnames visible in manifest CSP and background.js source.

**New behavior:** Extension calls `api.reflexionsoftware.com/license/*` and `api.reflexionsoftware.com/rules/*`. A thin proxy worker on the `reflexionsoftware.com` zone routes to the actual workers.

**Proxy worker (new file: `ai-shield-proxy-worker.js`):**
```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Route /license/* → license worker
    if (url.pathname.startsWith('/license/')) {
      const targetPath = url.pathname.replace('/license', '');
      const target = `https://ai-shield-license.kingsley-w-m-curtis.workers.dev${targetPath}`;
      return fetch(new Request(target, request));
    }

    // Route /rules/* → stats/rules worker
    if (url.pathname.startsWith('/rules/')) {
      const targetPath = url.pathname.replace('/rules', '');
      const target = `https://ai-shield-stats.kingsley-w-m-curtis.workers.dev${targetPath}`;
      return fetch(new Request(target, request));
    }

    return new Response("Not found", { status: 404 });
  }
};
```

**Setup:**
1. In Cloudflare dashboard for `reflexionsoftware.com` zone
2. Add DNS record: `api` → Workers route (or use `wrangler deploy` with routes config)
3. Configure wrangler.toml with route: `api.reflexionsoftware.com/*`

**Update background.js:**
```javascript
const LICENSE_ENDPOINT = 'https://api.reflexionsoftware.com/license/verify-license';
const RULES_ENDPOINT = 'https://api.reflexionsoftware.com/rules/rules';
const STATS_ENDPOINT = 'https://api.reflexionsoftware.com/rules/report-stats';
```

**Update manifests (CSP connect-src):**
Replace all `*.workers.dev` URLs with `https://api.reflexionsoftware.com`.

### FIX 9: Rule Watermarking Per License Key
**File:** `ai-shield-stats-worker.js` (rules endpoint)
**New capability:** Each license gets 2-3 unique canary rules mixed into their rule set.

**Implementation:**
```javascript
function generateCanaryRules(licenseKey) {
  // Deterministic hash of license key → stable canary rules per key
  // Uses DJB2 hash (fast, deterministic, sufficient for this purpose)
  let hash = 5381;
  for (let i = 0; i < licenseKey.length; i++) {
    hash = ((hash << 5) + hash) + licenseKey.charCodeAt(i);
    hash = hash & 0x7FFFFFFF; // keep positive
  }

  // Generate 3 canary rules from the hash
  const canaries = [];
  for (let i = 0; i < 3; i++) {
    const canaryHash = ((hash * (i + 7)) & 0x7FFFFFFF).toString(36);
    canaries.push({
      id: 9000 + i, // high ID range, won't collide with real rules
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: `||canary-${canaryHash}.reflexionsoftware.com`,
        resourceTypes: ["xmlhttprequest"]
      }
    });
  }

  return canaries;
}

// In the rules endpoint, before encrypting:
const canaries = generateCanaryRules(licenseKey);
const watermarkedRules = [...FULL_RULES, ...canaries];
const encrypted = await encryptRules(watermarkedRules, licenseKey, ruleSalt);
```

**Detection:** Set up a wildcard DNS record for `*.reflexionsoftware.com` that logs requests. If a canary domain gets hit, reverse the hash to find which license key generated it. Or simpler: maintain a lookup table in KV mapping canary hashes to license keys.

**Store canary mapping:**
```javascript
// When generating canaries, also store the mapping
for (const canary of canaries) {
  const domain = canary.condition.urlFilter.replace('||', '').replace('*', '');
  await env.AI_SHIELD_DATA.put(`canary:${domain}`, licenseKey);
}
```

### FIX 10: Remove CLIENT_SECRET Infrastructure
**Files:** `background.js`, `build.sh`
**Why:** CLIENT_SECRET is the old HMAC scheme. With encrypted rule delivery (Fix 7) using per-session salts, it's no longer needed. Remove it entirely to eliminate the attack surface.

**background.js changes:**
- Delete `const CLIENT_SECRET = 'REPLACE_AT_BUILD_TIME';` (line 47)
- Delete `generateHMAC()` function
- Remove all HMAC signature generation from `verifyLicense()`, `fetchPremiumRules()`, and stats reporting
- Simplify `verifyLicense()` to just POST the license key + extensionId, receive back `{ valid, ruleSalt }`
- Simplify `fetchPremiumRules()` to GET /rules with license key header, receive encrypted payload, decrypt with licenseKey + stored ruleSalt

**build.sh changes:**
- Remove `sed -i "s/REPLACE_AT_BUILD_TIME/$CLIENT_SECRET/g"` lines (51, 82)
- Remove the CLIENT_SECRET loading from .env (lines 11-21)
- Simplify build output (no more warnings about missing CLIENT_SECRET)

### FIX 11: Update CORS Headers on Both Workers
**Files:** Both workers
**Why:** After proxying through `api.reflexionsoftware.com`, the CORS origin checking needs to allow the proxy origin AND still allow direct chrome-extension:// origins.

**Stats worker** `getCorsHeaders()`:
- Add `https://api.reflexionsoftware.com` to ALLOWED_ORIGINS
- Keep `chrome-extension://` and `moz-extension://` patterns

**License worker** `getCorsHeaders()`:
- Same changes

---

## IMPLEMENTATION ORDER

Even though this is a big bang deploy, implement in this order to minimize broken intermediate states:

1. **FIX 1** — Kill `/reveal-key` (license worker)
2. **FIX 2** — `crypto.getRandomValues()` (license worker)
3. **FIX 3** — Strip webhook response (license worker)
4. **FIX 4** — POST-only verify (license worker)
5. **FIX 5** — Cap stats + validate extensionId (stats worker)
6. **FIX 6** — KV rate limiting (both workers)
7. **FIX 8** — API proxy worker (new worker + DNS)
8. **FIX 7** — Encrypted rule delivery (both workers + extension) — depends on FIX 8 for endpoint URLs
9. **FIX 9** — Watermarking (stats worker) — depends on FIX 7 encryption being in place
10. **FIX 10** — Remove CLIENT_SECRET (extension + build.sh) — depends on FIX 7 replacing it
11. **FIX 11** — CORS updates (both workers) — depends on FIX 8 proxy being live

## DEPLOYMENT ORDER

1. Deploy license worker first (Fixes 1-4, 6)
2. Deploy stats worker (Fixes 5-6, 7, 9)
3. Deploy proxy worker + DNS (Fix 8)
4. Rebuild extension (Fixes 7, 10, 11 — new endpoints, encryption, no CLIENT_SECRET)
5. Deploy extension zips to reflexionsoftware.com
6. Deploy stats worker to Cloudflare
7. Tell Shax's friend to redownload

## TESTING CHECKLIST

After all changes:
- [ ] License verification works (POST to /verify-license returns valid + ruleSalt)
- [ ] Rules endpoint returns encrypted payload (not plaintext JSON)
- [ ] Extension successfully decrypts and loads rules
- [ ] Popup shows correct rule count (216+)
- [ ] Block counter increments on tracker blocks
- [ ] Animated icon pulses on blocks
- [ ] /reveal-key returns 404
- [ ] /recover returns masked keys
- [ ] Webhook creates license without leaking key in response
- [ ] Stats reporting works with capped values
- [ ] Rate limiting persists across edge locations (test from multiple IPs if possible)
- [ ] api.reflexionsoftware.com/license/* proxies correctly
- [ ] api.reflexionsoftware.com/rules/* proxies correctly
- [ ] Canary rules appear in getDynamicRules() output (3 extra rules per license)
- [ ] Extension zip does NOT contain blocklist.json
- [ ] Extension code does NOT contain CLIENT_SECRET or REPLACE_AT_BUILD_TIME
- [ ] curl to /rules without valid license returns 401
- [ ] curl to /rules with valid license returns encrypted (not plaintext) payload

## ENVIRONMENT VARIABLES NEEDED

**Stats worker (ai-shield-stats):**
- `SERVER_SECRET` — new, for rule encryption key derivation (generate with `openssl rand -hex 32`)

**License worker (ai-shield-license):**
- Already has: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Needs shared KV access to write `ruleSalt` that stats worker can read

**Proxy worker (new):**
- No secrets needed — pure proxy

## KV NAMESPACE REQUIREMENTS

Both license and stats workers need access to the same `LICENSES` KV namespace to share the `ruleSalt`. Check current bindings:
- Stats worker binds `AI_SHIELD_DATA` — may need to also bind `LICENSES`
- License worker binds `LICENSES`
- The `ruleSalt` should be stored in the `LICENSES` namespace alongside the license data

**Simplest approach:** Store `ruleSalt` as a field in the license JSON object itself:
```json
{
  "key": "XXXXX-XXXXX-XXXXX-XXXXX",
  "email": "user@example.com",
  "type": "lifetime",
  "ruleSalt": "a1b2c3d4e5f6...",
  "ruleSaltCreated": 1708300000000,
  ...
}
```
Then both workers just read/write the license object from `LICENSES` KV. No new bindings needed IF the stats worker already has `LICENSES` bound. **Check this.**
