#!/usr/bin/env node
/**
 * Weekly Scorecard Generator for AI Privacy Shield
 *
 * Reads exported logs and generates a public accountability report
 * Usage: node generate-scorecard.js <exported-logs.json>
 */

const fs = require('fs');

if (process.argv.length < 3) {
  console.error('Usage: node generate-scorecard.js <exported-logs.json>');
  process.exit(1);
}

const logFile = process.argv[2];

if (!fs.existsSync(logFile)) {
  console.error(`Error: File not found: ${logFile}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(logFile, 'utf8'));

const stats = data.stats || {};
const diag = data.diagnostics || {};
const timestamp = data.timestamp || new Date().toISOString();

// Calculate week range
const date = new Date(timestamp);
const endDate = date.toISOString().split('T')[0];
const startDate = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

// Generate markdown report
const report = `## AI Privacy Shield - Weekly Surveillance Scorecard
**Week of ${startDate} to ${endDate}**

---

### 📊 Surveillance Attempts Blocked

**Total Blocked:** ${stats.totalBlocked?.toLocaleString() || 0} requests

**Breakdown by Company:**

${Object.entries(stats.blockedByDomain || {})
  .sort((a, b) => b[1] - a[1])
  .map(([company, count]) => `- **${company}:** ${count.toLocaleString()} attempts`)
  .join('\n')}

---

### 🔬 Advanced Protection (Last 15 Minutes)

- **Headers Stripped (x-client-data):** ${diag.headersStripped || 0}
- **Client Hints Blocked (sec-ch-ua-*):** ${diag.clientHintsBlocked || 0}
- **Analytics Cookies Deleted:** ${diag.cookiesDeleted || 0}
- **Endpoints Blocked:** ${diag.endpointsBlocked || 0}

---

### 📈 Platform Coverage

✅ **Anthropic Claude** - Statsig, Honeycomb, Cloudflare RUM blocked
✅ **OpenAI ChatGPT** - Segment, Datadog, A/B testing blocked
✅ **Google Gemini** - Play telemetry, Client Hints stripped, Cookies deleted
✅ **xAI Grok** - Mixpanel, Statsig CDN blocked
✅ **Meta AI** - Facebook Pixel, telemetry beacon blocked
✅ **DeepSeek** - ByteDance Gator telemetry blocked

---

### 🎯 What This Means

Every blocked request represents an attempt to:
- Track your browsing behavior
- Fingerprint your device
- Link AI usage to your identity
- Collect behavioral analytics
- Build advertising profiles

**AI Privacy Shield turns surveillance into statistics.**

---

### 🚀 Get Protected

Download: [AI Privacy Shield](https://github.com/your-username/ai-privacy-shield)

**Free & Open Source** | **No Data Collection** | **Local-Only**

---

*Report generated from AI Privacy Shield v${data.version || '3.3.1'}*
*No PII included - only blocking statistics*
`;

console.log(report);

// Optionally save to file
const outputFile = `scorecard-${startDate}-to-${endDate}.md`;
fs.writeFileSync(outputFile, report);
console.error(`\n✅ Scorecard saved to: ${outputFile}`);
