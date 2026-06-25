// Meta AI Fingerprint Shield
// Blocks cookie-based and canvas-based device fingerprinting on meta.ai
// Runs in MAIN world to intercept page-level JavaScript APIs

(function() {
  'use strict';

  // === LAYER 1: Block dpr/wd fingerprint cookies ===
  // Meta writes device pixel ratio and window dimensions as cookies
  // that get sent with every subsequent request

  const originalCookieSetter = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie').set;
  const originalCookieGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie').get;

  const blockedCookies = ['dpr', 'wd'];

  Object.defineProperty(document, 'cookie', {
    get: function() {
      return originalCookieGetter.call(this);
    },
    set: function(value) {
      const cookieName = value.split('=')[0].trim();
      if (blockedCookies.includes(cookieName)) {
        return; // silently drop fingerprint cookies
      }
      return originalCookieSetter.call(this, value);
    },
    configurable: false
  });

  // Delete existing dpr/wd cookies if already set
  blockedCookies.forEach(name => {
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  // === LAYER 2: Neutralize canvas fingerprinting ===
  // Meta extracts canvas pixel data as a device-unique hash via toDataURL/toBlob
  // We add subtle noise to make the fingerprint non-deterministic

  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  // Track which canvases have been drawn to (fingerprint canvases are usually small, hidden)
  const drawnCanvases = new WeakSet();

  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    const ctx = originalGetContext.call(this, type, attrs);
    if (ctx && (type === '2d' || type === 'webgl' || type === 'webgl2')) {
      // Mark canvas as potentially used for fingerprinting when drawn to
      const canvas = this;
      if (type === '2d' && ctx) {
        const originalFillRect = ctx.fillRect;
        const originalFillText = ctx.fillText;
        const originalDrawImage = ctx.drawImage;

        ctx.fillRect = function() {
          drawnCanvases.add(canvas);
          return originalFillRect.apply(this, arguments);
        };
        ctx.fillText = function() {
          drawnCanvases.add(canvas);
          return originalFillText.apply(this, arguments);
        };
        ctx.drawImage = function() {
          drawnCanvases.add(canvas);
          return originalDrawImage.apply(this, arguments);
        };
      }
    }
    return ctx;
  };

  function addCanvasNoise(canvas) {
    // Only add noise to small canvases (likely fingerprint, not visible content)
    if (canvas.width > 400 || canvas.height > 400) return;
    if (canvas.width === 0 || canvas.height === 0) return;

    // Add imperceptible noise to canvas data to break fingerprint consistency
    try {
      const ctx = originalGetContext.call(canvas, '2d');
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      // Flip a few random pixel alpha values by 1 — invisible but changes the hash
      for (let i = 0; i < 10; i++) {
        const idx = (Math.floor(Math.random() * (data.length / 4)) * 4) + 3; // alpha channel
        data[idx] = data[idx] ^ 1; // flip least significant bit
      }
      ctx.putImageData(imageData, 0, 0);
    } catch (e) {
      // Canvas may be tainted (cross-origin), ignore
    }
  }

  HTMLCanvasElement.prototype.toDataURL = function() {
    if (drawnCanvases.has(this)) {
      addCanvasNoise(this);
    }
    return originalToDataURL.apply(this, arguments);
  };

  HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
    if (drawnCanvases.has(this)) {
      addCanvasNoise(this);
    }
    return originalToBlob.call(this, callback, type, quality);
  };

})();
