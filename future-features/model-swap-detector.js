// AI Privacy Shield - Model Swap Detector
// Intercepts AI API calls and verifies requested model matches returned model

(function() {
  'use strict';

  // Only run on AI platforms
  const AI_DOMAINS = [
    'claude.ai',
    'anthropic.com',
    'chat.openai.com',
    'chatgpt.com',
    'api.openai.com',
    'gemini.google.com',
    'aistudio.google.com',
    'grok.x.ai',
    'kimi.moonshot.cn'
  ];

  const currentHost = window.location.hostname;
  const isAIPlatform = AI_DOMAINS.some(d => currentHost === d || currentHost.endsWith('.' + d));
  if (!isAIPlatform) return;

  console.log('[AI Privacy Shield] Model swap detector active on', currentHost);

  // Track detected swaps for reporting
  let swapCount = 0;
  let lastSwapDetails = null;

  // Normalize model names for comparison
  function normalizeModel(model) {
    if (!model) return null;
    // Strip date suffixes: "claude-opus-4-5-20251101" -> "claude-opus-4-5"
    return model.replace(/-\d{8}$/, '').toLowerCase();
  }

  // Extract model from streaming SSE response
  function extractModelFromStream(text) {
    // Look for model in message_start event
    const match = text.match(/"model"\s*:\s*"([^"]+)"/);
    return match ? match[1] : null;
  }

  // Sanitize text for display
  function sanitize(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.textContent;
  }

  // Show fraud alert banner using safe DOM methods
  function showSwapAlert(requested, returned) {
    // Remove existing banner if present
    const existing = document.getElementById('ai-shield-swap-alert');
    if (existing) existing.remove();

    // Create style element
    const style = document.createElement('style');
    style.textContent = `
      #ai-shield-swap-alert {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 2147483647;
        background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%);
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 16px 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        animation: aiShieldSlideDown 0.3s ease-out;
      }
      @keyframes aiShieldSlideDown {
        from { transform: translateY(-100%); }
        to { transform: translateY(0); }
      }
      #ai-shield-swap-alert .alert-content {
        max-width: 900px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        gap: 20px;
      }
      #ai-shield-swap-alert .alert-icon {
        font-size: 32px;
        animation: aiShieldPulse 1s infinite;
      }
      @keyframes aiShieldPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      #ai-shield-swap-alert .alert-text { flex: 1; }
      #ai-shield-swap-alert .alert-title {
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      #ai-shield-swap-alert .alert-details {
        font-size: 14px;
        opacity: 0.95;
      }
      #ai-shield-swap-alert .model-name {
        font-family: monospace;
        background: rgba(0,0,0,0.2);
        padding: 2px 6px;
        border-radius: 3px;
      }
      #ai-shield-swap-alert .alert-actions {
        display: flex;
        gap: 10px;
      }
      #ai-shield-swap-alert button {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        transition: all 0.2s;
      }
      #ai-shield-swap-alert .btn-report {
        background: white;
        color: #cc0000;
      }
      #ai-shield-swap-alert .btn-dismiss {
        background: rgba(255,255,255,0.2);
        color: white;
      }
    `;

    // Build DOM structure safely
    const banner = document.createElement('div');
    banner.id = 'ai-shield-swap-alert';

    const content = document.createElement('div');
    content.className = 'alert-content';

    const icon = document.createElement('div');
    icon.className = 'alert-icon';
    icon.textContent = '🚨';

    const textDiv = document.createElement('div');
    textDiv.className = 'alert-text';

    const title = document.createElement('div');
    title.className = 'alert-title';
    title.textContent = 'MODEL SUBSTITUTION DETECTED';

    const details = document.createElement('div');
    details.className = 'alert-details';
    details.appendChild(document.createTextNode('You requested '));

    const reqSpan = document.createElement('span');
    reqSpan.className = 'model-name';
    reqSpan.textContent = sanitize(requested);
    details.appendChild(reqSpan);

    details.appendChild(document.createTextNode(' but received '));

    const retSpan = document.createElement('span');
    retSpan.className = 'model-name';
    retSpan.textContent = sanitize(returned || 'UNKNOWN');
    details.appendChild(retSpan);

    textDiv.appendChild(title);
    textDiv.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'alert-actions';

    const reportBtn = document.createElement('button');
    reportBtn.className = 'btn-report';
    reportBtn.textContent = 'Report Fraud';
    reportBtn.onclick = () => {
      const evidence = {
        timestamp: new Date().toISOString(),
        platform: currentHost,
        requested_model: requested,
        returned_model: returned,
        url: window.location.origin + window.location.pathname
      };
      navigator.clipboard.writeText(JSON.stringify(evidence, null, 2));
      alert('Evidence copied to clipboard. Report this to the platform or share at reflexionsoftware.com/report-fraud');
    };

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn-dismiss';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.onclick = () => banner.remove();

    actions.appendChild(reportBtn);
    actions.appendChild(dismissBtn);

    content.appendChild(icon);
    content.appendChild(textDiv);
    content.appendChild(actions);
    banner.appendChild(style);
    banner.appendChild(content);

    document.body.appendChild(banner);

    // Log to extension via postMessage bridge (MAIN world cannot use chrome.runtime)
    try {
      window.postMessage({
        type: 'AI_SHIELD_MODEL_SWAP',
        detail: {
          action: 'modelSwapDetected',
          details: { requested, returned, platform: currentHost }
        }
      }, '*');
    } catch (e) {}
  }

  // Show "model not confirmed" warning (less severe)
  function showNoConfirmationWarning(requested) {
    const existing = document.getElementById('ai-shield-no-confirm');
    if (existing) return;

    const style = document.createElement('style');
    style.textContent = `
      #ai-shield-no-confirm {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 2147483646;
        background: linear-gradient(135deg, #ff9900 0%, #cc7700 100%);
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 12px 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        font-size: 14px;
        text-align: center;
      }
      #ai-shield-no-confirm .model-name {
        font-family: monospace;
        background: rgba(0,0,0,0.2);
        padding: 2px 6px;
        border-radius: 3px;
      }
      #ai-shield-no-confirm .dismiss {
        margin-left: 20px;
        cursor: pointer;
        opacity: 0.8;
      }
    `;

    const banner = document.createElement('div');
    banner.id = 'ai-shield-no-confirm';
    banner.appendChild(style);
    banner.appendChild(document.createTextNode('⚠️ '));

    const strong = document.createElement('strong');
    strong.textContent = 'MODEL NOT CONFIRMED';
    banner.appendChild(strong);

    banner.appendChild(document.createTextNode(' - Cannot verify you received '));

    const modelSpan = document.createElement('span');
    modelSpan.className = 'model-name';
    modelSpan.textContent = sanitize(requested);
    banner.appendChild(modelSpan);

    const dismiss = document.createElement('span');
    dismiss.className = 'dismiss';
    dismiss.textContent = '✕';
    dismiss.onclick = () => banner.remove();
    banner.appendChild(dismiss);

    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 10000);
  }

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [url, options] = args;
    const urlStr = typeof url === 'string' ? url : url?.url || '';

    // Check if this is an AI API call
    const isAPICall = urlStr.includes('/v1/messages') ||
                      urlStr.includes('/chat/completions') ||
                      urlStr.includes('/v1/chat') ||
                      urlStr.includes('/completion');

    if (!isAPICall || !options?.body) {
      return originalFetch.apply(this, args);
    }

    // Extract requested model from request body
    let requestedModel = null;
    try {
      const body = JSON.parse(options.body);
      requestedModel = body.model;
    } catch (e) {}

    if (!requestedModel) {
      return originalFetch.apply(this, args);
    }

    console.log('[AI Privacy Shield] Intercepted API call, requested model:', requestedModel);

    // Make the actual request
    const response = await originalFetch.apply(this, args);

    // Clone response to read body without consuming it
    const clone = response.clone();
    const contentType = response.headers.get('content-type') || '';

    // Read and check the response for model
    try {
      let returnedModel = null;

      if (contentType.includes('text/event-stream')) {
        // Streaming response - read first chunk for model
        const reader = clone.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Read until we find the model or hit 10KB
        try {
          while (buffer.length < 10000) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            returnedModel = extractModelFromStream(buffer);
            if (returnedModel) break;
          }
        } finally {
          reader.cancel().catch(() => {});
        }

      } else if (contentType.includes('application/json')) {
        // JSON response
        const data = await clone.json();
        returnedModel = data.model;
      }

      // Compare models
      if (returnedModel) {
        const reqNorm = normalizeModel(requestedModel);
        const retNorm = normalizeModel(returnedModel);

        console.log('[AI Privacy Shield] Model comparison:', reqNorm, 'vs', retNorm);

        if (reqNorm !== retNorm) {
          // MISMATCH DETECTED!
          console.error('[AI Privacy Shield] MODEL SWAP DETECTED!', requestedModel, '->', returnedModel);
          swapCount++;
          lastSwapDetails = { requested: requestedModel, returned: returnedModel };
          showSwapAlert(requestedModel, returnedModel);
        }
      } else {
        // Could not confirm model
        console.warn('[AI Privacy Shield] Could not confirm model in response');
        if (swapCount === 0) {
          showNoConfirmationWarning(requestedModel);
        }
      }

    } catch (e) {
      console.warn('[AI Privacy Shield] Error checking response:', e);
    }

    return response;
  };

  // Also intercept XMLHttpRequest for older implementations
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._aiShieldUrl = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const url = this._aiShieldUrl || '';
    const isAPICall = url.includes('/v1/messages') ||
                      url.includes('/chat/completions') ||
                      url.includes('/completion');

    if (isAPICall && body) {
      try {
        const data = JSON.parse(body);
        if (data.model) {
          console.log('[AI Privacy Shield] XHR API call, requested model:', data.model);
          this._aiShieldRequestedModel = data.model;
        }
      } catch (e) {}
    }

    // Listen for response
    if (this._aiShieldRequestedModel) {
      this.addEventListener('load', function() {
        try {
          const responseText = this.responseText;
          const returnedModel = extractModelFromStream(responseText);

          if (returnedModel) {
            const reqNorm = normalizeModel(this._aiShieldRequestedModel);
            const retNorm = normalizeModel(returnedModel);

            if (reqNorm !== retNorm) {
              console.error('[AI Privacy Shield] XHR MODEL SWAP!', this._aiShieldRequestedModel, '->', returnedModel);
              showSwapAlert(this._aiShieldRequestedModel, returnedModel);
            }
          }
        } catch (e) {}
      });
    }

    return originalXHRSend.apply(this, arguments);
  };

  console.log('[AI Privacy Shield] Model swap detector initialized');
})();
