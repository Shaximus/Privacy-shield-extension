#!/bin/bash
# AI Privacy Shield - Build Script v2.3.0

set -e

echo "AI Privacy Shield - Build Script v2.3.0"
echo "========================================="
echo ""

# Load CLIENT_SECRET from .env if it exists
CLIENT_SECRET=""
if [ -f .env ]; then
    CLIENT_SECRET=$(grep '^CLIENT_SECRET=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

if [ -z "$CLIENT_SECRET" ]; then
    echo "WARNING: No CLIENT_SECRET found in .env"
    echo "  HMAC signing will use placeholder value."
    echo "  Create .env with: CLIENT_SECRET=your-secret-here"
    echo ""
fi

rm -rf deploy
mkdir -p deploy

# Sync blocklist.json → stats worker (single source of truth)
echo "Syncing rules to worker..."
bash sync-rules.sh

# ==========================================
# PRODUCTION CHROME (server-side rules only)
# ==========================================
echo "Building Chrome (production)..."

mkdir -p deploy/chrome/rules
cp manifest_prod.json deploy/chrome/manifest.json
cp popup.html deploy/chrome/popup.html
cp popup.js deploy/chrome/popup.js
cp premium.html deploy/chrome/
cp background.js deploy/chrome/
cp content-autoactivate.js deploy/chrome/
cp model-swap-detector.js meta-fingerprint-shield.js deploy/chrome/
cp rules/blocklist.json deploy/chrome/rules/
cp rules/google_header_scrub.json deploy/chrome/rules/
cp rules/rules_malware.json deploy/chrome/rules/
cp -r icons deploy/chrome/
cp -r animated-icons deploy/chrome/

# Inject CLIENT_SECRET at build time
if [ -n "$CLIENT_SECRET" ]; then
    sed -i "s/REPLACE_AT_BUILD_TIME/$CLIENT_SECRET/g" deploy/chrome/background.js
    echo "  CLIENT_SECRET injected"
fi

cd deploy/chrome
zip -r ../ai-privacy-shield-chrome.zip . -x "*.DS_Store" > /dev/null
cd ../..

echo "Done: deploy/ai-privacy-shield-chrome.zip"

# ==========================================
# PRODUCTION FIREFOX (server-side rules only)
# ==========================================
echo "Building Firefox (production)..."

mkdir -p deploy/firefox/rules
cp manifest_prod_firefox.json deploy/firefox/manifest.json 2>/dev/null || cp manifest_firefox.json deploy/firefox/manifest.json
cp popup.html deploy/firefox/popup.html
cp popup.js deploy/firefox/popup.js
cp premium.html deploy/firefox/
cp background.js deploy/firefox/
cp content-autoactivate.js deploy/firefox/
cp model-swap-detector.js meta-fingerprint-shield.js deploy/firefox/
cp rules/blocklist.json deploy/firefox/rules/
cp rules/google_header_scrub.json deploy/firefox/rules/
cp rules/rules_malware.json deploy/firefox/rules/
cp -r icons deploy/firefox/
cp -r animated-icons deploy/firefox/

# Inject CLIENT_SECRET at build time
if [ -n "$CLIENT_SECRET" ]; then
    sed -i "s/REPLACE_AT_BUILD_TIME/$CLIENT_SECRET/g" deploy/firefox/background.js
    echo "  CLIENT_SECRET injected"
fi

cd deploy/firefox
zip -r ../ai-privacy-shield-firefox.zip . -x "*.DS_Store" > /dev/null
cd ../..

echo "Done: deploy/ai-privacy-shield-firefox.zip"

# ==========================================
# TEST CHROME (static rules, no server needed)
# ==========================================
echo "Building Chrome (test - static rules)..."

mkdir -p deploy/chrome-test/rules
cp manifest.json deploy/chrome-test/manifest.json
cp popup.html deploy/chrome-test/popup.html
cp popup.js deploy/chrome-test/popup.js
cp premium.html deploy/chrome-test/
cp background.js deploy/chrome-test/
cp content-autoactivate.js deploy/chrome-test/
cp model-swap-detector.js meta-fingerprint-shield.js deploy/chrome-test/
cp rules/blocklist.json deploy/chrome-test/rules/
cp rules/google_header_scrub.json deploy/chrome-test/rules/
cp rules/rules_malware.json deploy/chrome-test/rules/
cp -r icons deploy/chrome-test/
cp -r animated-icons deploy/chrome-test/

echo "Done: deploy/chrome-test/ (load unpacked)"

# ==========================================
# SUMMARY
# ==========================================
echo ""
echo "========================================="
echo "Build complete!"
echo ""
echo "PRODUCTION (server-side rules, needs license):"
ls -lh deploy/*.zip 2>/dev/null
echo ""
echo "TEST (133 static rules baked in, no server needed):"
echo "  deploy/chrome-test/ - load as unpacked extension"
echo ""
