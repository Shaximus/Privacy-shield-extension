// AI Privacy Shield - Popup UI Logic (Safari/iOS Adaptation)
// Uses browserAPI wrapper throughout (already present in Chrome version)
// No changes needed beyond verifying all calls use browserAPI.
console.log('[AI Shield] Popup script loading...');

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

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
                        licenseError.textContent = response?.licenseStatus?.error || 'Invalid license key';
                        licenseError.style.display = 'block';
                    }
                }
            });
        });
    }

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

            const domainList = document.getElementById('domainList');
            if (domainList && stats.blockedByDomain) {
                const domains = Object.entries(stats.blockedByDomain).sort((a, b) => b[1] - a[1]);
                domainList.textContent = '';

                if (domains.length === 0) {
                    const empty = document.createElement('div');
                    Object.assign(empty.style, { textAlign: 'center', color: '#666', padding: '20px', fontSize: '12px' });
                    empty.textContent = 'No surveillance blocked yet';
                    domainList.appendChild(empty);
                } else {
                    domains.forEach(([domain, count]) => {
                        let company = domain;
                        if (domain.includes('statsig')) company = 'Statsig';
                        else if (domain.includes('honeycomb')) company = 'Honeycomb';
                        else if (domain.includes('segment')) company = 'Segment';
                        else if (domain.includes('datadog')) company = 'Datadog';
                        else if (domain.includes('volces') || domain.includes('volccdn')) company = 'Volcengine';
                        else if (domain.includes('deepseek')) company = 'DeepSeek';
                        else if (domain.includes('adnxs') || domain.includes('xandr')) company = 'Xandr (Microsoft)';
                        else if (domain.includes('adnexus')) company = 'AdNexus';
                        else if (domain.includes('bidtellect')) company = 'Bidtellect';
                        else if (domain.includes('zenlayer')) company = 'Zenlayer';
                        else if (domain.includes('casalemedia')) company = 'Casale Media';
                        else if (domain.includes('outbrain')) company = 'Outbrain';
                        else if (domain.includes('adsafeprotected')) company = 'AdSafe';
                        else if (domain.includes('mopub')) company = 'MoPub (X)';
                        else if (domain.includes('amazon-adsystem') || domain.includes('adsystem.amazon')) company = 'Amazon Ads';
                        else if (domain.includes('rubicon')) company = 'Magnite';
                        else if (domain.includes('openx')) company = 'OpenX';
                        else if (domain.includes('pubmatic')) company = 'PubMatic';
                        else if (domain.includes('amplitude')) company = 'Amplitude';
                        else if (domain.includes('mixpanel')) company = 'Mixpanel';
                        else if (domain.includes('posthog')) company = 'PostHog';
                        else if (domain.includes('intercom')) company = 'Intercom';
                        else if (domain.includes('google-analytics') || domain.includes('googletagmanager')) company = 'Google Analytics';
                        else if (domain.includes('doubleclick') || domain.includes('googlesyndication')) company = 'Google Ads';
                        else if (domain.includes('facebook') || domain.includes('meta')) company = 'Meta';
                        else if (domain.includes('sentry')) company = 'Sentry';
                        else if (domain.includes('cloudflareinsights') || domain.includes('rum.cloudflare')) company = 'Cloudflare RUM';
                        else if (domain.includes('anthropic')) company = 'Anthropic';
                        else if (domain.includes('chatgpt') || domain.includes('openai')) company = 'OpenAI';
                        else if (domain.includes('grok') || domain.includes('x.ai')) company = 'xAI';

                        const item = document.createElement('div');
                        item.className = 'domain-item';
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'domain-name';
                        nameSpan.textContent = company;
                        const countSpan = document.createElement('span');
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
                    const data = { timestamp: new Date().toISOString(), version: '2.3.0', platform: 'safari', stats, diagnostics: diag };
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
            if (!tabs[0]) return;
            try {
                const domain = new URL(tabs[0].url).hostname;
                browserAPI.runtime.sendMessage({ action: 'pauseSite', domain, duration: durationMs }, (response) => {
                    if (response && response.success) alert(`Paused on ${domain} for ${label}`);
                });
            } catch (e) {
                // tabs[0].url may not be accessible on some pages
                alert('Cannot pause on this page.');
            }
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
            browserAPI.tabs.create({ url: 'https://github.com/anthropics/claude-code/issues' });
        });
    }

    // Initial update and periodic refresh
    updateUI();
    setInterval(updateUI, 2000);

    console.log('[AI Shield] Popup initialized');
});
