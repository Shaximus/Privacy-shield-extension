# Building AI Privacy Shield for iOS Safari

## Overview

This directory contains the Safari Web Extension adaptation of AI Privacy Shield v2.3.0.
It is designed for iOS Safari 16.4+ and macOS Safari 16.4+.

## Key Differences from Chrome Version

- **No `externally_connectable`** - License activation uses URL parameter approach only
- **No `declarativeNetRequestFeedback`** - Stats use periodic polling via `getMatchedRules`
- **No `chrome.notifications`** - Malware alerts use badge text only
- **No `webRequest` API** - Removed all webRequest listeners
- **MAIN world content scripts** - Supported since Safari 16.4 (required for model swap detection)
- **Platform identifier** - Reports as `safari` instead of `chrome` to the license server

## Prerequisites

- macOS 13.3+ (Ventura) or later with Xcode 14.3+ installed
- Apple Developer account (free works for personal device testing, paid $99/year for App Store)
- iOS 16.4+ device or simulator
- The Safari extension source files in this directory

## Step 1: Convert to Xcode Project

Open Terminal and run:

```bash
xcrun safari-web-extension-converter /path/to/AIShield-main/mobile/safari/ \
    --project-location /path/to/output/AIPrivacyShield-Safari/ \
    --app-name "AI Privacy Shield" \
    --bundle-identifier com.reflexionsoftware.aiprivacyshield \
    --swift
```

Replace `/path/to/` with your actual paths. For example:

```bash
xcrun safari-web-extension-converter ~/Projects/revenue/AIShield-main/mobile/safari/ \
    --project-location ~/Projects/revenue/AIPrivacyShield-Safari/ \
    --app-name "AI Privacy Shield" \
    --bundle-identifier com.reflexionsoftware.aiprivacyshield \
    --swift
```

This generates a full Xcode project with:
- A containing iOS/macOS app
- The Safari Web Extension target
- Proper entitlements and Info.plist files

## Step 2: Open in Xcode

```bash
open ~/Projects/revenue/AIPrivacyShield-Safari/AI\ Privacy\ Shield.xcodeproj
```

Or double-click the `.xcodeproj` file in Finder.

## Step 3: Configure Signing

1. Select the project file in the Xcode navigator (top-level blue icon)
2. Select each target (the app and the extension)
3. Under **Signing & Capabilities**:
   - Check "Automatically manage signing"
   - Select your development team
   - Set bundle identifier to `com.reflexionsoftware.aiprivacyshield`
   - The extension target should be `com.reflexionsoftware.aiprivacyshield.extension`

## Step 4: Set Build Secret

Before building, replace the build-time secret in `background.js`:

1. Open `background.js` in the Xcode project
2. Find `const CLIENT_SECRET = 'REPLACE_AT_BUILD_TIME';`
3. Replace with the actual HMAC secret used by the license server

Alternatively, create a build script phase that does this automatically:

```bash
# In Xcode: Build Phases > New Run Script Phase (before Compile Sources)
sed -i '' "s/REPLACE_AT_BUILD_TIME/${AISHIELD_CLIENT_SECRET}/" \
    "${SRCROOT}/AI Privacy Shield Extension/Resources/background.js"
```

## Step 5: Build & Run

### For iOS Device/Simulator:
1. Select your iOS device or simulator from the device dropdown
2. Select the main app scheme (not the extension)
3. Build and run (Cmd+R)

### For macOS:
1. Select "My Mac" from the device dropdown
2. Build and run (Cmd+R)

## Step 6: Enable the Extension

### On iOS:
1. Open **Settings** on the device
2. Navigate to **Safari > Extensions**
3. Find **AI Privacy Shield**
4. Toggle it **ON**
5. Set permissions to "Allow" for all websites (or configure per-site)

### On macOS:
1. Open **Safari > Settings > Extensions**
2. Check the box next to **AI Privacy Shield**
3. Set permissions as desired

## Step 7: Trust and Grant Permissions

1. Open Safari on the device
2. Navigate to any website
3. Tap the **puzzle piece icon** (extensions) in the address bar
4. Tap **AI Privacy Shield**
5. Grant "Always Allow on Every Website" when prompted (required for tracker blocking)

## Testing

### Basic Functionality:
1. Visit `claude.ai` in Safari - the model swap detector should activate
2. Visit `chatgpt.com` - same model swap detection
3. Open the extension popup (tap extension icon) to see blocked tracker counts
4. Enter a license key in the popup to test activation

### License Activation Flow:
1. Go to `reflexionsoftware.com/#pricing` in Safari
2. Purchase through Stripe
3. After successful payment, you'll be redirected to the success page
4. The `content-autoactivate.js` script reads the URL parameters
5. License should auto-activate and show the success notification

### Verifying Tracker Blocking:
1. Open Safari Developer Tools (requires enabling in Settings)
2. Check the Network tab for blocked requests
3. Requests matching the blocklist rules should be blocked
4. The popup should reflect increasing blocked counts over time

### Things to Watch For:
- Stats may accumulate slower than Chrome due to the polling approach
- Badge text alerts replace desktop notifications for malware detection
- The popup appears as a sheet/popover on iOS (this is expected Safari behavior)

## App Store Distribution

### Prepare for Submission:

1. **App Icon**: Ensure the containing app has proper app icons for all required sizes
2. **Privacy Policy**: Link to `https://reflexionsoftware.com/privacy.html` in App Store Connect
3. **Screenshots**: Capture screenshots on required device sizes
4. **Description**: Emphasize privacy protection, not ad blocking (Apple is sensitive about this)

### Archive and Upload:

1. Select "Any iOS Device" as the build target
2. **Product > Archive**
3. In the Organizer, click **Distribute App**
4. Choose **App Store Connect**
5. Upload

### App Review Notes:

Apple reviews Safari extensions. Include in your review notes:

```
This Safari Web Extension blocks AI surveillance trackers (telemetry, session recording,
keystroke logging) on AI platforms like ChatGPT, Claude, and Gemini. It uses
declarativeNetRequest rules (static JSON rulesets) to block known surveillance endpoints.
It does NOT block ads on general websites. The model swap detector verifies users receive
the AI model they paid for by comparing request/response model identifiers.

Test account: [provide a test license key]
Test URL: Visit claude.ai or chatgpt.com with the extension enabled
```

## Troubleshooting

### Extension doesn't appear in Safari Settings:
- Make sure you ran the containing app at least once
- Check that the extension target built successfully
- Restart Safari

### Content scripts not running:
- Verify the extension has "Allow on All Websites" permission
- Check Safari's console for errors (Develop > device name > page)
- MAIN world scripts require Safari 16.4+ -- verify the OS version

### Stats showing zero:
- Safari lacks `onRuleMatchedDebug`, so stats use periodic polling
- The `getMatchedRules` API may not be available on all Safari versions
- Give it 30+ seconds for the first poll cycle to complete

### License activation not working from website:
- Safari doesn't support `externally_connectable`
- The URL parameter approach requires the content script to be active on the success page
- Check that `reflexionsoftware.com/success*` matches the actual redirect URL
- The content script checks every second for 10 seconds after page load

### Build errors:
- Ensure Xcode 14.3+ is installed
- Run `xcode-select --install` to ensure command line tools are present
- Check that all resource files are included in the extension target's "Copy Bundle Resources"
