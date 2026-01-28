// AI Privacy Shield - Popup UI Logic

// Cross-browser compatibility
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

function updateUI() {
  browserAPI.runtime.sendMessage({ action: 'getStats' }, (stats) => {
    if (!stats) return;

    // Update total blocked
    document.getElementById('totalBlocked').textContent = stats.totalBlocked.toLocaleString();

    // Update protected since
    const since = new Date(stats.lastReset);
    const now = new Date();
    const hours = Math.floor((now - since) / (1000 * 60 * 60));
    const minutes = Math.floor((now - since) / (1000 * 60)) % 60;

    let timeText;
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      timeText = `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      timeText = `${hours}h ${minutes}m`;
    } else {
      timeText = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }

    document.getElementById('protectedSince').textContent = timeText;

    // Update domain list
    const domainList = document.getElementById('domainList');
    const domains = Object.entries(stats.blockedByDomain)
      .sort((a, b) => b[1] - a[1]); // Sort by count descending

    if (domains.length === 0) {
      domainList.innerHTML = `
        <div style="text-align: center; color: #666; padding: 20px; font-size: 12px;">
          No surveillance blocked yet
        </div>
      `;
    } else {
      domainList.innerHTML = domains.map(([domain, count]) => {
        // Map domains to surveillance companies
        let company = domain;
        if (domain.includes('statsig')) company = '🎯 Statsig (Anthropic)';
        else if (domain.includes('honeycomb')) company = '🍯 Honeycomb (Anthropic)';
        else if (domain.includes('segment')) company = '📊 Segment Analytics';
        else if (domain.includes('cloudflare')) company = '☁️ Cloudflare RUM';
        else if (domain.includes('amplitude')) company = '📈 Amplitude';
        else if (domain.includes('mixpanel')) company = '🧪 Mixpanel';
        else if (domain.includes('posthog')) company = '📉 PostHog';
        else if (domain.includes('intercom')) company = '💬 Intercom';
        else if (domain.includes('google-analytics')) company = '🔍 Google Analytics';
        else if (domain.includes('doubleclick')) company = '🎯 DoubleClick Ads';

        return `
          <div class="domain-item">
            <span class="domain-name" title="${domain}">${company}</span>
            <span class="domain-count">${count.toLocaleString()}</span>
          </div>
        `;
      }).join('');
    }
  });
}

// Reset button handler
document.getElementById('resetButton').addEventListener('click', () => {
  if (confirm('Reset all statistics?')) {
    browserAPI.runtime.sendMessage({ action: 'resetStats' }, () => {
      updateUI();
    });
  }
});

// Evidence button handler
document.getElementById('evidenceButton').addEventListener('click', () => {
  browserAPI.tabs.create({
    url: 'https://github.com/curtis-kingsley/anthropic-surveillance-evidence'
  });
});

// Strict Mode toggle handler
const strictToggle = document.getElementById('strictToggle');
const strictLabel = document.getElementById('strictLabel');

// Load strict mode state
browserAPI.storage.local.get(['strictMode'], (result) => {
  const strictMode = result.strictMode || false;
  strictToggle.checked = strictMode;
  strictLabel.textContent = strictMode ? 'Strict Google Mode: ON' : 'Strict Google Mode: OFF';
  strictLabel.style.color = strictMode ? '#ff4444' : '#aaa';
});

// Handle toggle changes
strictToggle.addEventListener('change', (e) => {
  const enabled = e.target.checked;
  browserAPI.runtime.sendMessage({ action: 'setStrictMode', value: enabled }, (response) => {
    if (response && response.success) {
      strictLabel.textContent = enabled ? 'Strict Google Mode: ON' : 'Strict Google Mode: OFF';
      strictLabel.style.color = enabled ? '#ff4444' : '#aaa';
    }
  });
});

// Pause Site button handler
document.getElementById('pauseSiteButton').addEventListener('click', () => {
  browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const url = new URL(currentTab.url);
    const domain = url.hostname;

    browserAPI.runtime.sendMessage({
      action: 'pauseSite',
      domain: domain,
      duration: 10 * 60 * 1000 // 10 minutes in ms
    }, (response) => {
      if (response && response.success) {
        alert(`Blocking paused on ${domain} for 10 minutes`);
      }
    });
  });
});

// Report Tracker button handler
document.getElementById('reportTrackerButton').addEventListener('click', () => {
  const template = `**Suspected Tracker Detected**

**Domain:** [Enter domain here, e.g., tracker.example.com]
**Platform:** [Claude/ChatGPT/Gemini/DeepSeek/Other]
**Observed Behavior:** [Describe what you noticed - e.g., "Site breaks when extension is enabled"]
**When:** [Date/time observed]

**Optional:**
- HAR file: [Attach HAR file with PII redacted]
- Screenshot: [Attach screenshot if relevant]

**Browser:** ${navigator.userAgent}
**Extension Version:** 1.4.0`;

  browserAPI.tabs.create({
    url: `https://github.com/your-username/ai-privacy-shield/issues/new?title=New%20Tracker%20Detected&body=${encodeURIComponent(template)}`
  });
});

// Diagnostics button handler
let diagnosticsVisible = false;
document.getElementById('diagnosticsButton').addEventListener('click', () => {
  diagnosticsVisible = !diagnosticsVisible;
  const panel = document.getElementById('diagnosticsPanel');
  panel.style.display = diagnosticsVisible ? 'block' : 'none';

  if (diagnosticsVisible) {
    // Update diagnostics stats
    browserAPI.runtime.sendMessage({ action: 'getDiagnostics' }, (diag) => {
      if (diag) {
        document.getElementById('diagHeadersStripped').textContent = diag.headersStripped || 0;
        document.getElementById('diagClientHints').textContent = diag.clientHintsBlocked || 0;
        document.getElementById('diagCookiesDeleted').textContent = diag.cookiesDeleted || 0;
        document.getElementById('diagEndpointsBlocked').textContent = diag.endpointsBlocked || 0;
      }
    });
  }
});

// Export button handler
document.getElementById('exportButton').addEventListener('click', () => {
  browserAPI.runtime.sendMessage({ action: 'getStats' }, (stats) => {
    browserAPI.runtime.sendMessage({ action: 'getDiagnostics' }, (diag) => {
      const exportData = {
        timestamp: new Date().toISOString(),
        version: '1.4.0',
        stats: stats,
        diagnostics: diag,
        note: 'No PII included - only blocking statistics'
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-privacy-shield-logs-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });
});

// Upgrade to Premium button
document.getElementById('upgradeButton')?.addEventListener('click', () => {
  browserAPI.tabs.create({ url: browserAPI.runtime.getURL('premium.html') });
});

// Trial tracking
function updateTrialStatus() {
  browserAPI.storage.local.get(['installDate', 'isPremium'], (result) => {
    const installDate = result.installDate || Date.now();
    const isPremium = result.isPremium || false;

    // Save install date if first time
    if (!result.installDate) {
      browserAPI.storage.local.set({ installDate: Date.now() });
    }

    const daysElapsed = Math.floor((Date.now() - installDate) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, 7 - daysElapsed);

    const trialStatusEl = document.getElementById('trialStatus');
    const daysRemainingEl = document.getElementById('daysRemaining');
    const tierStatusEl = document.getElementById('tierStatus');

    if (isPremium) {
      trialStatusEl.textContent = 'PREMIUM';
      daysRemainingEl.parentElement.innerHTML = 'Lifetime access • All <strong>37+ trackers active</strong>';
      document.getElementById('upgradeButton').style.display = 'none';
    } else if (daysRemaining > 0) {
      trialStatusEl.textContent = '7-DAY FREE TRIAL';
      daysRemainingEl.textContent = daysRemaining;
    } else {
      // Trial expired
      trialStatusEl.textContent = 'TRIAL EXPIRED';
      trialStatusEl.style.color = '#ef4444';
      daysRemainingEl.parentElement.innerHTML = '<span style="color: #ef4444;">Upgrade to continue full protection</span>';
      tierStatusEl.style.borderColor = 'rgba(239, 68, 68, 0.5)';
      tierStatusEl.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%)';
    }
  });
}

updateTrialStatus();
setInterval(updateTrialStatus, 60000); // Check every minute

// Update UI immediately and every second
updateUI();
setInterval(updateUI, 1000);
