// Cross-browser compatibility
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// AI Privacy Shield - Background Service Worker
// Rules are fetched from server - extension is useless without valid license

// === CONFIGURATION ===
const RULES_ENDPOINT = 'https://ai-shield-rules.kingsley-w-m-curtis.workers.dev/rules';
const LICENSE_ENDPOINT = 'https://ai-shield-license.kingsley-w-m-curtis.workers.dev/verify-license';
const STATS_ENDPOINT = 'https://ai-shield-rules.kingsley-w-m-curtis.workers.dev/report-stats';
const RULES_REFRESH_INTERVAL = 60 * 60 * 1000; // Refresh rules every hour
const REPORT_INTERVAL = 5 * 60 * 1000; // Report stats every 5 minutes

// === STATE ===
let stats = {
  totalBlocked: 0,
  blockedByDomain: {},
  lastReset: Date.now()
};

let licenseStatus = {
  valid: false,
  type: null,
  checkedAt: null
};

let rulesLoaded = false;
let extensionId = null;
let lastReportedStats = { totalBlocked: 0 };

// === ANIMATED ICON ===
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
  }, 41.67);
}

// === LICENSE VERIFICATION ===
async function verifyLicense() {
  const result = await browserAPI.storage.local.get(['licenseKey']);
  const licenseKey = result.licenseKey;

  if (!licenseKey) {
    console.log('[AI Privacy Shield] No license key found');
    licenseStatus = { valid: false, type: null, checkedAt: Date.now() };
    await clearAllRules();
    return false;
  }

  try {
    const response = await fetch(LICENSE_ENDPOINT, {
      headers: { 'X-License-Key': licenseKey }
    });
    const data = await response.json();

    if (data.valid) {
      console.log('[AI Privacy Shield] License valid:', data.type);
      licenseStatus = { valid: true, type: data.type, checkedAt: Date.now() };
      return true;
    } else {
      console.warn('[AI Privacy Shield] License invalid:', data.error);
      licenseStatus = { valid: false, type: null, checkedAt: Date.now(), error: data.error };
      await clearAllRules();
      return false;
    }
  } catch (error) {
    console.error('[AI Privacy Shield] License check failed:', error);
    // On network error, use cached status if recent
    if (licenseStatus.checkedAt && Date.now() - licenseStatus.checkedAt < 24 * 60 * 60 * 1000) {
      return licenseStatus.valid;
    }
    return false;
  }
}

// === DYNAMIC RULES MANAGEMENT ===
async function clearAllRules() {
  try {
    const existingRules = await browserAPI.declarativeNetRequest.getDynamicRules();
    const ruleIds = existingRules.map(r => r.id);
    if (ruleIds.length > 0) {
      await browserAPI.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIds
      });
      console.log('[AI Privacy Shield] Cleared', ruleIds.length, 'rules');
    }
    rulesLoaded = false;
  } catch (error) {
    console.error('[AI Privacy Shield] Error clearing rules:', error);
  }
}

async function fetchAndApplyRules() {
  const result = await browserAPI.storage.local.get(['licenseKey']);
  const licenseKey = result.licenseKey;

  if (!licenseKey) {
    console.log('[AI Privacy Shield] No license - cannot fetch rules');
    return false;
  }

  try {
    const response = await fetch(RULES_ENDPOINT, {
      headers: { 'X-License-Key': licenseKey }
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[AI Privacy Shield] Rules fetch failed:', error);
      return false;
    }

    const data = await response.json();
    const rules = data.rules || [];

    if (rules.length === 0) {
      console.warn('[AI Privacy Shield] No rules returned from server');
      return false;
    }

    // Clear existing dynamic rules first
    await clearAllRules();

    // Convert server rules to declarativeNetRequest format
    const dnrRules = rules.map((rule, index) => ({
      id: rule.id || (index + 1),
      priority: rule.priority || 1,
      action: rule.action,
      condition: rule.condition
    }));

    // Apply new rules
    await browserAPI.declarativeNetRequest.updateDynamicRules({
      addRules: dnrRules
    });

    rulesLoaded = true;
    console.log('[AI Privacy Shield] Loaded', dnrRules.length, 'protection rules from server');

    // Store rules version for tracking
    await browserAPI.storage.local.set({
      rulesVersion: data.version,
      rulesLastUpdated: Date.now(),
      rulesCount: dnrRules.length
    });

    return true;
  } catch (error) {
    console.error('[AI Privacy Shield] Error fetching rules:', error);
    return false;
  }
}

// === RULE ID TO NAME MAPPING (for stats) ===
const ruleIdToName = {
  1: 'Statsig', 2: 'Honeycomb', 3: 'Segment', 4: 'Segment',
  5: 'Cloudflare RUM', 6: 'Cloudflare RUM', 7: 'Amplitude',
  8: 'Mixpanel', 9: 'PostHog', 10: 'Intercom',
  11: 'Google Analytics', 12: 'Google Tag Manager', 13: 'DoubleClick',
  14: 'Google Ads', 15: 'Statsig (Embedded)', 16: 'Honeycomb Traces',
  17: 'Grok Telemetry', 18: 'Statsig CDN', 19: 'Statsig Assets',
  20: 'Statsig Config', 21: 'Statsig Registry', 22: 'Cloudflare NEL',
  23: 'Datadog RUM (OpenAI)', 24: 'ChatGPT Telemetry', 25: 'ChatGPT Stats',
  26: 'ChatGPT A/B Testing', 27: 'Google CSP Reporting', 28: 'Meta AI Telemetry',
  29: 'Meta AI Event Relay', 30: 'Meta Error Reporting', 31: 'Facebook Pixel',
  32: 'Facebook Browser Reporting', 33: 'Google Play Telemetry',
  35: 'Google Ads AsyncData', 36: 'Google Web Activity API',
  37: 'ByteDance Gator (DeepSeek)'
};

// === STATS TRACKING ===
browserAPI.storage.local.get(['stats'], (result) => {
  if (result.stats) stats = result.stats;
});

try {
  if (browserAPI.declarativeNetRequest?.onRuleMatchedDebug) {
    browserAPI.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
      const ruleId = info.rule.ruleId;
      const name = ruleIdToName[ruleId] || `Rule ${ruleId}`;

      stats.totalBlocked++;
      if (!stats.blockedByDomain[name]) stats.blockedByDomain[name] = 0;
      stats.blockedByDomain[name]++;

      browserAPI.storage.local.set({ stats });
      pulseIcon();
      console.log('[AI Privacy Shield] Blocked:', name, info.request.url);
    });
  }
} catch (error) {
  console.warn('[AI Privacy Shield] Stats tracking setup error:', error);
}

// === DIAGNOSTICS ===
let diagnostics = {
  headersStripped: 0, clientHintsBlocked: 0,
  cookiesDeleted: 0, endpointsBlocked: 0,
  lastReset: Date.now()
};

browserAPI.storage.local.get(['diagnostics'], (res) => {
  if (res.diagnostics) diagnostics = res.diagnostics;
});

// === MESSAGE HANDLING ===
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getStats') {
    sendResponse(stats);
  } else if (message.action === 'resetStats') {
    stats = { totalBlocked: 0, blockedByDomain: {}, lastReset: Date.now() };
    browserAPI.storage.local.set({ stats });
    sendResponse({ success: true });
  } else if (message.action === 'getLicenseStatus') {
    sendResponse(licenseStatus);
  } else if (message.action === 'setLicenseKey') {
    browserAPI.storage.local.set({ licenseKey: message.licenseKey }, async () => {
      const valid = await verifyLicense();
      if (valid) {
        await fetchAndApplyRules();
      }
      sendResponse({ success: valid, licenseStatus });
    });
    return true; // async response
  } else if (message.action === 'refreshRules') {
    fetchAndApplyRules().then(success => sendResponse({ success }));
    return true;
  } else if (message.action === 'getDiagnostics') {
    sendResponse(diagnostics);
  } else if (message.action === 'getRulesStatus') {
    browserAPI.storage.local.get(['rulesVersion', 'rulesLastUpdated', 'rulesCount'], (result) => {
      sendResponse({
        loaded: rulesLoaded,
        version: result.rulesVersion,
        lastUpdated: result.rulesLastUpdated,
        count: result.rulesCount
      });
    });
    return true;
  }
  return true;
});

// === STRICT MODE (Google cookies) ===
let strictMode = false;
const cookieTargets = [
  { name: /^_gcl_/, domains: [/\.google\./, /\.doubleclick\.net/, /\.googlesyndication\.com/] },
  { name: /^_ga(_.*)?$/, domains: [/\.google\./, /\.googleapis\.com/, /\.doubleclick\.net/] },
  { name: /^NID$/, domains: [/\.google\./] }
];

browserAPI.storage.local.get(['strictMode'], (res) => {
  if (typeof res.strictMode === 'boolean') strictMode = res.strictMode;
});

function cookieMatchesTargets(cookie) {
  return cookieTargets.some(t => t.name.test(cookie.name) && t.domains.some(d => d.test(cookie.domain)));
}

function cookieUrl(cookie) {
  const proto = cookie.secure ? 'https://' : 'http://';
  const host = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  return proto + host + (cookie.path || '/');
}

browserAPI.cookies.onChanged.addListener((changeInfo) => {
  if (!strictMode || !changeInfo?.cookie) return;
  const c = changeInfo.cookie;
  if (cookieMatchesTargets(c)) {
    browserAPI.cookies.remove({ url: cookieUrl(c), name: c.name, storeId: c.storeId });
    diagnostics.cookiesDeleted++;
    browserAPI.storage.local.set({ diagnostics });
  }
});

// === STATS REPORTING ===
async function getExtensionId() {
  if (extensionId) return extensionId;
  const result = await browserAPI.storage.local.get(['extensionId']);
  if (result.extensionId) {
    extensionId = result.extensionId;
  } else {
    extensionId = 'ext_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    await browserAPI.storage.local.set({ extensionId });
  }
  return extensionId;
}

async function reportStats() {
  try {
    const id = await getExtensionId();
    const deltaBlocks = stats.totalBlocked - lastReportedStats.totalBlocked;
    if (deltaBlocks <= 0) return;

    const deltaByDomain = {};
    for (const [tracker, count] of Object.entries(stats.blockedByDomain)) {
      const lastCount = lastReportedStats.blockedByDomain?.[tracker] || 0;
      const delta = count - lastCount;
      if (delta > 0) deltaByDomain[tracker] = delta;
    }

    const response = await fetch(STATS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extensionId: id,
        stats: { totalBlocked: deltaBlocks, blockedByDomain: deltaByDomain },
        platform: navigator.userAgent.includes('Firefox') ? 'firefox' : 'chrome'
      })
    });

    if (response.ok) {
      lastReportedStats = JSON.parse(JSON.stringify(stats));
      console.log('[AI Privacy Shield] Stats reported:', deltaBlocks, 'blocks');
    }
  } catch (error) {
    console.warn('[AI Privacy Shield] Stats report error:', error.message);
  }
}

// === INITIALIZATION ===
async function initialize() {
  console.log('[AI Privacy Shield] Initializing...');

  // Get extension ID
  await getExtensionId();

  // Load last reported stats
  const result = await browserAPI.storage.local.get(['lastReportedStats']);
  if (result.lastReportedStats) lastReportedStats = result.lastReportedStats;

  // Verify license and load rules
  const hasValidLicense = await verifyLicense();
  if (hasValidLicense) {
    await fetchAndApplyRules();
  } else {
    console.log('[AI Privacy Shield] No valid license - protection disabled');
    // Set badge to indicate unlicensed
    browserAPI.action.setBadgeText({ text: '!' });
    browserAPI.action.setBadgeBackgroundColor({ color: '#ef4444' });
  }

  // Periodic license check and rules refresh (every hour)
  setInterval(async () => {
    const valid = await verifyLicense();
    if (valid && !rulesLoaded) {
      await fetchAndApplyRules();
    } else if (!valid) {
      await clearAllRules();
    }
  }, RULES_REFRESH_INTERVAL);

  // Stats reporting (every 5 minutes)
  setInterval(async () => {
    await reportStats();
    browserAPI.storage.local.set({ lastReportedStats });
  }, REPORT_INTERVAL);

  // Initial stats report after 30 seconds
  setTimeout(reportStats, 30000);

  console.log('[AI Privacy Shield] Initialization complete');
}

// Start initialization
initialize();
