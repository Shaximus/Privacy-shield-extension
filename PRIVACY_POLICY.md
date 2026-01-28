# AI Privacy Shield - Privacy Policy

**Last Updated:** November 8, 2025

## Our Philosophy

AI Privacy Shield exists to protect you from AI platform surveillance. We practice what we preach: **your privacy is non-negotiable.**

Unlike the surveillance platforms we block, we collect only what's necessary to improve protection and demonstrate effectiveness. No tracking. No selling data. No third-party analytics.

---

## What We Collect

### Anonymous Aggregate Statistics (Optional - Can Be Disabled)

We collect **anonymous, aggregate statistics** to:
1. Improve blocking rules
2. Identify new surveillance endpoints
3. Demonstrate global impact
4. Prioritize research efforts

**Data Collected:**
- **Block counts per domain** (e.g., "Statsig: 1,234 blocks")
- **Rule effectiveness** (which blocking rules trigger most often)
- **Platform compatibility** (Chrome version, OS type - for testing)
- **Performance metrics** (extension load time - to ensure we're not slowing your browser)
- **Error reports** (if blocking causes page breakage - helps us refine rules)
- **Geographic region** (country-level only, no city/IP)

### User-Submitted Reports (Optional - Manual Submission Only)

Users can **voluntarily submit reports** to help improve protection:

**1. New Endpoint Discovery**
- Report new surveillance endpoints discovered in the wild
- Submitted data: domain, request headers, timing information
- Optional user context (e.g., "appeared after platform update")

**2. Circumvention Detection**
- Report when platforms route surveillance through new domains
- Helps us stay ahead of evasion tactics

**3. Breaking Changes**
- Report if blocking causes functionality issues
- Helps us refine rules to block surveillance without breaking features

**4. False Positive Reports**
- Report if legitimate request was incorrectly blocked
- Ensures accuracy of blocking rules

**User Reports Include:**
- Technical data only (domains, headers, request patterns)
- NO conversation content
- NO personally identifiable information
- Fully anonymous submission option available

Reports are **never automatic** - only submitted when you click "Report" button.

**Example of collected data:**
```json
{
  "date": "2025-11-08",
  "region": "US",
  "browser": "Chrome 131",
  "blocks": {
    "statsig.com": 45,
    "mixpanel.com": 23,
    "honeycomb.io": 12
  },
  "performance": {
    "avg_load_time": "12ms"
  }
}
```

### What We Do NOT Collect

We will **NEVER** collect:
- ❌ Personally identifiable information (name, email, IP address)
- ❌ URLs you visit
- ❌ Content of your conversations with AI platforms
- ❌ Account credentials or session data
- ❌ Cookies or tracking identifiers
- ❌ Third-party analytics (no Google Analytics, Mixpanel, Statsig, etc.)

---

## How We Use Data

**Development:**
- Identify most active surveillance endpoints
- Test rule effectiveness across platforms
- Debug compatibility issues
- Measure performance impact

**Research:**
- Weekly surveillance reports (published on reflexionsoftware.com)
- Evidence-based advocacy for AI privacy
- Public awareness campaigns

**Transparency:**
- **Global statistics dashboard** (coming soon): "X million surveillance requests blocked worldwide"
- Aggregate data published openly (no individual user data)

---

## Data Storage & Security

- **Storage:** All data stored on our infrastructure (not third-party cloud)
- **Encryption:** Data encrypted in transit and at rest
- **Retention:** Aggregate statistics retained indefinitely for research; individual session data deleted after 30 days
- **Access:** Only Reflexion Software developers have access (never sold, never shared)

---

## Your Control

**Opt-Out:** Disable statistics collection in extension settings at any time.

**Transparency:** All blocking rules are open source and auditable in our GitHub repository.

**No Accounts Required:** The extension works without requiring personal information or account creation.

---

## Third-Party Services

We use **NO third-party analytics or tracking services.**

Unlike the platforms we block (who use Statsig, Mixpanel, Google Analytics, Honeycomb, etc.), we built our own privacy-respecting statistics infrastructure.

---

## Evidence-Based Blocking

All blocking rules are based on:
- **HAR captures** with SHA256 verification
- **Public documentation** of surveillance infrastructure
- **Reproducible research** published at reflexionsoftware.com

We block surveillance, not functionality. If a rule causes breakage, we refine it.

---

## Changes to This Policy

We'll notify users of privacy policy changes via:
- Extension update notifications
- reflexionsoftware.com announcements
- GitHub repository updates

---

## Contact

Questions about privacy? Contact us:
- **Email:** curtis.kingsley@reflexionsoftware.com
- **GitHub:** https://github.com/Pallyman/AIShield
- **Website:** https://reflexionsoftware.com

---

## Compliance

AI Privacy Shield complies with:
- Chrome Web Store Developer Program Policies
- GDPR (European Union)
- CCPA (California)
- General privacy best practices

---

**We protect your privacy because we believe privacy is a fundamental right, not a premium feature.**

*Reflexion Software - Deep Tech Autonomous AI Development*
