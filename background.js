/**
 * AIShield Background Service Worker v3.2.0
 *
 * Security Hardened:
 * - Encrypted rule delivery (AES-GCM + PBKDF2)
 * - GHOSTPULSE Malware Detection
 * - Strict Origin Validation
 * - Multi-provider endpoint failover
 * - Alarm-based pause cleanup (survives SW restart)
 * - Production block counter via webRequest.onErrorOccurred
 * - getMatchedRules polling for company-level breakdown
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// === VERSION ===
const EXTENSION_VERSION = '3.2.0';

// === Animated Icon (pulse on block) - Full 145 frame animation ===
const iconFrames = [];
for (let i = 0; i < 145; i++) {
  const frameNum = String(i).padStart(3, '0');
  iconFrames.push({ path: `animated-icons/frame_${frameNum}.png` });
}

let lastPulseTime = 0;
const PULSE_COOLDOWN = 3000;

function pulseIcon() {
  const now = Date.now();
  if (now - lastPulseTime < PULSE_COOLDOWN) return;
  lastPulseTime = now;

  let pulseCount = 0;
  const pulseInterval = setInterval(() => {
    const frameIndex = pulseCount % iconFrames.length;
    browserAPI.action.setIcon(iconFrames[frameIndex]);
    pulseCount++;
    if (pulseCount >= iconFrames.length) {
      clearInterval(pulseInterval);
      browserAPI.action.setIcon({ path: 'animated-icons/frame_000.png' });
    }
  }, 41.67); // 24fps
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
      if (response.ok || response.status === 401 || response.status === 402 || response.status === 429) {
        return response; // Real response (server is alive, even if auth/rate error)
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
const STATS_INTERVAL = 3600000;

// Block counter polling
const MATCHED_RULES_POLL_ALARM = 'poll-matched-rules';
const MATCHED_RULES_POLL_INTERVAL = 1; // minutes
let lastMatchedRulesTimestamp = Date.now();

// State
let lastVerifyAttempt = 0;
let lastStatsReport = 0;
let extensionId = null;

// === ENCRYPTED RULE DECRYPTION ===
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

// === MALWARE DETECTION (GHOSTPULSE) ===
const MALWARE_LOG_KEY = 'malware_block_log';
const MALWARE_LOG_MAX = 1000;
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

  const result = await browserAPI.storage.local.get(MALWARE_LOG_KEY);
  const logs = result[MALWARE_LOG_KEY] || [];
  logs.unshift(entry);
  if (logs.length > MALWARE_LOG_MAX) logs.length = MALWARE_LOG_MAX;
  await browserAPI.storage.local.set({ [MALWARE_LOG_KEY]: logs });

  // Desktop notification
  try {
    if (browserAPI.notifications) {
      await browserAPI.notifications.create(`ghostpulse-${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Malware Blocked: GHOSTPULSE',
        message: 'AIShield blocked a connection to a known GHOSTPULSE C2 server.',
        priority: 2,
        requireInteraction: true
      });
    }
    browserAPI.action.setBadgeText({ text: '!' });
    browserAPI.action.setBadgeBackgroundColor({ color: '#FF0000' });
    setTimeout(() => browserAPI.action.setBadgeText({ text: '' }), 10000);
  } catch (e) {
    console.error('[AIShield] Notification failed:', e);
  }

  return entry;
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
      priority: 10,
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
  if (!changeInfo.url) return;
  const wasActive = waaActiveTabs.has(tabId);
  const isActive = isKeyCreationPage(changeInfo.url);
  if (isActive && !wasActive) {
    waaActiveTabs.add(tabId);
    updateWaaRule();
  } else if (!isActive && wasActive) {
    waaActiveTabs.delete(tabId);
    updateWaaRule();
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

// Helper alias
async function getOrCreateExtensionId() {
  return await getExtensionId();
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

  if (!validateLicenseKeyFormat(licenseKey)) {
    return { error: true, message: 'Invalid license key format.' };
  }

  try {
    const extId = await getOrCreateExtensionId();

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

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.valid || data.active) {
      await browserAPI.storage.local.set({
        licenseKey: licenseKey,
        licenseType: data.type || 'premium',
        licenseExpires: data.expires || null,
        licenseVerified: Date.now(),
        ruleSalt: data.ruleSalt || null
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

// === RULE CACHE (Survives worker outages) ===
const RULE_CACHE_KEY = 'ruleCache';
const RULE_CACHE_FRESH_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 days — use silently
const RULE_CACHE_STALE_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days — use with warning

async function cacheEncryptedRules(payload, iv, ruleSalt) {
  await browserAPI.storage.local.set({
    [RULE_CACHE_KEY]: {
      payload,
      iv,
      ruleSalt,
      cachedAt: Date.now(),
      refreshedAt: Date.now()
    }
  });
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

async function applyRules(rules) {
  if (!rules || rules.length === 0) return;
  const existingRules = await browserAPI.declarativeNetRequest.getDynamicRules();
  const protectedIds = [WAA_RULE_ID, 9001];
  const toRemove = existingRules
    .map(r => r.id)
    .filter(id => !protectedIds.includes(id));

  await browserAPI.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: toRemove,
    addRules: rules
  });
  console.log('[AIShield] Applied', rules.length, 'blocking rules');
}

// === PREMIUM RULES (Encrypted Delivery + Offline Cache) ===
async function fetchPremiumRules(licenseKey, extId) {
  try {
    if (!extId) extId = await getExtensionId();

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

    const response = await fetchWithFailover('rules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-License-Key': licenseKey,
        'X-Extension-Id': extId
      },
      body: JSON.stringify({ platform: 'chrome', version: EXTENSION_VERSION })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // Handle "verify first" response — actually re-verify
    if (data.code === 'VERIFY_FIRST') {
      console.warn('[AIShield] Server says verify first — re-verifying');
      await verifyLicense(licenseKey);
      return;
    }

    // Encrypted payload — decrypt with licenseKey + ruleSalt
    if (data.payload && data.iv) {
      const rules = await decryptRules(data.payload, data.iv, licenseKey, ruleSalt);

      if (rules && rules.length > 0) {
        await applyRules(rules);
        // Cache for offline use
        await cacheEncryptedRules(data.payload, data.iv, ruleSalt);
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

    const cachedRules = await loadCachedRules(stored.licenseKey);
    if (cachedRules) {
      await applyRules(cachedRules);
      console.log('[AIShield] Startup: restored cached rules immediately');
      // Background refresh from server
      const extId = await getExtensionId();
      fetchPremiumRules(stored.licenseKey, extId); // Fire-and-forget refresh
    }
  } catch (e) {
    console.error('[AIShield] Startup rule restore failed:', e.message);
  }
}

// Restore rules as soon as service worker starts
restoreCachedRulesOnStartup();

// Ensure polling alarm exists (persists across SW restarts, re-create as safety net)
browserAPI.alarms.get(MATCHED_RULES_POLL_ALARM, (alarm) => {
  if (!alarm) {
    browserAPI.alarms.create(MATCHED_RULES_POLL_ALARM, { periodInMinutes: MATCHED_RULES_POLL_INTERVAL });
  }
});

// === STATS ===
async function getStats() {
  const result = await browserAPI.storage.local.get(['stats']);
  return result.stats || {
    totalBlocked: 0,
    blockedByDomain: {},
    blockedByRule: {},
    lastReset: Date.now()
  };
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

  try {
    const extId = await getExtensionId();
    // Only send aggregate total — no per-domain data (privacy)
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
  } catch (e) {
    // Non-critical
  }
}

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

// === SITE PAUSE (Alarm-based cleanup — survives SW restart) ===
async function pauseSite(domain, duration) {
  const until = Date.now() + duration;
  const result = await browserAPI.storage.local.get(['pausedSites']);
  const paused = result.pausedSites || {};
  paused[domain] = until;
  await browserAPI.storage.local.set({ pausedSites: paused });

  // Use alarm instead of setTimeout (survives SW restart)
  await browserAPI.alarms.create(`unpause-${domain}`, { delayInMinutes: Math.max(duration / 60000, 0.5) });

  return { success: true, domain, until };
}

async function unpauseSite(domain) {
  const result = await browserAPI.storage.local.get(['pausedSites']);
  const paused = result.pausedSites || {};
  delete paused[domain];
  await browserAPI.storage.local.set({ pausedSites: paused });
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
    await pollMatchedRules();
  } else if (alarm.name.startsWith('unpause-')) {
    const domain = alarm.name.replace('unpause-', '');
    await unpauseSite(domain);
  }
});

// === STRICT MODE ===
async function setStrictMode(enabled) {
  await browserAPI.storage.local.set({ strictMode: enabled });

  if (enabled && browserAPI.cookies) {
    // Delete known tracking cookies
    const trackingPrefixes = ['_ga', '_gid', '_gcl', '_fbp', '_fbc', 'NID', 'APISID', 'SAPISID'];
    try {
      const cookies = await browserAPI.cookies.getAll({});
      for (const cookie of cookies) {
        if (trackingPrefixes.some(p => cookie.name.startsWith(p))) {
          const protocol = cookie.secure ? 'https' : 'http';
          const url = `${protocol}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
          await browserAPI.cookies.remove({ url, name: cookie.name });
        }
      }
    } catch (e) { console.error('[AIShield] Cookie cleanup error:', e); }
  }

  return { success: true, strictMode: enabled };
}

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
          const protectedIds = [WAA_RULE_ID, 9001];
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

    case 'resetStats':
      resetStats().then(sendResponse);
      return true;

    case 'getDiagnostics':
      getDiagnostics().then(sendResponse);
      return true;

    case 'setStrictMode':
      setStrictMode(request.value).then(sendResponse);
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

    case 'getMalwareLogs':
      browserAPI.storage.local.get(MALWARE_LOG_KEY).then(r => {
        sendResponse({ logs: r[MALWARE_LOG_KEY] || [] });
      });
      return true;

    case 'clearMalwareLogs':
      browserAPI.storage.local.remove(MALWARE_LOG_KEY).then(() => {
        sendResponse({ success: true });
      });
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

// === TRACK BLOCKED REQUESTS & MALWARE ===
// Dev-only: onRuleMatchedDebug for malware detection diagnostics
if (browserAPI.declarativeNetRequest.onRuleMatchedDebug) {
  browserAPI.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    try {
      // Malware Check only — stats are handled by onErrorOccurred (no double counting)
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

// Production + Dev: onErrorOccurred is the PRIMARY block counter
// Fires for every declarativeNetRequest block (ERR_BLOCKED_BY_CLIENT)
// This is the SINGLE source of truth for block counting — no double counting
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

    // Count ALL blocks
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

        // Periodic stats reporting
        reportStats(s);
      } catch (e) {}
    }
  }, { urls: ['<all_urls>'] });
}

// === INIT ===
browserAPI.runtime.onInstalled.addListener(async (details) => {
  await getExtensionId();
  console.log('[AIShield] Extension installed/updated, ID:', extensionId);

  if (details.reason === 'install') {
    await resetStats();
  }

  // Set up matched rules polling alarm
  browserAPI.alarms.create(MATCHED_RULES_POLL_ALARM, { periodInMinutes: MATCHED_RULES_POLL_INTERVAL });

  scanExistingTabsForKeyPages();
});

scanExistingTabsForKeyPages();
