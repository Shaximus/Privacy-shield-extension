# Chrome Web Store Deployment Guide

## Two-Extension Model

This extension uses separate Chrome Web Store listings for Free and Premium tiers.
Google enforces payment - users cannot bypass by editing files.

## Directory Structure

```
📁 AIShield/
├── 📁 free/                    # Free tier package
│   ├── manifest.json           # Copy of manifest_free.json
│   ├── popup.html              # Copy of popup_free.html  
│   ├── popup.js                # Copy of popup_free.js
│   ├── background.js
│   ├── rules/blocklist.json    # Copy of blocklist_free.json
│   └── ... (shared assets)
│
├── 📁 premium/                 # Premium tier package
│   ├── manifest.json           # Copy of manifest_premium.json
│   ├── popup.html              # Copy of popup_premium.html
│   ├── popup.js                # Copy of popup_premium.js
│   ├── background.js
│   ├── rules/blocklist.json    # Full blocklist
│   └── ... (shared assets)
```

## Deployment Steps

### 1. Create Free Extension Package

```bash
mkdir -p deploy/free
cp manifest_free.json deploy/free/manifest.json
cp popup_free.html deploy/free/popup.html
cp popup_free.js deploy/free/popup.js
cp background.js deploy/free/
cp -r icons deploy/free/
cp -r animated-icons deploy/free/
mkdir -p deploy/free/rules
cp rules/blocklist_free.json deploy/free/rules/blocklist.json
cd deploy/free && zip -r ../ai-privacy-shield-free.zip .
```

### 2. Create Premium Extension Package

```bash
mkdir -p deploy/premium
cp manifest_premium.json deploy/premium/manifest.json
cp popup_premium.html deploy/premium/popup.html
cp popup_premium.js deploy/premium/popup.js
cp background.js deploy/premium/
cp -r icons deploy/premium/
cp -r animated-icons deploy/premium/
mkdir -p deploy/premium/rules
cp rules/blocklist.json deploy/premium/rules/
cp rules/google_header_scrub.json deploy/premium/rules/
cd deploy/premium && zip -r ../ai-privacy-shield-premium.zip .
```

### 3. Upload to Chrome Web Store

1. Go to https://chrome.google.com/webstore/devconsole
2. Pay $5 one-time developer fee (if not already)
3. Upload **ai-privacy-shield-free.zip** as a free extension
4. Upload **ai-privacy-shield-premium.zip** as a PAID extension
   - Set price: $54.99 one-time (or subscription)
   - This is in the "Pricing & Distribution" section

### 4. Update Free Extension

After Premium is published, copy its Chrome Web Store URL and update:

**popup_free.js line 7:**
```javascript
const PREMIUM_STORE_URL = 'https://chrome.google.com/webstore/detail/ai-privacy-shield-premium/ACTUAL_EXTENSION_ID';
```

Then re-upload the free extension.

## Pricing (Chrome Web Store)

| Tier | Price | Google Fee (30%) | Net Revenue |
|------|-------|------------------|-------------|
| Lifetime | $54.99 | $16.50 | $38.49 |
| Monthly | $2.99/mo | $0.90 | $2.09 |
| Annual | $25/yr | $7.50 | $17.50 |

## Why This Works

- Google **enforces** payment for paid extensions
- Users **cannot** install Premium without paying
- No server infrastructure needed
- No license key system needed
- Refunds handled by Google

## Files Reference

| Source File | Free Package | Premium Package |
|-------------|--------------|-----------------|
| manifest_free.json | manifest.json | - |
| manifest_premium.json | - | manifest.json |
| popup_free.html | popup.html | - |
| popup_premium.html | - | popup.html |
| popup_free.js | popup.js | - |
| popup_premium.js | - | popup.js |
| blocklist_free.json | rules/blocklist.json | - |
| blocklist.json | - | rules/blocklist.json |
