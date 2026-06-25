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
    ['gstatic.com/favicon', 'Google Favicon Tracking'], ['google.com/s2/favicon', 'Google Favicon Tracking'],
    ['castle.io', 'Castle.io Biometrics'], ['socure.com', 'Socure Fingerprinting'],
    ['proxsee.pscp', 'Periscope (X)'], ['x.com/i/api', 'X.com Telemetry'],
    ['meta.ai/api/analytics', 'Meta AI Analytics'], ['meta.ai/monitoring', 'Meta AI Monitoring'],
    ['maze.co', 'Maze Survey'], ['qualtrics.com', 'Qualtrics'],
    ['healthex.io', 'HealthEx'], ['functionhealth.com', 'Function Health']
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
    131: 'YouTube Stats', 132: 'YouTube Feedback', 133: 'AdBlock List Fetch',
    200: 'Kimi (Google OAuth)', 201: 'Kimi (Volcengine)', 202: 'Kimi (NetEase)',
    203: 'Kimi (Google OAuth)', 204: 'Volcengine Log SDK', 205: 'Volcengine APM',
    206: 'Volcengine APM', 207: 'Volcengine Telemetry', 208: 'DeepSeek Telemetry',
    209: 'DeepSeek Telemetry', 210: 'Volcengine Rangers', 211: 'Volcengine App Log',
    212: 'Xandr (Microsoft)', 213: 'Bidtellect', 214: 'Zenlayer',
    215: 'Casale Media', 216: 'Outbrain', 217: 'AdSafe',
    218: 'Xandr (Microsoft)', 219: 'Xandr (Microsoft)', 220: 'MoPub (X)',
    221: 'Amazon Ads', 222: 'Amazon Ads', 223: 'Magnite',
    224: 'OpenX', 225: 'PubMatic', 226: 'Claude Favicon Tracking',
    227: 'Claude Favicon Tracking', 228: 'Google Favicon Tracking',
    300: 'Meta AI Analytics', 301: 'Meta AI Monitoring', 302: 'Meta Vercel Insights',
    303: 'Meta Speed Insights', 304: 'Meta Config Exposure', 305: 'Meta Snapl',
    306: 'Meta CDN Tracking', 307: 'Meta Cookie Upgrade', 308: 'Facebook Link Tracking',
    309: 'Anthropic Sentry', 310: 'Maze Survey', 311: 'Maze App', 312: 'Maze API',
    313: 'Datadog', 314: 'Datadog', 315: 'Intercom Widget', 316: 'Intercom API',
    317: 'Intercom Assets', 318: 'Qualtrics', 319: 'Qualtrics', 320: 'Pendo',
    321: 'Amplitude', 322: 'Anthropic CDN Tracking', 323: 'Segment',
    324: 'Segment CDN', 325: 'Segment Identify', 326: 'Segment Track',
    327: 'Segment Page', 328: 'Statsig Feature Gates', 329: 'Statsig API',
    330: 'Statsig API', 331: 'GrowthBook', 332: 'GrowthBook',
    333: 'DeepSense MCP', 334: 'Dice MCP', 335: 'Lastminute MCP',
    336: 'Blockscout MCP', 337: 'Crypto.com MCP', 338: 'Kiwi MCP',
    339: 'Trivago MCP', 340: 'PubMed MCP', 341: 'Benevity MCP',
    342: 'Mermaid MCP', 343: 'Learning Commons MCP', 344: 'HubSpot MCP',
    345: 'Indeed MCP', 346: 'ZoomInfo MCP', 347: 'Day.ai MCP',
    348: 'Fireflies MCP', 349: 'Google Sign-In', 350: 'Google Tag Manager',
    351: 'Link Pay', 352: 'Stripe Fingerprint', 353: 'HealthEx API',
    354: 'HealthEx Demo', 355: 'Function Health',
    400: 'xAI Mixpanel Tunnel', 401: 'xAI Mixpanel Profiles',
    402: 'Periscope (X)', 403: 'Castle.io Biometrics', 404: 'Castle.io Risk',
    405: 'Socure Fingerprinting', 406: 'Socure Device ID',
    407: 'X.com Telemetry', 408: 'X.com User Flow', 409: 'X.com Client Events',
    410: 'Google Sign-In Logging', 411: 'Google Ads', 412: 'Google Ads',
    1001: 'Google Header Scrub', 1002: 'Google Header Scrub',
    1003: 'Google Cookie Strip', 1004: 'Google Cookie Strip',
    1005: 'Google Cookie Strip', 1006: 'Google Cookie Strip',
    1007: 'Facebook Cookie Strip', 1008: 'Facebook Cookie Strip'
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

// === Utility Functions ===

function animateCounter(element, target, duration) {
    if (!element) return;
    var start = parseInt(element.textContent.replace(/,/g, '')) || 0;
    if (start === target) return;
    var startTime = performance.now();
    var diff = target - start;

    function step(now) {
        var elapsed = now - startTime;
        var progress = Math.min(elapsed / duration, 1);
        // easeOutExpo
        var eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        var current = Math.round(start + diff * eased);
        element.textContent = current.toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function showToast(message, duration) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('toast-visible');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function() {
        toast.classList.remove('toast-visible');
        setTimeout(function() { toast.classList.add('hidden'); }, 300);
    }, duration || 3000);
}

function showConfirm(message, onConfirm) {
    var overlay = document.getElementById('confirmOverlay');
    var msg = document.getElementById('confirmMsg');
    var okBtn = document.getElementById('confirmOk');
    var cancelBtn = document.getElementById('confirmCancel');
    if (!overlay || !msg) return;

    msg.textContent = message;
    overlay.classList.remove('hidden');

    function cleanup() {
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click', handleOk);
        cancelBtn.removeEventListener('click', handleCancel);
    }

    function handleOk() { cleanup(); if (onConfirm) onConfirm(); }
    function handleCancel() { cleanup(); }

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
}

// === Main ===

document.addEventListener('DOMContentLoaded', function() {
    console.log('[AI Shield] DOM ready');

    // === LICENSE MANAGEMENT ===
    var licenseInput = document.getElementById('licenseInput');
    var activateBtn = document.getElementById('activateBtn');
    var licenseError = document.getElementById('licenseError');

    function showActivatedUI() {
        document.body.classList.remove('unlicensed');
        browserAPI.action.setBadgeText({ text: '' });
    }

    function showInactiveUI() {
        document.body.classList.add('unlicensed');
    }

    // Toggle manual key input
    var showKeyLink = document.getElementById('showKeyInput');
    var manualKeySection = document.getElementById('manualKeySection');
    if (showKeyLink && manualKeySection) {
        showKeyLink.addEventListener('click', function(e) {
            e.preventDefault();
            manualKeySection.style.display = manualKeySection.style.display === 'none' ? 'block' : 'none';
        });
    }

    // Auto-format license key
    if (licenseInput) {
        licenseInput.addEventListener('input', function(e) {
            var value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            var formatted = '';
            for (var i = 0; i < value.length && i < 20; i++) {
                if (i > 0 && i % 5 === 0) formatted += '-';
                formatted += value[i];
            }
            e.target.value = formatted;
        });

        licenseInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && activateBtn) activateBtn.click();
        });
    }

    // Activate button
    if (activateBtn) {
        activateBtn.addEventListener('click', function() {
            console.log('[AI Shield] Activate clicked');
            var key = licenseInput ? licenseInput.value.trim() : '';
            if (licenseError) licenseError.classList.add('hidden');

            if (key.length < 23) {
                if (licenseError) {
                    licenseError.textContent = 'Please enter a valid license key';
                    licenseError.classList.remove('hidden');
                }
                return;
            }

            activateBtn.disabled = true;
            activateBtn.textContent = 'Verifying...';

            browserAPI.runtime.sendMessage({ action: 'setLicenseKey', licenseKey: key }, function(response) {
                console.log('[AI Shield] License response:', response);
                activateBtn.disabled = false;
                activateBtn.textContent = 'Activate License';

                if (browserAPI.runtime.lastError) {
                    console.error('[AI Shield] Runtime error:', browserAPI.runtime.lastError);
                    if (licenseError) {
                        licenseError.textContent = 'Extension error. Try reloading.';
                        licenseError.classList.remove('hidden');
                    }
                    return;
                }

                if (response && response.success) {
                    showActivatedUI();
                } else {
                    if (licenseError) {
                        licenseError.textContent = response && response.message ? response.message : 'Invalid license key';
                        licenseError.classList.remove('hidden');
                    }
                }
            });
        });
    }

    // Check license status on popup open
    browserAPI.runtime.sendMessage({ action: 'getLicenseStatus' }, function(status) {
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
            // Check for stored device limit error
            browserAPI.storage.local.get(['deviceLimitError'], function(result) {
                if (result.deviceLimitError && licenseError) {
                    var dle = result.deviceLimitError;
                    licenseError.textContent = dle.error || 'Device limit reached. Maximum ' + (dle.devicesAllowed || 3) + ' devices per license.';
                    licenseError.classList.remove('hidden');
                }
            });
        }
    });

    // === STATS UI ===
    var lastBlockedCount = 0;

    function updateUI() {
        browserAPI.runtime.sendMessage({ action: 'getStats' }, function(stats) {
            if (browserAPI.runtime.lastError || !stats) return;

            // Blocked count with counter animation
            var totalEl = document.getElementById('totalBlocked');
            if (totalEl) {
                var newCount = stats.totalBlocked || 0;
                if (newCount !== lastBlockedCount) {
                    animateCounter(totalEl, newCount, 800);
                    totalEl.classList.add('flash');
                    setTimeout(function() { totalEl.classList.remove('flash'); }, 600);
                    lastBlockedCount = newCount;
                }
            }

            // Uptime
            var sinceEl = document.getElementById('protectedSince');
            if (sinceEl && stats.lastReset) {
                var since = new Date(stats.lastReset);
                var now = new Date();
                var totalMinutes = Math.floor((now - since) / (1000 * 60));
                var hours = Math.floor(totalMinutes / 60);
                var minutes = totalMinutes % 60;
                var days = Math.floor(hours / 24);
                var timeText;
                if (days > 0) {
                    timeText = days + 'd ' + (hours % 24) + 'h';
                } else if (hours > 0) {
                    timeText = hours + 'h ' + minutes + 'm';
                } else {
                    timeText = minutes + 'm';
                }
                sinceEl.textContent = timeText;
            }

            // Rule count (dynamic from background)
            var ruleCountEl = document.getElementById('ruleCount');
            if (ruleCountEl) {
                browserAPI.runtime.sendMessage({ action: 'getRuleCount' }, function(result) {
                    if (browserAPI.runtime.lastError || !result) return;
                    ruleCountEl.textContent = result.count + '+';
                });
            }

            // Company list
            var domainList = document.getElementById('domainList');
            var companyCountEl = document.getElementById('companyCount');
            if (domainList) {
                var hasDomainData = stats.blockedByDomain && Object.keys(stats.blockedByDomain).length > 0;
                var hasRuleData = stats.blockedByRule && Object.keys(stats.blockedByRule).length > 0;
                domainList.textContent = '';

                if (!hasDomainData && !hasRuleData) {
                    var empty = document.createElement('div');
                    empty.className = 'empty-state';
                    empty.textContent = 'No surveillance blocked yet';
                    domainList.appendChild(empty);
                    if (companyCountEl) companyCountEl.textContent = '0 src';
                } else {
                    var companyTotals = {};

                    // Use blockedByRule as primary source (rule-level granularity, maps to companies).
                    // Fall back to blockedByDomain only when blockedByRule has no data.
                    // Never merge both — they track the same blocked requests and would double-count.
                    if (hasRuleData) {
                        Object.entries(stats.blockedByRule).forEach(function(entry) {
                            var ruleId = entry[0], count = entry[1];
                            var company = ruleIdToCompany(parseInt(ruleId));
                            companyTotals[company] = (companyTotals[company] || 0) + count;
                        });
                    } else if (hasDomainData) {
                        Object.entries(stats.blockedByDomain).forEach(function(entry) {
                            var domain = entry[0], count = entry[1];
                            var company = domainToCompany(domain);
                            companyTotals[company] = (companyTotals[company] || 0) + count;
                        });
                    }

                    var sorted = Object.entries(companyTotals).sort(function(a, b) { return b[1] - a[1]; });
                    var maxCount = sorted.length > 0 ? sorted[0][1] : 1;

                    if (companyCountEl) companyCountEl.textContent = sorted.length + ' src';

                    sorted.forEach(function(entry) {
                        var company = entry[0], count = entry[1];
                        var item = document.createElement('div');
                        item.className = 'company-item';

                        var bar = document.createElement('div');
                        var ratio = count / maxCount;
                        bar.className = 'company-bar' + (ratio > 0.66 ? ' bar-high' : ratio > 0.33 ? ' bar-med' : ' bar-low');

                        var nameSpan = document.createElement('span');
                        nameSpan.className = 'company-name';
                        nameSpan.textContent = company;

                        var dots = document.createElement('span');
                        dots.className = 'company-dots';

                        var countSpan = document.createElement('span');
                        countSpan.className = 'company-count-val';
                        countSpan.textContent = count;

                        item.appendChild(bar);
                        item.appendChild(nameSpan);
                        item.appendChild(dots);
                        item.appendChild(countSpan);
                        domainList.appendChild(item);
                    });
                }
            }
        });
    }

    // === RESET BUTTON (confirm overlay) ===
    var resetBtn = document.getElementById('resetButton');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            showConfirm('Reset all statistics?', function() {
                browserAPI.runtime.sendMessage({ action: 'resetStats' }, function() {
                    lastBlockedCount = 0;
                    updateUI();
                    showToast('Statistics reset', 2000);
                });
            });
        });
    }

    // === EVIDENCE BUTTON ===
    var evidenceBtn = document.getElementById('evidenceButton');
    if (evidenceBtn) {
        evidenceBtn.addEventListener('click', function() {
            browserAPI.tabs.create({ url: 'https://reflexionsoftware.com' });
        });
    }

    // === DIAGNOSTICS BUTTON ===
    var diagBtn = document.getElementById('diagnosticsButton');
    var diagPanel = document.getElementById('diagnosticsPanel');
    if (diagBtn && diagPanel) {
        diagBtn.addEventListener('click', function() {
            var visible = diagPanel.classList.contains('diag-visible');
            diagPanel.classList.toggle('diag-visible');
            if (!visible) {
                browserAPI.runtime.sendMessage({ action: 'getDiagnostics' }, function(diag) {
                    if (browserAPI.runtime.lastError || !diag) return;
                    var el = function(id) { return document.getElementById(id); };
                    if (el('diagHeadersStripped')) el('diagHeadersStripped').textContent = diag.headersStripped || 0;
                    if (el('diagClientHints')) el('diagClientHints').textContent = diag.clientHintsBlocked || 0;
                    if (el('diagCookiesDeleted')) el('diagCookiesDeleted').textContent = diag.cookiesDeleted || 0;
                    if (el('diagEndpointsBlocked')) el('diagEndpointsBlocked').textContent = diag.endpointsBlocked || 0;
                });
            }
        });
    }

    // === EXPORT BUTTON ===
    var exportBtn = document.getElementById('exportButton');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            browserAPI.runtime.sendMessage({ action: 'getStats' }, function(stats) {
                if (browserAPI.runtime.lastError) return;
                browserAPI.runtime.sendMessage({ action: 'getDiagnostics' }, function(diag) {
                    var version = browserAPI.runtime.getManifest().version;
                    console.warn('[AI Shield] Export contains blocked-domain data that may reveal browsing patterns. Handle the exported file with care.');
                    var data = {
                        _notice: 'This file contains blocked-domain data that may reveal browsing patterns. Handle with care.',
                        timestamp: new Date().toISOString(),
                        version: version,
                        stats: stats,
                        diagnostics: diag
                    };
                    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = 'ai-shield-logs-' + Date.now() + '.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('Logs exported', 2000);
                });
            });
        });
    }

    // === PAUSE SITE BUTTONS (toast instead of alert) ===
    function pauseSite(durationMs, label) {
        browserAPI.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (!tabs[0] || !tabs[0].url) return;
            var domain;
            try {
                var parsed = new URL(tabs[0].url);
                if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                    showToast('Pause is not available on this page', 2500);
                    return;
                }
                domain = parsed.hostname;
                if (!domain) return;
            } catch (e) { return; }
            browserAPI.runtime.sendMessage({ action: 'pauseSite', domain: domain, duration: durationMs }, function(response) {
                if (response && response.success) {
                    showToast('Paused on ' + domain + ' for ' + label, 3000);
                }
            });
        });
    }

    var pauseBtn30 = document.getElementById('pauseSiteButton30');
    if (pauseBtn30) {
        pauseBtn30.addEventListener('click', function() { pauseSite(30000, '30 seconds'); });
    }

    var pauseBtn = document.getElementById('pauseSiteButton');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', function() { pauseSite(600000, '10 minutes'); });
    }

    // === REPORT TRACKER BUTTON ===
    var reportBtn = document.getElementById('reportTrackerButton');
    if (reportBtn) {
        reportBtn.addEventListener('click', function() {
            browserAPI.tabs.create({ url: 'https://reflexionsoftware.com/report-tracker' });
        });
    }

    // === GEAR MENU ===
    var gearBtn = document.getElementById('gearBtn');
    var gearMenu = document.getElementById('gearMenu');
    if (gearBtn && gearMenu) {
        gearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            gearMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', function(e) {
            if (!gearMenu.contains(e.target) && e.target !== gearBtn) {
                gearMenu.classList.add('hidden');
            }
        });
    }

    // === SHIELD PULSE ON BLOCK EVENTS ===
    var blockDebounceTimer = null;
    browserAPI.runtime.onMessage.addListener(function(msg) {
        if (msg.action === 'blockOccurred') {
            var svg = document.querySelector('#heroProtected .shield-svg');
            if (svg) {
                svg.classList.remove('pulse');
                setTimeout(function() { svg.classList.add('pulse'); }, 10);
            }
            // Debounce updateUI: wait 250ms after last block before updating
            // Prevents flicker when many blocks arrive rapidly
            if (blockDebounceTimer) clearTimeout(blockDebounceTimer);
            blockDebounceTimer = setTimeout(function() {
                blockDebounceTimer = null;
                updateUI();
            }, 250);
        }
    });

    // Stats opt-out toggle
    var statsToggle = document.getElementById('statsToggle');
    var statsIndicator = document.getElementById('statsIndicator');
    if (statsToggle) {
        // Load current state
        browserAPI.runtime.sendMessage({ action: 'getStatsOptOut' }, function(response) {
            if (browserAPI.runtime.lastError) return;
            if (response && response.optOut) {
                statsIndicator.textContent = 'OFF';
                statsIndicator.classList.add('off');
            }
        });
        statsToggle.addEventListener('click', function() {
            var isOff = statsIndicator.textContent === 'OFF';
            browserAPI.runtime.sendMessage({ action: 'setStatsOptOut', value: !isOff }, function() {
                if (browserAPI.runtime.lastError) return;
                statsIndicator.textContent = isOff ? 'ON' : 'OFF';
                statsIndicator.classList.toggle('off');
            });
        });
    }

    // Initial update and periodic refresh
    updateUI();
    setInterval(updateUI, 5000);

    console.log('[AI Shield] Popup initialized');
});
