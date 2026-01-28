# 🛡️ AI Privacy Shield

**Block AI surveillance while keeping AI platforms functional.**

A browser extension that surgically blocks keystroke logging, session recording, and telemetry from AI platforms (Anthropic Claude, OpenAI ChatGPT, Google Gemini, xAI Grok, etc.) while keeping the platforms themselves fully operational.

---

## 🚨 The Problem

Major AI companies are conducting surveillance on their users:

### Documented Evidence:

Based on HAR (HTTP Archive) captures from November 2025:

**Anthropic (Claude.ai)**
- Keystroke logging via Cloudflare RUM (81 surveillance JS files)
- Session recording at 100% rate via Statsig (`session_recording_rate: 1`)
- PII transmission (email, IP, organizationUUID, accountUuid)
- Data sent to 5+ third-party services (Honeycomb, Segment, Statsig, Cloudflare, Amplitude)
- 164 Honeycomb requests in single session (18.6% of network traffic)

**OpenAI (ChatGPT)**
- 1,624 total requests per session, 1,175 telemetry requests (72.3% surveillance traffic)
- CES (Client Event System) - 1,056 POST requests to `/ces/v1/t` (Segment.io telemetry)
- 297 CDN chunk requests (cdn.oaistatic.com) - some contain surveillance code
- 117 A/B testing requests (ab.chatgpt.com) - feature flag enrollment
- Datadog RUM tracking (browser-intake-datadoghq.com) - model slug leaks
- Tracks userId, device_id, account_plan_type, every conversation event
- 83MB HAR file (extended session capture)

**Google (Gemini)**
- 332 POST requests per session (telemetry payload bombing)
- `play.google.com/log` - 75 requests sending browser fingerprint, OS details, timing metrics
- `signaler-pa.clients6.google.com` - 50 requests with real-time signaling telemetry
- SAPISID authentication hash links activity to Google account
- Google Ads AsyncData tracking via `ogads-pa.clients6.google.com`
- Web Activity API tracking via `waa-pa.clients6.google.com`
- 36.6MB and 49.9MB HAR files (largest surveillance footprint)

**xAI (Grok)**
- 894 total requests per session, 804 surveillance requests (90% POST traffic)
- 583 telemetry endpoints (Statsig + Mixpanel + log_metric)
- Server-Side Feature Flags (`ssff.grok.com`)
- PII transmission (email, subscription tier, stable device ID)
- Granular tracking (scroll depth, page view time to millisecond)

**Meta AI**
- Facebook BZ telemetry beacons (`/ajax/bz`)
- Integrated with Facebook's surveillance infrastructure
- Not privacy-isolated - part of Facebook ecosystem

**Evidence:** Network captures (HAR format) showing request/response data, telemetry endpoints, and PII transmission

---

## ✅ The Solution

AI Privacy Shield blocks surveillance **without breaking the platforms**.

### What Gets Blocked:

✅ **Statsig** - Session recording, feature flags, A/B testing
✅ **Honeycomb** - Distributed tracing, telemetry collection
✅ **Segment** - Analytics aggregation
✅ **Cloudflare RUM** - Keystroke logging, user monitoring
✅ **Amplitude** - Product analytics
✅ **Mixpanel** - Behavioral tracking
✅ **PostHog** - Session replay
✅ **Google Analytics** - Tracking
✅ **DoubleClick / Ad networks** - Advertising surveillance

### What Stays Working:

✅ Claude.ai (core AI functionality)
✅ ChatGPT (core AI functionality)
✅ Google Gemini
✅ xAI Grok
✅ All other AI platforms

---

## 📊 Features

- **Real-time blocking** - Surveillance stopped before it leaves your browser
- **Live statistics** - See exactly how many surveillance requests were blocked
- **Breakdown by company** - Track which surveillance companies are trying to spy on you
- **Zero configuration** - Works immediately after installation
- **Lightweight** - Uses Chrome's native declarativeNetRequest API (no performance impact)
- **Evidence-based** - Built from documented network analysis with SHA256-verified HAR captures
- **Weekly updates** - New platforms and damning evidence added every week
- **Animated protection** - Pulsing icon shows active blocking in real-time

---

## 🚀 Installation

### Chrome / Chromium / Brave / Edge

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `ai-privacy-shield` directory
6. ✅ Extension installed! Badge will show blocked requests in real-time.

### Firefox

1. Download or clone this repository
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select `manifest.json` from the `ai-privacy-shield` directory
5. ✅ Extension installed! Badge will show blocked requests in real-time.

---

## 📈 Usage

1. **Install the extension** (see above)
2. **Browse AI platforms normally** (claude.ai, chatgpt.com, etc.)
3. **Click the extension icon** to see statistics:
   - Total surveillance requests blocked
   - Breakdown by surveillance company
   - Time protected
4. **That's it!** The extension works automatically.

---

## 🔬 Technical Details

### Blocking Mechanism

Uses Chrome's `declarativeNetRequest` API to block requests at the network level before they're sent. This is:
- **Faster** than content blockers (no DOM manipulation)
- **More reliable** than hosts file blocking (catches embedded endpoints)
- **More surgical** than IP blocking (doesn't break platform functionality)

### Blocked Patterns

The extension blocks requests matching these patterns:

```javascript
*statsig*                      // Statsig session recording
*honeycomb.io*                 // Honeycomb telemetry
*segment.io*, *segment.com*    // Segment analytics
*cloudflareinsights*           // Cloudflare RUM
*amplitude.com*                // Amplitude analytics
*mixpanel.com*                 // Mixpanel tracking
*posthog.com*                  // PostHog session replay
*google-analytics.com*         // Google Analytics
*doubleclick.net*              // DoubleClick ads
*play.google.com/log*          // Google Play telemetry (Gemini)
*signaler-pa.clients6.google.com*  // Google real-time signaling (Gemini)
*ogads-pa.clients6.google.com*     // Google Ads AsyncData (Gemini)
*waa-pa.clients6.google.com*       // Google Web Activity API (Gemini)
*ssff.grok.com*                // Grok Server-Side Feature Flags
*/api/bootstrap/*/statsig*     // Embedded Statsig in platform APIs
*/ces/v1/t*                    // ChatGPT Segment telemetry
*/ajax/bz*                     // Meta AI telemetry beacon
*facebook.com/tr/*             // Facebook Pixel
```

Full rules: `rules/blocklist.json`

### Why This Works

AI platforms load surveillance scripts from third-party domains or embedded API endpoints. By blocking these specific patterns while allowing the core platform domains (claude.ai, chatgpt.com, etc.), the platforms remain functional but can't exfiltrate your data.

---

## 📊 Evidence

This extension is based on documented evidence of AI surveillance:

### Evidence Documentation

**Contents:**
- Network traffic captures (HAR files) showing surveillance requests
- JavaScript files implementing tracking and telemetry
- Statsig configuration showing `session_recording_rate: 1` (100%)
- Screenshots and technical analysis
- Cryptographic verification (SHA256)

### Key Findings

**Statsig Session Recording (Anthropic):**
```javascript
session_recording_rate: 1  // 100% of sessions recorded
```

**Honeycomb Trace Exfiltration:**
- 164 requests in a single session
- 18.6% of all network traffic
- Complete user behavior telemetry

**Cloudflare RUM Keystroke Logging:**
- 81 surveillance JavaScript files loaded
- Real User Monitoring (RUM) captures keystrokes, mouse movements, clicks
- Transmitted without explicit consent

---

## 🛡️ Privacy Commitment

This extension:
- ✅ Blocks surveillance traffic only
- ✅ Collects anonymous aggregate statistics (total blocks, endpoint counts)
- ✅ Does NOT collect personal information
- ✅ Runs entirely locally in your browser
- ✅ Evidence-based blocking rules

**We block surveillance. We don't do surveillance.**

---

## 🔬 Continuous Research

**New platforms and evidence added weekly.**

We actively monitor AI platforms for surveillance infrastructure:
- Capture HAR files and network traffic
- Document new telemetry endpoints
- Verify with SHA256 hashes
- Update blocking rules
- Publish evidence reports

**Recent additions:**
- ChatGPT: 1,624 requests, 72.3% surveillance (Nov 8, 2025)
- Grok: 894 requests, 90% POST telemetry (Nov 7, 2025)
- Meta AI: Facebook integration surveillance (Nov 7, 2025)

**This is a living product.** Your subscription funds ongoing surveillance research and weekly protection updates.

---

## 🐛 Bug Reports

Found a surveillance endpoint that isn't being blocked?

1. Capture evidence (HAR files, screenshots, network logs)
2. Open an issue with the evidence
3. We'll review and update the blocklist

---

## 📜 License & Pricing

**Proprietary Software** - All rights reserved.

### Individual Pricing

**📅 Monthly: $0.99/month**
- Cancel anytime
- Try risk-free
- Same features as other tiers
- Billed monthly

**⭐ Annual: $9.99/year** (BEST VALUE - Save 17%)
- Less than $1/month
- Same as 10 months of monthly pricing
- All features unlocked
- Billed yearly

**💎 Lifetime: $24.99** (one-time payment)
- Pay once, protected forever
- Never pay again
- All features unlocked
- All future updates included

### Enterprise Licensing

Custom pricing available for organizations. Contact for volume licensing and deployment options.

Built to protect user privacy in the age of AI surveillance.

---

## 👥 Author

**Curtis Kingsley** - Security research and development

Based on documented surveillance evidence collected October-November 2025.

---

## 🔗 Links

- **GitHub Repository:** [github.com/Pallyman/AIShield](https://github.com/Pallyman/AIShield)
- **Issue Tracker:** Report new surveillance endpoints or bugs
- **Technical Documentation:** See `rules/blocklist.json` for full blocking rules

---

## ⚖️ Legal

This extension is provided for legitimate privacy protection. The surveillance practices documented here may violate:
- GDPR (€20M penalties)
- CCPA ($2,500-$7,500 per violation)
- Federal Wiretap Act (criminal penalties)

Users have the right to block surveillance of their own browsing activity.

---

*No more keystroke logging. No more session recording. Just AI, without the surveillance.*
