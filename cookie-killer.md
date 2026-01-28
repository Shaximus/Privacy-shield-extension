# GOOGLE ANALYTICS COOKIE BLOCKING

## Tracking Cookies Found in Gemini:
- _gcl_aw (Google Click tracking - Ads)
- _gcl_dc (Google Click tracking - DoubleClick)
- _gcl_gs (Google Click tracking - Google Signals)
- _gcl_au (Google Click tracking - Analytics)
- _ga (Google Analytics - main)
- _ga_BF8Q35BMLM (Google Analytics - property specific)
- _ga_WC57KJ50ZZ (Google Analytics - property specific)
- NID (Google Network ID - cross-site tracking)

## Problem:
declarativeNetRequest in Manifest V3 CANNOT delete cookies directly.

## Solutions:

### Option 1: Use Chrome Extension Cookie API
Add to background.js to delete tracking cookies on page load:

```javascript
chrome.cookies.getAll({domain: '.google.com'}, (cookies) => {
  cookies.forEach(cookie => {
    if (cookie.name.startsWith('_ga') || 
        cookie.name.startsWith('_gcl_') || 
        cookie.name === 'NID') {
      chrome.cookies.remove({
        url: 'https://google.com',
        name: cookie.name
      });
    }
  });
});
```

### Option 2: User Instructions - Manual Cookie Deletion
Tell users to:
1. chrome://settings/cookies
2. Search for "google.com"
3. Delete _ga*, _gcl_*, NID cookies

### Option 3: Recommend Cookie AutoDelete Extension
Third-party extension that auto-deletes cookies on tab close.

