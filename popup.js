// AI Privacy Shield - Popup UI Logic (PREMIUM)
console.log('[AI Shield] Popup script loading...');

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Domain substring → company name mapping
var DOMAIN_MAP = [
    ['statsig', 'Statsig'], ['honeycomb', 'Honeycomb'], ['segment.io', 'Segment'],
    ['segment.com', 'Segment'], ['datadog', 'Datadog'], ['volces.com', 'Volcengine'],
    ['volccdn', 'Volcengine'], ['deepseek', 'DeepSeek'], ['adnxs', 'Xandr (Microsoft)'],
    ['xandr', 'Xandr (Microsoft)'], ['bidtellect', 'Bidtellect'], ['zenlayer', 'Zenlayer'],
    ['casalemedia', 'Casale Media'], ['outbrain', 'Outbrain'], ['adsafeprotected', 'AdSafe'],
    ['mopub', 'MoPub (X)'], ['amazon-adsystem', 'Amazon Ads'], ['rubicon', 'Magnite'],
    ['openx', 'OpenX'], ['pubmatic', 'PubMatic'], ['amplitude', 'Amplitude'],
    ['mixpanel', 'Mixpanel'], ['posthog', 'PostHog'], ['intercom', 'Intercom'],
    ['google-analytics', 'Google Analytics'], ['googletagmanager', 'Google Tag Manager'],
    ['googletagservices', 'Google Tag Manager'], ['tagmanager.google', 'Google Tag Manager'],
    ['gtag', 'Google Tag Manager'], ['gtm', 'Google Tag Manager'],
    ['doubleclick', 'Google Ads'], ['googlesyndication', 'Google Ads'],
    ['ogads-pa.clients6', 'Google Ads'], ['waa-pa.clients6', 'Google Ads'],
    ['facebook.com', 'Meta'], ['sentry.io', 'Sentry'], ['sentry', 'Sentry'],
    ['cloudflareinsights', 'Cloudflare Analytics'], ['rum.cloudflare', 'Cloudflare Analytics'],
    ['static.cloudflareinsights', 'Cloudflare Analytics'], ['nel.cloudflare', 'Cloudflare NEL'],
    ['a-api.anthropic', 'Anthropic Telemetry'], ['s-cdn.anthropic', 'Anthropic CDN Tracking'],
    ['a-cdn.anthropic', 'Anthropic CDN Tracking'], ['statsig.anthropic', 'Anthropic Statsig'],
    ['claude.ai/sentry', 'Anthropic Sentry'], ['isolated-segment', 'Anthropic Segment'],
    ['chatgpt', 'OpenAI'], ['ab.chatgpt', 'OpenAI A/B Testing'],
    ['realtime.chatgpt', 'OpenAI Realtime'], ['openai', 'OpenAI'],
    ['grok', 'xAI'], ['x.ai', 'xAI'],
    ['featuregates.org', 'Statsig Feature Gates'], ['featureassets.org', 'Statsig Assets'],
    ['assetsconfigcdn.org', 'Statsig Config'], ['prodregistryv2.org', 'Statsig Registry'],
    ['launchdarkly', 'LaunchDarkly'], ['growthbook', 'GrowthBook'],
    ['fullstory', 'FullStory'], ['hotjar', 'Hotjar'], ['logrocket', 'LogRocket'],
    ['clarity.ms', 'Microsoft Clarity'], ['newrelic', 'New Relic'],
    ['bugsnag', 'Bugsnag'], ['rollbar', 'Rollbar'], ['heapanalytics', 'Heap'],
    ['pendo', 'Pendo'], ['smartlook', 'Smartlook'], ['mouseflow', 'Mouseflow'],
    ['crazyegg', 'Crazy Egg'], ['inspectlet', 'Inspectlet'],
    ['optimizely', 'Optimizely'], ['vwo.com', 'VWO'], ['split.io', 'Split'],
    ['appsflyer', 'AppsFlyer'], ['branch.io', 'Branch'], ['adjust.com', 'Adjust'],
    ['singular.net', 'Singular'], ['kochava', 'Kochava'], ['onesignal', 'OneSignal'],
    ['braze.com', 'Braze'], ['mapbox', 'Mapbox Telemetry'],
    ['hmcdn.baidu', 'Baidu Analytics'], ['hm.baidu', 'Baidu Analytics'],
    ['cstaticdun.126', 'NetEase Tracking'], ['res.wx.qq', 'WeChat Tracking'],
    ['play.google.com/log', 'Google Play'], ['csp.withgoogle', 'Google CSP'],
    ['signaler-pa', 'Google Signaler'], ['optimizationguide-pa', 'Google Optimization'],
    ['safebrowsing.google', 'Google Safe Browsing'],
    ['clients4.google.com/chrome-sync', 'Chrome Sync'], ['clientservices.googleapis', 'Chrome Services'],
    ['content-autofill', 'Google Autofill'], ['oauthaccountmanager', 'Google OAuth'],
    ['youtube.com/youtubei', 'YouTube Telemetry'], ['youtube.com/ptracking', 'YouTube Tracking'],
    ['youtube.com/api/stats', 'YouTube Stats'], ['easylist-downloads', 'AdBlock Lists'],
    ['gstatic.com/favicon', 'Google Favicon Tracking'], ['google.com/s2/favicon', 'Google Favicon Tracking']
];

// Rule ID → company name (for production getMatchedRules polling)
var RULE_ID_MAP = {
    1: 'Anthropic Statsig', 2: 'Honeycomb', 3: 'Segment', 4: 'Segment',
    5: 'Cloudflare Analytics', 6: 'Cloudflare Analytics', 7: 'Amplitude',
    8: 'Mixpanel', 9: 'PostHog', 10: 'Intercom', 11: 'Google Analytics',
    12: 'Google Tag Manager', 13: 'Google Ads', 14: 'Google Ads',
    16: 'OpenTelemetry Traces', 17: 'Metric Logging', 18: 'Statsig Feature Gates',
    19: 'Statsig Assets', 20: 'Statsig Config', 21: 'Statsig Registry',
    22: 'Cloudflare NEL', 23: 'Datadog', 24: 'OpenAI Telemetry',
    25: 'OpenAI Stats Flush', 26: 'OpenAI A/B Testing', 27: 'Google CSP',
    28: 'Meta Beacon', 29: 'Meta Relay', 30: 'Meta Error Reports',
    31: 'Meta Pixel', 32: 'Meta Browser Reporting', 33: 'Google Play',
    34: 'Intercom Widget', 35: 'Google Ads', 36: 'Google Ads',
    37: 'Volcengine', 38: 'Anthropic Telemetry', 39: 'Anthropic Telemetry',
    40: 'Anthropic Telemetry', 41: 'Anthropic Telemetry', 42: 'Amplitude Plugins',
    43: 'Google EC Plugins', 44: 'Reddit Plugins', 45: 'Anthropic CDN Tracking',
    46: 'OpenAI Realtime', 47: 'Google Signaler', 48: 'xAI Event Tracking',
    49: 'WeChat Tracking', 50: 'OpenAI Telemetry', 51: 'Gemini CSP Reports',
    52: 'Sentry', 53: 'Anthropic Telemetry', 54: 'Cloudflare Analytics',
    55: 'xAI Monitoring', 56: 'Baidu Analytics', 57: 'Baidu Analytics',
    58: 'Volcengine', 59: 'NetEase Tracking', 60: 'Google Tag Manager',
    61: 'Google Tag Manager', 62: 'Mapbox Telemetry', 63: 'Google Favicon Tracking',
    64: 'Google Favicon Tracking', 65: 'Anthropic CDN Tracking',
    66: 'Anthropic CDN Tracking', 67: 'Anthropic Segment', 68: 'Anthropic Sentry',
    69: 'Sentry', 71: 'LaunchDarkly', 72: 'GrowthBook', 73: 'FullStory',
    74: 'Hotjar', 75: 'LogRocket', 76: 'Microsoft Clarity', 77: 'New Relic',
    78: 'Bugsnag', 79: 'Rollbar', 80: 'Heap', 81: 'Pendo', 82: 'Smartlook',
    83: 'Mouseflow', 84: 'Crazy Egg', 85: 'Inspectlet', 86: 'Optimizely',
    87: 'VWO', 88: 'Volcengine', 89: 'Browser Reporting', 90: 'Log SDK',
    91: 'Beacon Tracking', 92: 'Mapbox Telemetry', 93: 'Split',
    94: 'AppsFlyer', 95: 'Branch', 96: 'Adjust', 97: 'Singular',
    98: 'Kochava', 99: 'OneSignal', 100: 'Braze', 101: 'Anthropic CDN Tracking',
    102: 'Anthropic CDN Tracking', 103: 'GIF Pixel Tracking', 104: 'Fingerprint Tracking',
    105: 'Fingerprint Tracking', 106: 'Google Favicon Tracking',
    107: 'Google Favicon Tracking', 108: 'YouTube Playback Tracking',
    109: 'xAI WebSocket Tracking', 110: 'Audio Stream Tracking',
    111: 'Mixpanel Queue', 112: 'xAI Feature Flags', 113: 'Google Tag Manager',
    114: 'Google Tag Manager', 115: 'Google Tag Services', 116: 'Google Tag Manager',
    117: 'YouTube Heartbeat', 118: 'YouTube Event Logging', 119: 'YouTube Tracking',
    120: 'Chrome Sync', 121: 'Google Optimization', 122: 'Google Safe Browsing Reports',
    123: 'Sentry', 124: 'Chrome Services', 125: 'Google Autofill',
    126: 'Google OAuth Manager', 127: 'Anthropic Statsig',
    128: 'Domain Info Tracking', 129: 'OAuth Spotlight', 130: 'Event Logging',
    131: 'YouTube Stats', 132: 'YouTube Feedback', 133: 'AdBlock List Fetch'
};

function domainToCompany(domain) {
    for (var i = 0; i < DOMAIN_MAP.length; i++) {
        if (domain.includes(DOMAIN_MAP[i][0])) return DOMAIN_MAP[i][1];
    }
    return domain;
}

function ruleIdToCompany(id) {
    return RULE_ID_MAP[id] || ('Rule ' + id);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('[AI Shield] DOM ready');

    // === LICENSE MANAGEMENT ===
    const licenseInput = document.getElementById('licenseInput');
    const activateBtn = document.getElementById('activateBtn');
    const licenseError = document.getElementById('licenseError');
    const licenseSection = document.getElementById('licenseSection');
    const statusActive = document.getElementById('statusActive');
    const statusInactive = document.getElementById('statusInactive');

    function showActivatedUI() {
        if (licenseSection) licenseSection.style.display = 'none';
        if (statusActive) statusActive.style.display = 'block';
        if (statusInactive) statusInactive.style.display = 'none';
        browserAPI.action.setBadgeText({ text: '' });
    }

    function showInactiveUI() {
        if (licenseSection) licenseSection.style.display = 'block';
        if (statusActive) statusActive.style.display = 'none';
        if (statusInactive) statusInactive.style.display = 'block';
    }

    // Auto-format license key
    if (licenseInput) {
        licenseInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            let formatted = '';
            for (let i = 0; i < value.length && i < 20; i++) {
                if (i > 0 && i % 5 === 0) formatted += '-';
                formatted += value[i];
            }
            e.target.value = formatted;
        });

        licenseInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && activateBtn) activateBtn.click();
        });
    }

    // Activate button
    if (activateBtn) {
        activateBtn.addEventListener('click', () => {
            console.log('[AI Shield] Activate clicked');
            const key = licenseInput ? licenseInput.value.trim() : '';
            if (licenseError) licenseError.style.display = 'none';

            if (key.length < 23) {
                if (licenseError) {
                    licenseError.textContent = 'Please enter a valid license key';
                    licenseError.style.display = 'block';
                }
                return;
            }

            activateBtn.disabled = true;
            activateBtn.textContent = 'Verifying...';

            browserAPI.runtime.sendMessage({ action: 'setLicenseKey', licenseKey: key }, (response) => {
                console.log('[AI Shield] License response:', response);
                activateBtn.disabled = false;
                activateBtn.textContent = 'Activate License';

                if (browserAPI.runtime.lastError) {
                    console.error('[AI Shield] Runtime error:', browserAPI.runtime.lastError);
                    if (licenseError) {
                        licenseError.textContent = 'Extension error. Try reloading.';
                        licenseError.style.display = 'block';
                    }
                    return;
                }

                if (response && response.success) {
                    showActivatedUI();
                } else {
                    if (licenseError) {
                        // FIX: Bug 2 - Correct error message property
                        licenseError.textContent = response?.message || 'Invalid license key';
                        licenseError.style.display = 'block';
                    }
                }
            });
        });
    }

    // Count active rules and display
    // Note: dynamic rules from worker currently duplicate static blocklist,
    // so we only count static to avoid double-counting
    (async function updateRuleCount() {
        var el = document.getElementById('ruleCount');
        if (el) el.textContent = '216+';
    })();

    // Check license status on popup open
    browserAPI.runtime.sendMessage({ action: 'getLicenseStatus' }, (status) => {
        if (browserAPI.runtime.lastError) {
            console.log('[AI Shield] No response from background');
            showInactiveUI();
            return;
        }
        console.log('[AI Shield] License status:', status);
        if (status && status.valid) {
            showActivatedUI();
        } else {
            showInactiveUI();
        }
    });

    // === STATS UI ===
    function updateUI() {
        browserAPI.runtime.sendMessage({ action: 'getStats' }, (stats) => {
            if (browserAPI.runtime.lastError || !stats) return;

            const totalEl = document.getElementById('totalBlocked');
            if (totalEl) totalEl.textContent = stats.totalBlocked.toLocaleString();

            const sinceEl = document.getElementById('protectedSince');
            if (sinceEl) {
                const since = new Date(stats.lastReset);
                const now = new Date();
                const hours = Math.floor((now - since) / (1000 * 60 * 60));
                const minutes = Math.floor((now - since) / (1000 * 60)) % 60;
                let timeText = hours > 24 ? `${Math.floor(hours/24)} days` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                sinceEl.textContent = timeText;
            }

            var domainList = document.getElementById('domainList');
            if (domainList) {
                var hasDomainData = stats.blockedByDomain && Object.keys(stats.blockedByDomain).length > 0;
                var hasRuleData = stats.blockedByRule && Object.keys(stats.blockedByRule).length > 0;
                domainList.textContent = '';

                if (!hasDomainData && !hasRuleData) {
                    var empty = document.createElement('div');
                    Object.assign(empty.style, { textAlign: 'center', color: '#666', padding: '20px', fontSize: '12px' });
                    empty.textContent = 'No surveillance blocked yet';
                    domainList.appendChild(empty);
                } else {
                    var companyTotals = {};

                    // Domain-based stats (from onRuleMatchedDebug in dev mode)
                    if (hasDomainData) {
                        Object.entries(stats.blockedByDomain).forEach(function(entry) {
                            var domain = entry[0], count = entry[1];
                            var company = domainToCompany(domain);
                            companyTotals[company] = (companyTotals[company] || 0) + count;
                        });
                    }

                    // Rule-based stats (from getMatchedRules polling in production)
                    if (hasRuleData) {
                        Object.entries(stats.blockedByRule).forEach(function(entry) {
                            var ruleId = entry[0], count = entry[1];
                            var company = ruleIdToCompany(parseInt(ruleId));
                            companyTotals[company] = (companyTotals[company] || 0) + count;
                        });
                    }

                    var sorted = Object.entries(companyTotals).sort(function(a, b) { return b[1] - a[1]; });
                    sorted.forEach(function(entry) {
                        var company = entry[0], count = entry[1];
                        var item = document.createElement('div');
                        item.className = 'domain-item';
                        var nameSpan = document.createElement('span');
                        nameSpan.className = 'domain-name';
                        nameSpan.textContent = company;
                        var countSpan = document.createElement('span');
                        countSpan.className = 'domain-count';
                        countSpan.textContent = count;
                        item.appendChild(nameSpan);
                        item.appendChild(countSpan);
                        domainList.appendChild(item);
                    });
                }
            }
        });
    }

    // Reset button
    const resetBtn = document.getElementById('resetButton');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Reset all statistics?')) {
                browserAPI.runtime.sendMessage({ action: 'resetStats' }, () => updateUI());
            }
        });
    }

    // Evidence button
    const evidenceBtn = document.getElementById('evidenceButton');
    if (evidenceBtn) {
        evidenceBtn.addEventListener('click', () => {
            browserAPI.tabs.create({ url: 'https://reflexionsoftware.com' });
        });
    }

    // Strict mode toggle
    const strictToggle = document.getElementById('strictToggle');
    const strictLabel = document.getElementById('strictLabel');
    if (strictToggle && strictLabel) {
        browserAPI.storage.local.get(['strictMode'], (result) => {
            const mode = result.strictMode || false;
            strictToggle.checked = mode;
            strictLabel.textContent = mode ? 'Strict Google Mode: ON' : 'Strict Google Mode: OFF';
            strictLabel.style.color = mode ? '#ff4444' : '#aaa';
        });

        strictToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            browserAPI.runtime.sendMessage({ action: 'setStrictMode', value: enabled }, (response) => {
                if (response && response.success) {
                    strictLabel.textContent = enabled ? 'Strict Google Mode: ON' : 'Strict Google Mode: OFF';
                    strictLabel.style.color = enabled ? '#ff4444' : '#aaa';
                }
            });
        });
    }

    // Diagnostics button
    const diagBtn = document.getElementById('diagnosticsButton');
    const diagPanel = document.getElementById('diagnosticsPanel');
    if (diagBtn && diagPanel) {
        diagBtn.addEventListener('click', () => {
            const visible = diagPanel.style.display === 'block';
            diagPanel.style.display = visible ? 'none' : 'block';
            if (!visible) {
                browserAPI.runtime.sendMessage({ action: 'getDiagnostics' }, (diag) => {
                    if (browserAPI.runtime.lastError || !diag) return;
                    const el = (id) => document.getElementById(id);
                    if (el('diagHeadersStripped')) el('diagHeadersStripped').textContent = diag.headersStripped || 0;
                    if (el('diagClientHints')) el('diagClientHints').textContent = diag.clientHintsBlocked || 0;
                    if (el('diagCookiesDeleted')) el('diagCookiesDeleted').textContent = diag.cookiesDeleted || 0;
                    if (el('diagEndpointsBlocked')) el('diagEndpointsBlocked').textContent = diag.endpointsBlocked || 0;
                });
            }
        });
    }

    // Export button
    const exportBtn = document.getElementById('exportButton');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            browserAPI.runtime.sendMessage({ action: 'getStats' }, (stats) => {
                if (browserAPI.runtime.lastError) return;
                browserAPI.runtime.sendMessage({ action: 'getDiagnostics' }, (diag) => {
                    const version = browserAPI.runtime.getManifest().version;
                    const data = { timestamp: new Date().toISOString(), version, stats, diagnostics: diag };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ai-shield-logs-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                });
            });
        });
    }

    // Pause site buttons
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

    const pauseBtn30 = document.getElementById('pauseSiteButton30');
    if (pauseBtn30) {
        pauseBtn30.addEventListener('click', () => pauseSite(30000, '30 seconds'));
    }

    const pauseBtn = document.getElementById('pauseSiteButton');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => pauseSite(600000, '10 minutes'));
    }

    // Report tracker button
    const reportBtn = document.getElementById('reportTrackerButton');
    if (reportBtn) {
        reportBtn.addEventListener('click', () => {
            browserAPI.tabs.create({ url: 'https://reflexionsoftware.com/report-tracker' });
        });
    }

    // Replay shield animation on block events
    browserAPI.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'blockOccurred') {
            const img = document.querySelector('.shield-icon');
            if (img) {
                const src = img.src;
                img.src = '';
                img.src = src;
            }
            updateUI();
        }
    });

    // Initial update and periodic refresh
    updateUI();
    setInterval(updateUI, 2000);

    console.log('[AI Shield] Popup initialized');
});