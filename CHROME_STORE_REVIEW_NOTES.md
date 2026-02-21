# Chrome Web Store Review Notes

## Permission Justifications

### webRequest
Used for `webRequest.onErrorOccurred` to count blocked surveillance requests in real time.
The extension uses `declarativeNetRequest` for actual blocking — `webRequest` is read-only
observation of block results. This is the standard pattern for privacy extensions that need
to report blocking statistics to users (similar to uBlock Origin, Privacy Badger, Ghostery).
No request modification occurs via webRequest.

### declarativeNetRequest + declarativeNetRequestFeedback + declarativeNetRequestWithHostAccess
Core functionality: blocks 216+ AI surveillance trackers using static and dynamic rule sets.
`declarativeNetRequestFeedback` is used for `getMatchedRules()` to provide per-company
blocking statistics in the popup UI.

### host_permissions: https://*/* and http://*/*
AI surveillance trackers (Google Analytics, Segment, Statsig, Datadog, etc.) appear on
any website. The extension must observe and block these requests regardless of which
site the user visits. This is standard for tracker-blocking extensions.

### cookies
Used for "Strict Google Mode" feature — deletes known tracking cookies (_ga, _gid, _gcl,
_fbp, _fbc, NID) when the user explicitly enables strict mode via the popup toggle.

### alarms
Used for two purposes:
1. Automatic pause cleanup — site pause durations (30s to 10min) outlive the MV3 service
   worker idle timeout. Alarms ensure pauses are properly cleared.
2. Periodic `getMatchedRules()` polling — provides company-level blocking breakdown in
   the popup UI for production (non-dev-mode) users.

### Content Scripts (MAIN world)
- **model-swap-detector.js**: Intercepts fetch/XHR on AI platforms (Claude, ChatGPT, Gemini,
  Grok) to verify the AI model returned matches the model requested. Must run in MAIN
  world to intercept page-level fetch calls before the platform's own code processes them.
  Only reads the `model` field from request/response bodies.
- **meta-fingerprint-shield.js**: Blocks device fingerprinting on meta.ai by neutralizing
  canvas fingerprinting and blocking fingerprint cookies. Must run in MAIN world to
  intercept the page's canvas API calls.

### Data Collection
The extension reports only aggregate total blocked count to the server (no per-domain
data, no URLs, no browsing history). See PRIVACY_POLICY.md for full disclosure.
