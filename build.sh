#!/bin/bash
# AI Privacy Shield - Build Script v3.3.2

set -e

echo "AI Privacy Shield - Build Script v3.3.2"
echo "========================================="
echo ""

rm -rf deploy
mkdir -p deploy

# Rule sync is a SEPARATE step from building. Do NOT auto-sync during build.
# To sync rules to the worker: cd .. && bash AIShield-main/sync-rules.sh
# To deploy workers: see wrangler configs in parent directory
echo "Skipping rule sync (run sync-rules.sh manually before deploying workers)"

# ==========================================
# PRODUCTION CHROME (server-side rules only)
# ==========================================
echo "Building Chrome (production)..."

mkdir -p deploy/chrome
cp manifest_prod.json deploy/chrome/manifest.json
cp popup.html deploy/chrome/popup.html
cp popup.css deploy/chrome/popup.css
cp popup.js deploy/chrome/popup.js
cp premium.html premium.css premium.js deploy/chrome/
cp background.js deploy/chrome/
cp content-autoactivate.js deploy/chrome/
cp meta-fingerprint-shield.js deploy/chrome/
# Note: rules_malware.json NOT copied for chrome prod — manifest_prod.json has no declarative_net_request block
cp -r icons deploy/chrome/
cp -r animated-icons deploy/chrome/
cp -r fonts deploy/chrome/

cd deploy/chrome
zip -r ../ai-privacy-shield-chrome.zip . -x "*.DS_Store" "*.md" > /dev/null
cd ../..

echo "Done: deploy/ai-privacy-shield-chrome.zip"

# ==========================================
# PRODUCTION FIREFOX (server-side rules only)
# ==========================================
echo "Building Firefox (production)..."

mkdir -p deploy/firefox/rules
cp manifest_firefox.json deploy/firefox/manifest.json
cp popup.html deploy/firefox/popup.html
cp popup.css deploy/firefox/popup.css
cp popup.js deploy/firefox/popup.js
cp premium.html premium.css premium.js deploy/firefox/
cp background.js deploy/firefox/
cp content-autoactivate.js deploy/firefox/
cp meta-fingerprint-shield.js deploy/firefox/
# Only malware rules shipped static — header scrub + blocklist come via dynamic rules after approval
cp rules/rules_malware.json deploy/firefox/rules/
cp -r icons deploy/firefox/
cp -r animated-icons deploy/firefox/
cp -r fonts deploy/firefox/

cd deploy/firefox
zip -r ../ai-privacy-shield-firefox.zip . -x "*.DS_Store" "*.md" > /dev/null
cd ../..

echo "Done: deploy/ai-privacy-shield-firefox.zip"

# ==========================================
# TEST CHROME (static rules, no server needed)
# ==========================================
echo "Building Chrome (test - static rules)..."

mkdir -p deploy/chrome-test/rules
cp manifest.json deploy/chrome-test/manifest.json
cp popup.html deploy/chrome-test/popup.html
cp popup.css deploy/chrome-test/popup.css
cp popup.js deploy/chrome-test/popup.js
cp premium.html premium.css premium.js deploy/chrome-test/
cp background.js deploy/chrome-test/
cp content-autoactivate.js deploy/chrome-test/
cp meta-fingerprint-shield.js deploy/chrome-test/
# Model swap detector archived in future-features/ (see MODEL_SWAP_DETECTOR.md for details)
cp rules/blocklist.json deploy/chrome-test/rules/
cp rules/google_header_scrub.json deploy/chrome-test/rules/
cp rules/rules_malware.json deploy/chrome-test/rules/
cp -r icons deploy/chrome-test/
cp -r animated-icons deploy/chrome-test/
cp -r fonts deploy/chrome-test/

echo "Done: deploy/chrome-test/ (load unpacked)"

# ==========================================
# SUMMARY
# ==========================================
echo ""
echo "========================================="
echo "Build complete!"
echo ""
echo "PRODUCTION (encrypted rules via api.reflexionsoftware.com):"
ls -lh deploy/*.zip 2>/dev/null
echo ""
echo "TEST (static rules baked in, no server needed):"
echo "  deploy/chrome-test/ - load as unpacked extension"
echo ""
