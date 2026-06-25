# AI Privacy Shield - Privacy Policy

**Last Updated:** March 8, 2026

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
- **Total blocked request count** (aggregate number of surveillance requests blocked)
- **Platform identifier** ("chrome")
- **Extension version** (e.g., "3.3.2")
- **One-time random UUID** (generated via `crypto.randomUUID()` per report, used solely for duplicate detection)

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
  "totalBlocked": 80,
  "platform": "chrome",
  "version": "3.3.2",
  "reportId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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

## Aggregate Statistics Transmission

AI Privacy Shield optionally transmits aggregate, anonymized blocking statistics to our servers for protection efficacy analysis and extension improvement. Each report contains: total blocked request count and a one-time random identifier for duplicate detection.

**Explicitly excluded:** URLs of visited pages; AI conversation content; browsing history; page content; persistent user identifiers; and any data enabling individual tracking.

**Technical safeguards:**
- Cryptographically secure random UUID generation (`crypto.randomUUID()`)
- HTTPS-only transmission
- Immediate server-side aggregation with no individual record retention
- 90-day aggregate data retention with automatic deletion

---

## User Rights and Data Retention

- Users may disable aggregate statistics collection at any time through extension settings.
- No individual user data is retained beyond the immediate processing of statistics reports.
- Users may request deletion of any server-side data by contacting kingsley.w.m.curtis@gmail.com.

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
- **Retention:** Aggregate statistics retained for 90 days with automatic deletion; no individual session data retained
- **Access:** Only Reflexion Software developers have access (never sold, never shared)

---

## Your Control

**Opt-Out:** Disable statistics collection in extension settings at any time.

**Transparency:** All blocking rules are open source and auditable in our GitHub repository.

**No Accounts Required:** The extension works without requiring personal information or account creation.

---

## Third-Party Services

AI Privacy Shield does not integrate with third-party analytics services, advertising networks, or data brokers. All data processing occurs through infrastructure operated exclusively by Reflexion Software.

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
- **Email:** kingsley.w.m.curtis@gmail.com
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
