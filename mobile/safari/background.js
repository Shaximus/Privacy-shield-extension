/**
 * AIShield Background Service Worker v2.3.0 — Safari/iOS Adaptation
 *
 * Changes from Chrome version:
 * - All chrome.* calls replaced with browserAPI.* (browser/chrome wrapper)
 * - Removed chrome.notifications.create() — not available on iOS Safari
 *   Instead uses browserAPI.action.setBadgeText for malware alerts
 * - Removed chrome.webRequest.onErrorOccurred listener — webRequest API
 *   is not available on iOS Safari
 * - Removed chrome.declarativeNetRequest.onRuleMatchedDebug — Chrome-only
 *   Stats are now estimated via periodic rule count polling
 * - Removed onMessageExternal listener — Safari does not support
 *   externally_connectable. License activation uses URL parameter
 *   approach via content-autoactivate.js instead.
 * - Platform identifier changed from 'chrome' to 'safari'
 *
 * Security Hardened:
 * - HMAC request signing
 * - GHOSTPULSE Malware Detection
 * - Strict Origin Validation
 * - Rule Signature Verification
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Build-time secret (Replaced by build.sh)
const CLIENT_SECRET = 'REPLACE_AT_BUILD_TIME';

// === ENDPOINTS (Updated for v2.3.0 Worker) ===
const LICENSE_ENDPOINT = 'https://ai-shield-license.kingsley-w-m-curtis.workers.dev/license/verify';
const STATS_ENDPOINT = 'https://ai-shield-rules.kingsley-w-m-curtis.workers.dev/stats/report';
const RULES_ENDPOINT = 'https://ai-shield-rules.kingsley-w-m-curtis.workers.dev/rules/fetch';

// Security: Exact origin whitelist
const ALLOWED_ORIGINS = [
  'https://reflexionsoftware.com',
  'https://www.reflexionsoftware.com',
  'https://reflexionsoftware.pages.dev'
];

// License key format: XXXXX-XXXXX-XXXXX-XXXXX
const LICENSE_KEY_REGEX = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

// Rate limiting
const VERIFY_COOLDOWN = 5000;
const STATS_INTERVAL = 3600000;

// Stats polling interval for Safari (no onRuleMatchedDebug)
const STATS_POLL_INTERVAL = 30000; // 30 seconds

// State
let lastVerifyAttempt = 0;
let lastStatsReport = 0;
let extensionId = null;

// === HMAC SECURITY ===
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

  // Safari/iOS: No notifications API available.
  // Use badge text as visual alert instead.
  try {
    browserAPI.action.setBadgeText({ text: '!' });
    browserAPI.action.setBadgeBackgroundColor({ color: '#FF0000' });
    setTimeout(() => browserAPI.action.setBadgeText({ text: '' }), 10000);
  } catch (e) {
    console.error('[AIShield] Badge update failed:', e);
  }

  return entry;
}

// === SMART WAA DETECTION ===
const WAA_RULE_ID = 205;
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

// === LICENSE VERIFICATION (HMAC) ===
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
    const timestamp = Date.now().toString();
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
        platform: 'safari',
        version: '2.3.0'
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

// === PREMIUM RULES (HMAC + Signature Check) ===
async function fetchPremiumRules(licenseKey, extId) {
  try {
    if (!extId) extId = await getExtensionId();
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
      body: JSON.stringify({ platform: 'safari', version: '2.3.0' })
    });

    if (!response.ok) return;
    const data = await response.json();

    // Integrity check
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
      // Preserve WAA and Malware rules
      const existingRules = await browserAPI.declarativeNetRequest.getDynamicRules();
      const protectedIds = [WAA_RULE_ID, 9001];
      const toRemove = existingRules
        .map(r => r.id)
        .filter(id => !protectedIds.includes(id));

      await browserAPI.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: toRemove,
        addRules: data.rules
      });
    }
  } catch (error) {
    console.error('[AIShield] Premium rules fetch failed:', error.message);
  }
}

// === STATS ===
async function getStats() {
  const result = await browserAPI.storage.local.get(['stats']);
  return result.stats || {
    totalBlocked: 0,
    blockedByDomain: {},
    lastReset: Date.now()
  };
}

async function resetStats() {
  const fresh = {
    totalBlocked: 0,
    blockedByDomain: {},
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
    const timestamp = Date.now().toString();
    const payload = JSON.stringify({
      extensionId: extId,
      stats: stats,
      platform: 'safari',
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
    // Non-critical
  }
}

// === SAFARI STATS ESTIMATION ===
// Since Safari lacks onRuleMatchedDebug, we estimate blocked request counts
// by periodically polling the matched rules count via getMatchedRules (if available)
// or maintaining a simple session-based counter.
let lastKnownRuleCount = 0;

async function pollStatsFromMatchedRules() {
  try {
    // Safari 16.4+ may support getMatchedRules
    if (browserAPI.declarativeNetRequest.getMatchedRules) {
      const matched = await browserAPI.declarativeNetRequest.getMatchedRules();
      if (matched && matched.rulesMatchedInfo) {
        const newCount = matched.rulesMatchedInfo.length;
        if (newCount > lastKnownRuleCount) {
          const stats = await getStats();
          const delta = newCount - lastKnownRuleCount;
          stats.totalBlocked = (stats.totalBlocked || 0) + delta;

          // Try to extract domain info from matched rules
          for (const info of matched.rulesMatchedInfo.slice(-delta)) {
            if (info.request && info.request.url) {
              try {
                const domain = new URL(info.request.url).hostname;
                stats.blockedByDomain = stats.blockedByDomain || {};
                stats.blockedByDomain[domain] = (stats.blockedByDomain[domain] || 0) + 1;
              } catch (e) { /* invalid url */ }
            }

            // Check for malware rule match
            if (info.rule && info.rule.ruleId === 9001 && info.request) {
              logMalwareBlock({
                url: info.request.url,
                tabId: info.request.tabId || -1,
                type: info.request.type || 'unknown',
                ruleId: 9001
              });
            }
          }

          lastKnownRuleCount = newCount;
          await browserAPI.storage.local.set({ stats });
          reportStats(stats);
        }
      }
    }
  } catch (e) {
    // getMatchedRules may not be available — fall back silently
    // Stats will still work via manual increment from popup interactions
  }
}

// Start periodic stats polling for Safari
setInterval(pollStatsFromMatchedRules, STATS_POLL_INTERVAL);

// === SITE PAUSE ===
const pausedSites = new Map();

async function pauseSite(domain, duration) {
  pausedSites.set(domain, Date.now() + duration);
  setTimeout(() => pausedSites.delete(domain), duration);
  return { success: true, domain, until: Date.now() + duration };
}

async function unpauseSite(domain) {
  pausedSites.delete(domain);
  return { success: true, domain };
}

async function getPauseStatus(domain) {
  const until = pausedSites.get(domain);
  if (!until || Date.now() > until) {
    pausedSites.delete(domain);
    return { paused: false };
  }
  return { paused: true, until, remaining: until - Date.now() };
}

// === STRICT MODE ===
async function setStrictMode(enabled) {
  await browserAPI.storage.local.set({ strictMode: enabled });
  return { success: true, strictMode: enabled };
}

// === INTERNAL MESSAGE HANDLER ===
// Note: onMessageExternal is removed for Safari — Safari does not support
// externally_connectable. License activation from the website uses the
// URL parameter approach handled by content-autoactivate.js.
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'setLicenseKey':
    case 'verifyLicense':
      verifyLicense(request.licenseKey).then(sendResponse);
      return true;

    case 'getLicenseStatus':
      browserAPI.storage.local.get(['licenseKey', 'licenseType', 'licenseVerified'])
        .then(data => {
          sendResponse({
            valid: !!data.licenseKey,
            licensed: !!data.licenseKey,
            type: data.licenseType || 'none',
            verified: data.licenseVerified || null
          });
        });
      return true;

    case 'deactivateLicense':
      browserAPI.storage.local.remove(['licenseKey', 'licenseType', 'licenseExpires', 'licenseVerified'])
        .then(() => sendResponse({ success: true }));
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

// === INIT ===
browserAPI.runtime.onInstalled.addListener(async (details) => {
  await getExtensionId();
  console.log('[AIShield] Extension installed/updated, ID:', extensionId);

  if (details.reason === 'install') {
    await resetStats();
  }

  scanExistingTabsForKeyPages();
});

// Helper for getExtensionId call in handlers
async function getOrCreateExtensionId() {
  return await getExtensionId();
}

scanExistingTabsForKeyPages();

// Initial stats poll
pollStatsFromMatchedRules();
