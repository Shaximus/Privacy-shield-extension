# AI Privacy Shield - Build Script (PowerShell)
# Creates deployment packages for Chrome Web Store

Write-Host ""
Write-Host "AI Privacy Shield - Build Script" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Clean previous builds
Write-Host ""
Write-Host "[1/4] Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "deploy") { 
    Remove-Item -Recurse -Force "deploy" 
}

# ==========================================
# FREE TIER PACKAGE
# ==========================================
Write-Host "[2/4] Building FREE tier package..." -ForegroundColor Green

New-Item -ItemType Directory -Path "deploy/free/rules" -Force | Out-Null

Copy-Item "manifest_free.json" -Destination "deploy/free/manifest.json" -Force
Copy-Item "popup_free.html" -Destination "deploy/free/popup.html" -Force
Copy-Item "popup_free.js" -Destination "deploy/free/popup.js" -Force
Copy-Item "background.js" -Destination "deploy/free/" -Force
Copy-Item -Recurse -Force "icons" -Destination "deploy/free/"
Copy-Item -Recurse -Force "animated-icons" -Destination "deploy/free/"
Copy-Item "rules/blocklist_free.json" -Destination "deploy/free/rules/blocklist.json" -Force

Compress-Archive -Path "deploy/free/*" -DestinationPath "deploy/ai-privacy-shield-free.zip" -Force

# ==========================================
# PREMIUM TIER PACKAGE
# ==========================================
Write-Host "[3/4] Building PREMIUM tier package..." -ForegroundColor Green

New-Item -ItemType Directory -Path "deploy/premium/rules" -Force | Out-Null

Copy-Item "manifest_premium.json" -Destination "deploy/premium/manifest.json" -Force
Copy-Item "popup_premium.html" -Destination "deploy/premium/popup.html" -Force
Copy-Item "popup_premium.js" -Destination "deploy/premium/popup.js" -Force
Copy-Item "background.js" -Destination "deploy/premium/" -Force
Copy-Item -Recurse -Force "icons" -Destination "deploy/premium/"
Copy-Item -Recurse -Force "animated-icons" -Destination "deploy/premium/"
Copy-Item "rules/blocklist.json" -Destination "deploy/premium/rules/" -Force
Copy-Item "rules/google_header_scrub.json" -Destination "deploy/premium/rules/" -Force

Compress-Archive -Path "deploy/premium/*" -DestinationPath "deploy/ai-privacy-shield-premium.zip" -Force

# ==========================================
# SUMMARY
# ==========================================
Write-Host "[4/4] Build complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Output files:" -ForegroundColor White

$freeZip = Get-Item "deploy/ai-privacy-shield-free.zip"
$premiumZip = Get-Item "deploy/ai-privacy-shield-premium.zip"

Write-Host "  - ai-privacy-shield-free.zip    ($([math]::Round($freeZip.Length/1KB, 0)) KB)" -ForegroundColor Green
Write-Host "  - ai-privacy-shield-premium.zip ($([math]::Round($premiumZip.Length/1KB, 0)) KB)" -ForegroundColor Green

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Upload deploy/ai-privacy-shield-premium.zip to Chrome Web Store (PAID)"
Write-Host "  2. Get Premium extension ID from URL"
Write-Host "  3. Update popup_free.js line 7 with Premium URL"
Write-Host "  4. Re-run this script"
Write-Host "  5. Upload deploy/ai-privacy-shield-free.zip to Chrome Web Store (FREE)"
Write-Host ""
