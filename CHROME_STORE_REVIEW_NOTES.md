# Chrome Web Store Review Notes

## Permission Justifications

### declarativeNetRequest + declarativeNetRequestFeedback + declarativeNetRequestWithHostAccess
Core functionality: reduces AI surveillance trackers using declarativeNetRequest rule sets.
`declarativeNetRequest` provides the base blocking engine. `declarativeNetRequestFeedback`
enables `getMatchedRules()` for per-company protection statistics in the popup UI.
`declarativeNetRequestWithHostAccess` enables premium subscribers to receive encrypted
rule updates (AES-GCM, decrypted on-device with the user's license key) that include
header modification rules for enhanced tracking prevention. Rule updates are delivered
from the developer's server (api.reflexionsoftware.com) over HTTPS, decrypted locally,
and applied via `updateDynamicRules()`. Unlicensed installations receive no remote rules — protection activates after license verification.

### host_permissions: https://*/* and http://*/*
AI surveillance trackers (Segment, Statsig, Datadog, etc.) appear across the infrastructure
of AI platforms. While the extension is optimized for specific platforms--chat.openai.com,
chatgpt.com, claude.ai, gemini.google.com, chat.deepseek.com, and meta.ai--broad host
access is required because these platforms load tracker resources from dozens of third-party
domains that change frequently. Tracker domains are not predictable subdomains of the
platforms themselves; they span analytics providers, CDN endpoints, and telemetry services
hosted on unrelated domains. Restricting host permissions to only the listed platform
domains would allow the majority of tracker connections to proceed undetected. Protection
is strictly limited to tracker detection and does not interact with non-tracker page content.

### tabs
Used for WAA (Web Activity Audit) smart detection: the extension monitors open tabs to
check if the user is on a Google AI Studio API key creation page. When detected, the
extension temporarily allows essential Google authentication requests (waa-pa.clients6.google.com)
that would otherwise be affected by protection rules. This prevents the extension from
breaking legitimate Google API key creation flows. Also used by the popup to get the
current tab's domain for the per-site pause feature.

### alarms
Used for two purposes:
1. Automatic pause cleanup -- site pause durations (30s to 10min) outlive the MV3 service
   worker idle timeout. Alarms ensure pauses are properly cleared.
2. Periodic `getMatchedRules()` polling -- provides company-level protection breakdown in
   the popup UI for production (non-dev-mode) users.

### storage
Standard extension storage for license state, protection statistics, user preferences,
and service worker state persistence across MV3 lifecycle restarts.

### Content Scripts (MAIN world)
- **meta-fingerprint-shield.js**: Helps prevent device fingerprinting on meta.ai by
  neutralizing canvas fingerprinting (adds imperceptible noise to small canvas elements)
  and limiting fingerprint cookies (dpr, wd). Must run in MAIN world to intercept the
  page's canvas API calls and document.cookie setter. Strictly scoped to meta.ai and
  www.meta.ai only — no other domains.

### Data Collection
The extension optionally collects aggregate statistics: total number of blocked requests.
Explicitly excluded: URLs of visited pages; content of AI conversations; browsing history;
page content; per-domain breakdowns; and any information identifying individual users.
Each report uses a randomly generated UUID (crypto.randomUUID()) not persisted or linked
to other reports. Users can disable statistics in extension settings.
