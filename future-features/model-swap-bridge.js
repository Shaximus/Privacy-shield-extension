/**
 * AIShield Model Swap Detector - Bridge Script (ISOLATED world)
 *
 * This companion script runs in the ISOLATED world where chrome.runtime
 * is available. It listens for window.postMessage events from the MAIN
 * world model-swap-detector.js and forwards them to the background
 * service worker.
 *
 * This is necessary because MAIN world scripts cannot access chrome.runtime.
 */

(function() {
  'use strict';

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  window.addEventListener('message', (event) => {
    // Only accept messages from the same page
    if (event.source !== window) return;

    // Only accept our specific message type
    if (!event.data || event.data.type !== 'AI_SHIELD_MODEL_SWAP') return;

    const detail = event.data.detail;
    if (!detail || !detail.action) return;

    // Forward to background service worker
    try {
      browserAPI.runtime.sendMessage({
        action: detail.action,
        details: detail.details || {}
      }, () => {
        // Ignore response and any lastError (non-critical reporting)
        if (browserAPI.runtime.lastError) {
          // Silently ignore - background may not handle this message type
        }
      });
    } catch (e) {
      // Extension context may be invalidated; non-critical
    }
  });
})();
