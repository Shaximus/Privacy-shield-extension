#!/bin/bash
# AI Privacy Shield - Build Script
# v1.5.0 - Rules fetched from server (not bundled)

set -e

echo "🛡️ AI Privacy Shield - Build Script v1.5.0"
echo "==========================================="
echo ""

rm -rf deploy
mkdir -p deploy

# ==========================================
# CHROME PREMIUM
# ==========================================
echo "📦 Building CHROME Premium..."

mkdir -p deploy/chrome
cp manifest_premium.json deploy/chrome/manifest.json
cp popup_premium.html deploy/chrome/popup.html
cp popup_premium.js deploy/chrome/popup.js
cp premium.html deploy/chrome/
cp background.js deploy/chrome/
cp -r icons deploy/chrome/
cp -r animated-icons deploy/chrome/

cd deploy/chrome
zip -r ../ai-privacy-shield-chrome.zip . -x "*.DS_Store" > /dev/null
cd ../..

echo "✅ Chrome: deploy/ai-privacy-shield-chrome.zip"

# ==========================================
# FIREFOX PREMIUM
# ==========================================
echo "📦 Building FIREFOX Premium..."

mkdir -p deploy/firefox
cp manifest_premium_firefox.json deploy/firefox/manifest.json
cp popup_premium.html deploy/firefox/popup.html
cp popup_premium.js deploy/firefox/popup.js
cp premium.html deploy/firefox/
cp background.js deploy/firefox/
cp -r icons deploy/firefox/
cp -r animated-icons deploy/firefox/

cd deploy/firefox
zip -r ../ai-privacy-shield-firefox.zip . -x "*.DS_Store" > /dev/null
cd ../..

echo "✅ Firefox: deploy/ai-privacy-shield-firefox.zip"

# ==========================================
# SUMMARY
# ==========================================
echo ""
echo "==========================================="
echo "🎉 Build complete!"
echo ""
ls -lh deploy/*.zip
echo ""
echo "🔒 Rules are server-side only - requires valid license"
echo ""
