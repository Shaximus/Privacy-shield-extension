/**
 * AIShield Background Service Worker v3.3.2
 *
 * Security Hardened:
 * - Encrypted rule delivery (AES-GCM + PBKDF2)
 * - Matched Rules Polling (block counting + company breakdown)
 * - Strict Origin Validation
 * - Multi-provider endpoint failover
 * - Alarm-based pause cleanup (survives SW restart)
 * - Production block counter via getMatchedRules() polling
 * - Company-level breakdown from matched rule IDs
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// === VERSION ===
const EXTENSION_VERSION = '3.3.2';

// === Animated Icon (pulse on block) - Full 145 frame animation ===
const iconFrames = [];
for (let i = 0; i < 145; i++) {
  const frameNum = String(i).padStart(3, '0');
  iconFrames.push({ path: `animated-icons/frame_${frameNum}.png` });
}

let iconAnimationRunning = false;
let iconFrameIndex = 0;
let iconAnimationInterval = null;
const BLOCK_START_FRAME = 50;

function runIconToCompletion() {
  // Play from current frame through to frame 144, then stop
  if (iconAnimationInterval) return; // Already playing
  iconAnimationRunning = true;
  browserAPI.storage.local.set({ _sw_iconAnimationRunning: true });
  iconAnimationInterval = setInterval(() => {
    browserAPI.action.setIcon(iconFrames[iconFrameIndex]);
    iconFrameIndex++;
    if (iconFrameIndex >= iconFrames.length) {
      // Animation complete — stop and reset to frame 0
      clearInterval(iconAnimationInterval);
      iconAnimationInterval = null;
      iconAnimationRunning = false;
      iconFrameIndex = 0;
      browserAPI.action.setIcon({ path: 'animated-icons/frame_000.png' });
      browserAPI.storage.local.set({ _sw_iconAnimationRunning: false });
    }
  }, 41.67); // 24fps
}

function pulseIcon() {
  // Every block: kill current animation, snap to frame 50, play to completion
  if (iconAnimationInterval) {
    clearInterval(iconAnimationInterval);
    iconAnimationInterval = null;
  }
  iconFrameIndex = BLOCK_START_FRAME;
  runIconToCompletion();
}

// === ENDPOINTS (v3.2 — multi-provider failover) ===
// Primary: Cloudflare proxy. Fallbacks added as infrastructure scales.
const ENDPOINT_PROVIDERS = [
  { base: 'https://api.reflexionsoftware.com', license: '/license/verify-license', stats: '/rules/report-stats', rules: '/rules/rules' }
  // Future fallbacks:
  // { base: 'https://api.rfxn.is', license: '/license/verify-license', stats: '/rules/report-stats', rules: '/rules/rules' },
  // { base: 'https://shield-api.deno.dev', license: '/verify-license', stats: '/report-stats', rules: '/rules' },
];

// Active endpoints (resolved from first healthy provider)
let LICENSE_ENDPOINT = ENDPOINT_PROVIDERS[0].base + ENDPOINT_PROVIDERS[0].license;
let STATS_ENDPOINT = ENDPOINT_PROVIDERS[0].base + ENDPOINT_PROVIDERS[0].stats;
let RULES_ENDPOINT = ENDPOINT_PROVIDERS[0].base + ENDPOINT_PROVIDERS[0].rules;

// Failover: try each provider until one responds
async function fetchWithFailover(endpointKey, options) {
  for (const provider of ENDPOINT_PROVIDERS) {
    const url = provider.base + provider[endpointKey];
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
      if (response.ok || response.status === 401 || response.status === 402 || response.status === 403 || response.status === 429) {
        return response; // Real response (server is alive, even if auth/rate/device-limit error)
      }
    } catch (e) {
      console.warn(`[AIShield] Provider ${provider.base} failed:`, e.message);
    }
  }
  throw new Error('All providers unreachable');
}

// Security: Exact origin whitelist
const ALLOWED_ORIGINS = [
  'https://reflexionsoftware.com',
  'https://www.reflexionsoftware.com',
  'https://reflexionsoftware.pages.dev',
  'https://api.reflexionsoftware.com'
];

// License key format: XXXXX-XXXXX-XXXXX-XXXXX
const LICENSE_KEY_REGEX = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

// Rate limiting
const VERIFY_COOLDOWN = 5000;
const STATS_INTERVAL = 1728000; // ~30 minutes — ~50 reports/day for steady stats counter
const RULES_FETCH_COOLDOWN = 10800000; // 3 hours — rules rarely change, cached rules work offline

// Block counter polling
const MATCHED_RULES_POLL_ALARM = 'poll-matched-rules';
const MATCHED_RULES_POLL_INTERVAL = 1; // minutes
let lastMatchedRulesTimestamp = Date.now();

// State (persisted to chrome.storage.local to survive SW restart)
let lastVerifyAttempt = 0;
let lastStatsReport = 0;
let lastRulesFetch = 0;
let extensionId = null;

// === SERVICE WORKER STATE PERSISTENCE ===
// Restore in-memory state from storage on SW startup
async function restoreServiceWorkerState() {
  try {
    const stored = await browserAPI.storage.local.get([
      '_sw_iconAnimationRunning',
      '_sw_lastMatchedRulesTimestamp',
      '_sw_lastVerifyAttempt',
      '_sw_lastStatsReport',
      '_sw_lastRulesFetch'
    ]);
    if (stored._sw_lastMatchedRulesTimestamp !== undefined) lastMatchedRulesTimestamp = stored._sw_lastMatchedRulesTimestamp;
    if (stored._sw_lastVerifyAttempt !== undefined) lastVerifyAttempt = stored._sw_lastVerifyAttempt;
    if (stored._sw_lastStatsReport !== undefined) lastStatsReport = stored._sw_lastStatsReport;
    if (stored._sw_lastRulesFetch !== undefined) lastRulesFetch = stored._sw_lastRulesFetch;

    // If animation was running when SW was killed, reset to idle
    if (stored._sw_iconAnimationRunning) {
      iconAnimationRunning = false;
      iconFrameIndex = 0;
      browserAPI.storage.local.set({ _sw_iconAnimationRunning: false });
      browserAPI.action.setIcon({ path: 'animated-icons/frame_000.png' });
    }

    console.log('[AIShield] Service worker state restored from storage');
  } catch (e) {
    console.warn('[AIShield] Could not restore SW state:', e.message);
  }
}

// Run state restoration immediately on SW startup
restoreServiceWorkerState();

// === ENCRYPTED RULE DECRYPTION ===
async function decryptRules(payload, iv, licenseKey, ruleSalt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(licenseKey + ruleSalt),
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

// === SMART WAA DETECTION ===
const WAA_RULE_ID = 100000;
const WAA_KEY_PATTERNS = [
  /^https:\/\/aistudio\.google\.com\/(app\/)?apikey/,
  /^https:\/\/makersuite\.google\.com\/(app\/)?apikey/,
  /^https:\/\/ai\.google\.dev\/(app\/)?apikey/
];
let waaActiveTabs = new Set();

async function updateWaaRule() {
  try {
    await browserAPI.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [WAA_RULE_ID] });
  } catch (e) { /* ok */ }
  if (waaActiveTabs.size === 0) return;
  await browserAPI.declarativeNetRequest.updateDynamicRules({
    addRules: [{
      id: WAA_RULE_ID,
      priority: 1000000,
      action: { type: 'allow' },
      condition: {
        urlFilter: '*waa-pa.clients6.google.com*',
        tabIds: [...waaActiveTabs],
        resourceTypes: ['xmlhttprequest', 'other', 'ping']
      }
    }]
  });
}

function isKeyCreationPage(url) {
  return WAA_KEY_PATTERNS.some(p => p.test(url));
}

async function scanExistingTabsForKeyPages() {
  try {
    const tabs = await browserAPI.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && isKeyCreationPage(tab.url)) {
        waaActiveTabs.add(tab.id);
      }
    }
    if (waaActiveTabs.size > 0) updateWaaRule();
  } catch (e) { /* ok */ }
}

browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // WAA detection on URL change
  if (changeInfo.url) {
    const wasActive = waaActiveTabs.has(tabId);
    const isActive = isKeyCreationPage(changeInfo.url);
    if (isActive && !wasActive) {
      waaActiveTabs.add(tabId);
      updateWaaRule();
    } else if (!isActive && wasActive) {
      waaActiveTabs.delete(tabId);
      updateWaaRule();
    }
  }

  // Poll block count on any page load complete — wakes SW on refresh/navigation
  if (changeInfo.status === 'complete' && !_debugActive) {
    pollMatchedRules();
  }
});

browserAPI.tabs.onRemoved.addListener((tabId) => {
  if (waaActiveTabs.delete(tabId)) updateWaaRule();
});

// === EXTENSION ID ===
function generateExtensionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'ext_' + crypto.randomUUID().replace(/-/g, '');
  }
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return 'ext_' + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function getExtensionId() {
  if (extensionId) return extensionId;
  const result = await browserAPI.storage.local.get('extensionId');
  if (result.extensionId) {
    extensionId = result.extensionId;
  } else {
    extensionId = generateExtensionId();
    await browserAPI.storage.local.set({ extensionId });
  }
  return extensionId;
}


// === LICENSE VERIFICATION ===
function validateLicenseKeyFormat(key) {
  return LICENSE_KEY_REGEX.test(key);
}

async function verifyLicense(licenseKey) {
  const now = Date.now();
  if (now - lastVerifyAttempt < VERIFY_COOLDOWN) {
    return {
      error: true,
      message: `Please wait ${Math.ceil((VERIFY_COOLDOWN - (now - lastVerifyAttempt)) / 1000)} seconds`
    };
  }
  lastVerifyAttempt = now;
  browserAPI.storage.local.set({ _sw_lastVerifyAttempt: now });

  if (!validateLicenseKeyFormat(licenseKey)) {
    return { error: true, message: 'Invalid license key format.' };
  }

  try {
    const extId = await getExtensionId();

    const response = await fetchWithFailover('license', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-License-Key': licenseKey,
        'X-Extension-Id': extId
      },
      body: JSON.stringify({
        extensionId: extId,
        platform: 'chrome',
        version: EXTENSION_VERSION
      })
    });

    const data = await response.json();

    // Handle device limit error (403)
    if (response.status === 403 && data.devicesUsed !== undefined) {
      console.warn('[AIShield] Device limit reached:', data.devicesUsed + '/' + data.devicesAllowed);
      await browserAPI.storage.local.set({
        deviceLimitError: {
          error: data.error,
          devicesUsed: data.devicesUsed,
          devicesAllowed: data.devicesAllowed,
          timestamp: Date.now()
        }
      });
      return {
        error: true,
        message: data.error || 'Device limit reached. Maximum ' + (data.devicesAllowed || 3) + ' devices per license.',
        deviceLimit: true,
        devicesUsed: data.devicesUsed,
        devicesAllowed: data.devicesAllowed
      };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data.error || 'Unknown error'}`);
    }

    if (data.valid || data.active) {
      // Clear any previous device limit error on successful verification
      await browserAPI.storage.local.remove('deviceLimitError');
      await browserAPI.storage.local.set({
        licenseKey: licenseKey,
        licenseType: data.type || 'premium',
        licenseExpires: data.expires || null,
        licenseVerified: Date.now(),
        ruleSalt: data.ruleSalt || null
      });
      await fetchPremiumRules(licenseKey, extId, 1);
      return { success: true, type: data.type };
    } else {
      return { error: true, message: data.message || 'Invalid license key' };
    }
  } catch (error) {
    console.error('[AIShield] License verification failed:', error.message);
    return { error: true, message: 'Network error. Please try again.' };
  }
}

// === RULE CACHE (Survives worker outages) ===
const RULE_CACHE_KEY = 'ruleCache';
const RULE_CACHE_FRESH_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 days — use silently
const RULE_CACHE_STALE_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days — use with warning

async function computeRulesHash(rulesJson) {
  const encoded = new TextEncoder().encode(rulesJson);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function cacheEncryptedRules(payload, iv, ruleSalt, decryptedRulesJson) {
  const cacheEntry = {
    payload,
    iv,
    ruleSalt,
    cachedAt: Date.now(),
    refreshedAt: Date.now()
  };
  // Store integrity hash if decrypted JSON provided
  if (decryptedRulesJson) {
    cacheEntry.integrityHash = await computeRulesHash(decryptedRulesJson);
  }
  await browserAPI.storage.local.set({ [RULE_CACHE_KEY]: cacheEntry });
  console.log('[AIShield] Rules cached for offline use');
}

async function loadCachedRules(licenseKey) {
  const result = await browserAPI.storage.local.get([RULE_CACHE_KEY]);
  const cache = result[RULE_CACHE_KEY];
  if (!cache || !cache.payload || !cache.iv || !cache.ruleSalt) return null;

  const age = Date.now() - cache.cachedAt;

  if (age > RULE_CACHE_STALE_TTL) {
    console.warn('[AIShield] Rule cache expired (>30 days). Rules unavailable offline.');
    return null;
  }

  try {
    const rules = await decryptRules(cache.payload, cache.iv, licenseKey, cache.ruleSalt);
    if (rules && rules.length > 0) {
      // Verify integrity hash if present
      if (cache.integrityHash) {
        const currentHash = await computeRulesHash(JSON.stringify(rules));
        if (currentHash !== cache.integrityHash) {
          console.error('[AIShield] Cache integrity check failed — discarding corrupted cache');
          await browserAPI.storage.local.remove(RULE_CACHE_KEY);
          return null;
        }
      }
      if (age > RULE_CACHE_FRESH_TTL) {
        console.warn('[AIShield] Using stale cached rules (>7 days). Will refresh when server available.');
      } else {
        console.log('[AIShield] Loaded', rules.length, 'rules from cache');
      }
      return rules;
    }
  } catch (e) {
    console.error('[AIShield] Cache decryption failed:', e.message);
  }
  return null;
}

const DYNAMIC_RULE_ID_OFFSET = 10000;

async function applyRules(rules) {
  if (!rules || rules.length === 0) return;
  const existingRules = await browserAPI.declarativeNetRequest.getDynamicRules();
  const toRemove = existingRules
    .map(r => r.id)
    .filter(id => id !== WAA_RULE_ID && (id < PAUSE_RULE_ID_BASE || id >= PAUSE_RULE_ID_BASE + 100000));

  // Offset all dynamic rule IDs by 10000 to avoid collision with static rule IDs (1-412)
  const offsetRules = rules.map(rule => ({
    ...rule,
    id: rule.id + DYNAMIC_RULE_ID_OFFSET
  }));

  await browserAPI.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: toRemove,
    addRules: offsetRules
  });
  console.log('[AIShield] Applied', offsetRules.length, 'blocking rules (IDs offset by', DYNAMIC_RULE_ID_OFFSET, ')');
}

// === HMAC REQUEST SIGNING ===
async function generateHmacSignature(licenseKey, extensionId, timestamp) {
  // Sign: timestamp:licenseKey:extensionId
  const message = `${timestamp}:${licenseKey}:${extensionId}`;
  const encoder = new TextEncoder();

  // Derive signing key: HMAC-SHA256(licenseKey, timestamp)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(licenseKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    keyMaterial,
    encoder.encode(message)
  );

  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// === PREMIUM RULES (Encrypted Delivery + Offline Cache) ===

async function fetchPremiumRules(licenseKey, extId, _depth = 0) {
  try {
    if (!extId) extId = await getExtensionId();

    // Rate limit: don't re-fetch from server if we fetched recently
    const now = Date.now();
    if (_depth === 0 && (now - lastRulesFetch) < RULES_FETCH_COOLDOWN) {
      console.log('[AIShield] Rules fetch skipped — cooldown active (' + Math.round((RULES_FETCH_COOLDOWN - (now - lastRulesFetch)) / 60000) + 'min remaining)');
      return;
    }

    // Get ruleSalt from storage (set during license verification)
    const stored = await browserAPI.storage.local.get(['ruleSalt']);
    const ruleSalt = stored.ruleSalt;
    if (!ruleSalt) {
      console.error('[AIShield] No ruleSalt — verify license first');
      // Still try cache with old salt
      const cachedRules = await loadCachedRules(licenseKey);
      if (cachedRules) await applyRules(cachedRules);
      return;
    }

    // HMAC request signing (H-02): prevents interception/replay of rules requests
    const timestamp = Date.now().toString();
    const signature = await generateHmacSignature(licenseKey, extId, timestamp);

    const response = await fetchWithFailover('rules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-License-Key': licenseKey,
        'X-Extension-Id': extId,
        'X-Timestamp': timestamp,
        'X-Signature': signature
      },
      body: JSON.stringify({ platform: 'chrome', version: EXTENSION_VERSION })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // Handle "verify first" response — actually re-verify
    // Guard against recursive loop: fetchPremiumRules → verifyLicense → fetchPremiumRules
    if (data.code === 'VERIFY_FIRST') {
      if (_depth > 0) {
        console.error('[AIShield] Recursion guard: VERIFY_FIRST loop detected at depth', _depth);
        return;
      }
      console.warn('[AIShield] Server says verify first — re-verifying');
      await verifyLicense(licenseKey);
      return;
    }

    // Encrypted payload — decrypt with licenseKey + ruleSalt
    // Use the ruleSalt from the response (the one the server actually used for encryption)
    // to avoid TOCTOU race where locally stored salt may differ from what server used
    if (data.payload && data.iv) {
      const decryptSalt = data.ruleSalt || ruleSalt;
      const rules = await decryptRules(data.payload, data.iv, licenseKey, decryptSalt);

      if (rules && rules.length > 0) {
        await applyRules(rules);
        // Mark successful fetch for cooldown
        lastRulesFetch = Date.now();
        browserAPI.storage.local.set({ _sw_lastRulesFetch: lastRulesFetch });
        // Update local ruleSalt to match what the server sent
        if (data.ruleSalt) {
          await browserAPI.storage.local.set({ ruleSalt: data.ruleSalt });
        }
        // Cache for offline use (with the salt that was actually used + integrity hash)
        await cacheEncryptedRules(data.payload, data.iv, decryptSalt, JSON.stringify(rules));
      }
    }
  } catch (error) {
    console.error('[AIShield] Premium rules fetch failed:', error.message);
    // FALLBACK: Load from encrypted cache
    console.log('[AIShield] Attempting to load cached rules...');
    const cachedRules = await loadCachedRules(licenseKey);
    if (cachedRules) {
      await applyRules(cachedRules);
      console.log('[AIShield] Offline mode: using cached rules');
    } else {
      console.warn('[AIShield] No cached rules available. Extension running without blocking rules.');
    }
  }
}

// === STARTUP RULE RESTORE ===
async function restoreCachedRulesOnStartup() {
  // Reset icon to clean state (may have frozen mid-animation if SW was killed)
  try {
    browserAPI.action.setIcon({ path: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' } });
  } catch (e) {}

  try {
    const stored = await browserAPI.storage.local.get(['licenseKey', 'licenseType']);
    if (!stored.licenseKey) return; // No license, no rules

    // Dynamic rules persist in Chrome across SW restarts — skip expensive
    // decrypt+re-apply if rules are already registered
    const existingRules = await browserAPI.declarativeNetRequest.getDynamicRules();
    const hasBlockingRules = existingRules.some(r => r.id >= DYNAMIC_RULE_ID_OFFSET && r.id < WAA_RULE_ID);

    if (hasBlockingRules) {
      console.log('[AIShield] Startup: ' + existingRules.length + ' dynamic rules already active, skipping re-apply');
      // Fire-and-forget server refresh (cooldown will gate it)
      const extId = await getExtensionId();
      fetchPremiumRules(stored.licenseKey, extId);
      return;
    }

    // No rules registered — first install or after deactivation, decrypt from cache
    const cachedRules = await loadCachedRules(stored.licenseKey);
    if (cachedRules) {
      await applyRules(cachedRules);
      console.log('[AIShield] Startup: restored cached rules from encrypted cache');
      const extId = await getExtensionId();
      fetchPremiumRules(stored.licenseKey, extId); // Fire-and-forget refresh
    }
  } catch (e) {
    console.error('[AIShield] Startup rule restore failed:', e.message);
  }
}

// Restore rules as soon as service worker starts
restoreCachedRulesOnStartup();

// Ensure polling alarm exists as backup (restarts fast poll if SW was killed)
browserAPI.alarms.get(MATCHED_RULES_POLL_ALARM, (alarm) => {
  if (!alarm) {
    browserAPI.alarms.create(MATCHED_RULES_POLL_ALARM, { periodInMinutes: MATCHED_RULES_POLL_INTERVAL });
  }
});

// === BLOCK DETECTION ===
// Two paths: onRuleMatchedDebug (instant, dev/unpacked only) and getMatchedRules polling (production)
// Both coexist safely — debug listener sets a flag to disable polling when active
var _debugActive = false; // var for hoisting safety across all references

try {
  if (browserAPI.declarativeNetRequest.onRuleMatchedDebug) {
    browserAPI.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
      _debugActive = true;
      var rid = info.rule.ruleId;
      if (rid === WAA_RULE_ID) return;
      if (rid >= PAUSE_RULE_ID_BASE && rid < PAUSE_RULE_ID_BASE + 100000) return;
      var origId = (rid >= DYNAMIC_RULE_ID_OFFSET && rid < WAA_RULE_ID) ? rid - DYNAMIC_RULE_ID_OFFSET : rid;
      await updateStats(function(s) {
        s.blockedByRule = s.blockedByRule || {};
        s.blockedByRule[origId] = (s.blockedByRule[origId] || 0) + 1;
        s.totalBlocked = (s.totalBlocked || 0) + 1;
      });
      var diag = await getDiagnostics();
      diag.endpointsBlocked = (diag.endpointsBlocked || 0) + 1;
      await browserAPI.storage.local.set({ diagnostics: diag });
      pulseIcon();
      try { browserAPI.runtime.sendMessage({ action: 'blockOccurred' }).catch(function(){}); } catch(e) {}
      var s = await getStats();
      reportStats(s);
    });
  }
} catch (e) {}

// === STATS ===
async function getStats() {
  const result = await browserAPI.storage.local.get(['stats']);
  if (result.stats) return result.stats;
  // First run or after storage clear — persist immediately so lastReset is stable
  const fresh = {
    totalBlocked: 0,
    blockedByDomain: {},
    blockedByRule: {},
    lastReset: Date.now()
  };
  await browserAPI.storage.local.set({ stats: fresh });
  return fresh;
}

async function resetStats() {
  const fresh = {
    totalBlocked: 0,
    blockedByDomain: {},
    blockedByRule: {},
    lastReset: Date.now()
  };
  await browserAPI.storage.local.set({ stats: fresh });
  return fresh;
}

// Serialization queue to prevent read-modify-write races on stats
let statsQueue = Promise.resolve();
function updateStats(fn) {
  statsQueue = statsQueue.then(async () => {
    const s = await getStats();
    fn(s);
    await browserAPI.storage.local.set({ stats: s });
  }).catch(e => {
    console.error('[AIShield] updateStats error:', e);
  });
  return statsQueue;
}

async function getDiagnostics() {
  const result = await browserAPI.storage.local.get(['diagnostics']);
  return result.diagnostics || {
    headersStripped: 0,
    clientHintsBlocked: 0,
    cookiesDeleted: 0,
    endpointsBlocked: 0
  };
}

async function reportStats(stats) {
  const now = Date.now();
  if (now - lastStatsReport < STATS_INTERVAL) return;
  lastStatsReport = now;
  browserAPI.storage.local.set({ _sw_lastStatsReport: now });

  try {
    // Respect user opt-out preference
    const prefs = await browserAPI.storage.local.get(['licenseKey', 'statsOptOut']);
    if (prefs.statsOptOut) return; // User disabled stats reporting
    if (!prefs.licenseKey) return; // No license = no stats reporting
    const stored = prefs;

    // M-05: Use one-time random ID instead of persistent extensionId (anti-tracking)
    const ephemeralId = 'ext_' + crypto.randomUUID().replace(/-/g, '');

    // Send aggregate total only — no per-domain data (privacy)
    await fetchWithFailover('stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-License-Key': stored.licenseKey
      },
      body: JSON.stringify({
        extensionId: ephemeralId,
        stats: {
          totalBlocked: stats.totalBlocked || 0
        },
        platform: 'chrome',
        version: EXTENSION_VERSION,
        timestamp: Date.now().toString()
      })
    });
  } catch (e) {
    // Non-critical
  }
}

// === MATCHED RULES POLLING (Primary block counter + company breakdown) ===
async function pollMatchedRules() {
  try {
    if (!browserAPI.declarativeNetRequest.getMatchedRules) return;

    const result = await browserAPI.declarativeNetRequest.getMatchedRules({
      minTimeStamp: lastMatchedRulesTimestamp
    });
    lastMatchedRulesTimestamp = Date.now();
    browserAPI.storage.local.set({ _sw_lastMatchedRulesTimestamp: lastMatchedRulesTimestamp });

    if (!result || !result.rulesMatchedInfo || result.rulesMatchedInfo.length === 0) return;

    const matchedInfo = result.rulesMatchedInfo;
    const newMatchCount = matchedInfo.length;

    // Update stats: per-rule breakdown AND total block count
    await updateStats(s => {
      s.blockedByRule = s.blockedByRule || {};
      for (const match of matchedInfo) {
        let ruleId = match.rule.ruleId;
        // Subtract offset for dynamic rules to map back to original company rule IDs
        if (ruleId >= DYNAMIC_RULE_ID_OFFSET && ruleId < WAA_RULE_ID) {
          ruleId = ruleId - DYNAMIC_RULE_ID_OFFSET;
        }
        s.blockedByRule[ruleId] = (s.blockedByRule[ruleId] || 0) + 1;
      }
      s.totalBlocked = (s.totalBlocked || 0) + newMatchCount;
    });

    // Update diagnostics
    const diag = await getDiagnostics();
    diag.endpointsBlocked = (diag.endpointsBlocked || 0) + newMatchCount;
    await browserAPI.storage.local.set({ diagnostics: diag });

    // Visual feedback + popup notification
    pulseIcon();
    try {
      browserAPI.runtime.sendMessage({ action: 'blockOccurred' }).catch(() => {});
    } catch (e) { /* popup may not be open */ }

    // Periodic stats reporting (has its own 1-hour cooldown internally)
    const s = await getStats();
    reportStats(s);
  } catch (e) {
    // getMatchedRules may throw if rate-limited; non-critical
    console.warn('[AIShield] getMatchedRules poll error:', e.message);
  }
}

// === SITE PAUSE (Alarm-based cleanup — survives SW restart) ===
const PAUSE_RULE_ID_BASE = 200000;

// Stable rule ID from domain name (hash to a number in 200000-299999 range)
function pauseRuleId(domain) {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = ((hash << 5) - hash + domain.charCodeAt(i)) | 0;
  }
  return PAUSE_RULE_ID_BASE + (Math.abs(hash) % 100000);
}

async function pauseSite(domain, duration) {
  const until = Date.now() + duration;
  const result = await browserAPI.storage.local.get(['pausedSites']);
  const paused = result.pausedSites || {};
  paused[domain] = until;
  await browserAPI.storage.local.set({ pausedSites: paused });

  // Create a high-priority allow rule for this domain that overrides all block rules
  const ruleId = pauseRuleId(domain);
  try {
    await browserAPI.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ruleId],
      addRules: [{
        id: ruleId,
        priority: 999999,
        action: { type: 'allow' },
        condition: {
          requestDomains: [domain],
          resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
            'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other']
        }
      }]
    });
  } catch (e) {
    console.error('[AIShield] Failed to create pause rule for', domain, e);
  }

  // Use alarm instead of setTimeout (survives SW restart)
  await browserAPI.alarms.create(`unpause-${domain}`, { delayInMinutes: Math.max(duration / 60000, 0.5) });

  return { success: true, domain, until };
}

async function unpauseSite(domain) {
  const result = await browserAPI.storage.local.get(['pausedSites']);
  const paused = result.pausedSites || {};
  delete paused[domain];
  await browserAPI.storage.local.set({ pausedSites: paused });

  // Remove the allow rule for this domain
  const ruleId = pauseRuleId(domain);
  try {
    await browserAPI.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
  } catch (e) {}

  // Clear the alarm if it exists
  try { await browserAPI.alarms.clear(`unpause-${domain}`); } catch (e) {}
  return { success: true, domain };
}

async function getPauseStatus(domain) {
  const result = await browserAPI.storage.local.get(['pausedSites']);
  const paused = result.pausedSites || {};

  if (!paused[domain]) return { paused: false };

  if (Date.now() > paused[domain]) {
    delete paused[domain];
    await browserAPI.storage.local.set({ pausedSites: paused });
    return { paused: false };
  }
  return { paused: true, until: paused[domain], remaining: paused[domain] - Date.now() };
}

// === ALARM HANDLERS ===
browserAPI.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === MATCHED_RULES_POLL_ALARM) {
    if (!_debugActive) await pollMatchedRules();
  } else if (alarm.name.startsWith('unpause-')) {
    const domain = alarm.name.replace('unpause-', '');
    await unpauseSite(domain);
  }
});

// === EXTERNAL MESSAGE HANDLER (Strict Origin) ===
browserAPI.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  const senderOrigin = sender.origin || (sender.url ? new URL(sender.url).origin : '');

  if (!ALLOWED_ORIGINS.includes(senderOrigin)) {
    console.warn('[AIShield] Blocked external message from:', senderOrigin);
    sendResponse({ success: false, error: 'Unauthorized' });
    return false;
  }

  if (request.action === 'activateLicense') {
    verifyLicense(request.licenseKey).then(sendResponse);
    return true;
  }

  if (request.action === 'checkStatus') {
    browserAPI.storage.local.get(['licenseKey', 'licenseType']).then(data => {
      sendResponse({
        valid: !!data.licenseKey,
        licensed: !!data.licenseKey,
        type: data.licenseType || 'none'
      });
    });
    return true;
  }

  sendResponse({ success: false, error: 'Unknown action' });
  return false;
});

// === INTERNAL MESSAGE HANDLER ===
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'setLicenseKey':
    case 'verifyLicense':
      verifyLicense(request.licenseKey).then(sendResponse);
      return true;

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

    case 'deactivateLicense':
      browserAPI.storage.local.remove(['licenseKey', 'licenseType', 'licenseExpires', 'licenseVerified', 'ruleSalt', RULE_CACHE_KEY])
        .then(async () => {
          // Remove all dynamic rules except WAA and malware
          const existing = await browserAPI.declarativeNetRequest.getDynamicRules();
          const protectedIds = [WAA_RULE_ID];
          const toRemove = existing.map(r => r.id).filter(id => !protectedIds.includes(id));
          if (toRemove.length > 0) {
            await browserAPI.declarativeNetRequest.updateDynamicRules({ removeRuleIds: toRemove });
          }
          sendResponse({ success: true });
        });
      return true;

    case 'getStats':
      getStats().then(sendResponse);
      return true;

    case 'getRuleCount':
      browserAPI.declarativeNetRequest.getDynamicRules().then(dynamicRules => {
        // Count dynamic rules excluding WAA and pause rules
        const blockingDynamic = dynamicRules.filter(r => r.id !== WAA_RULE_ID && (r.id < PAUSE_RULE_ID_BASE || r.id >= PAUSE_RULE_ID_BASE + 100000)).length;
        sendResponse({ count: blockingDynamic });
      });
      return true;

    case 'resetStats':
      resetStats().then(sendResponse);
      return true;

    case 'getDiagnostics':
      getDiagnostics().then(sendResponse);
      return true;

    case 'setStatsOptOut':
      browserAPI.storage.local.set({ statsOptOut: !!request.value }).then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'getStatsOptOut':
      browserAPI.storage.local.get('statsOptOut').then(r => {
        sendResponse({ optOut: !!r.statsOptOut });
      });
      return true;

    case 'pauseSite':
      pauseSite(request.domain, request.duration || 600000).then(sendResponse);
      return true;

    case 'getPauseStatus':
      getPauseStatus(request.domain).then(r => sendResponse(r));
      return true;

    case 'unpauseSite':
      unpauseSite(request.domain).then(sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

// === INIT ===
browserAPI.runtime.onInstalled.addListener(async (details) => {
  await getExtensionId();
  console.log('[AIShield] Extension installed/updated, ID:', extensionId);

  if (details.reason === 'install') {
    await resetStats();
  }

  // Alarm creation is handled by the top-level safety net (L557) with existence check.
  // No need to duplicate here — it would overwrite without checking.

  scanExistingTabsForKeyPages();
});

scanExistingTabsForKeyPages();
