/**
 * AIShield Content Script - Auto-activation UI (Safari/iOS Adaptation)
 *
 * Changes from Chrome version:
 * - Replaced chrome.runtime.sendMessage with browserAPI wrapper
 * - Replaced chrome.runtime.onMessage with browserAPI wrapper
 * - Safari does not support externally_connectable, so license activation
 *   relies entirely on the URL parameter approach:
 *   The Stripe success page redirects to reflexionsoftware.com/success
 *   with ?aishield_license=KEY&aishield_status=success URL params.
 *   This content script reads those params and sends to background.
 *
 * Security:
 * - P0-5 XSS fix: DOM-based safe injection (no innerHTML)
 * - License key format validation before sending
 * - All text content set via textContent (escapes HTML)
 */

(function() {
  'use strict';

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // Prevent double-injection
  if (window.aishieldAutoActivated) return;
  window.aishieldAutoActivated = true;

  const CHECK_INTERVAL = 1000; // Check every second
  const MAX_CHECKS = 10; // Stop after 10 attempts
  let checkCount = 0;
  let checkInterval;

  /**
   * SECURITY FIX P0-5: Safe DOM construction (no innerHTML)
   * Creates license activation UI using safe DOM APIs
   */
  function createActivationBox(message) {
    // Container
    const container = document.createElement('div');
    container.id = 'aishield-activation-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Inner box
    const box = document.createElement('div');
    box.style.cssText = `
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #0f3460;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      max-width: 320px;
      text-align: center;
      color: #eaeaea;
    `;

    // Success icon (using text, not HTML)
    const icon = document.createElement('div');
    icon.textContent = '\u2705';
    icon.style.cssText = `
      font-size: 48px;
      margin-bottom: 16px;
      line-height: 1;
    `;

    // Title
    const title = document.createElement('h3');
    title.textContent = 'AIShield Premium Activated!';
    title.style.cssText = `
      margin: 0 0 12px 0;
      font-size: 18px;
      font-weight: 600;
      color: #ffffff;
    `;

    // Message
    const msg = document.createElement('p');
    msg.textContent = message || 'Your premium license has been successfully activated. All protection features are now enabled.';
    msg.style.cssText = `
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
      color: #b8b8b8;
    `;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Got it!';
    closeBtn.style.cssText = `
      margin-top: 16px;
      padding: 10px 24px;
      background: #e94560;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
      -webkit-tap-highlight-color: transparent;
    `;
    closeBtn.onmouseenter = () => { closeBtn.style.background = '#ff6b6b'; };
    closeBtn.onmouseleave = () => { closeBtn.style.background = '#e94560'; };
    closeBtn.onclick = () => {
      container.remove();
    };

    // Assemble
    box.appendChild(icon);
    box.appendChild(title);
    box.appendChild(msg);
    box.appendChild(closeBtn);
    container.appendChild(box);

    return container;
  }

  /**
   * Check for license activation parameters in URL
   */
  function checkForLicenseActivation() {
    try {
      const url = new URL(window.location.href);
      const licenseKey = url.searchParams.get('aishield_license');
      const activationStatus = url.searchParams.get('aishield_status');

      if (licenseKey && activationStatus === 'success') {
        // SECURITY FIX: Validate license key format before sending
        const LICENSE_KEY_REGEX = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

        if (!LICENSE_KEY_REGEX.test(licenseKey)) {
          console.warn('[AIShield] Invalid license key format in URL');
          return;
        }

        // Send to background script for verification
        browserAPI.runtime.sendMessage(
          { action: 'verifyLicense', licenseKey: licenseKey },
          (response) => {
            if (response && response.success) {
              showActivationSuccess();
            } else {
              console.warn('[AIShield] License verification failed:', response?.message);
            }
          }
        );

        // Clean up URL
        url.searchParams.delete('aishield_license');
        url.searchParams.delete('aishield_status');
        window.history.replaceState({}, document.title, url.toString());
      }
    } catch (error) {
      console.error('[AIShield] Error checking license activation:', error);
    }
  }

  /**
   * Show activation success UI
   */
  function showActivationSuccess() {
    // Remove existing notification if any
    const existing = document.getElementById('aishield-activation-container');
    if (existing) existing.remove();

    // Create and show new notification (SAFE - no innerHTML)
    const notification = createActivationBox();
    document.body.appendChild(notification);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 10000);
  }

  /**
   * Listen for messages from extension
   */
  browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showActivationSuccess') {
      showActivationSuccess();
      sendResponse({ success: true });
    }
    return true;
  });

  // Start checking for license activation
  checkInterval = setInterval(() => {
    checkCount++;
    checkForLicenseActivation();

    if (checkCount >= MAX_CHECKS) {
      clearInterval(checkInterval);
    }
  }, CHECK_INTERVAL);

  // Initial check
  checkForLicenseActivation();

})();
