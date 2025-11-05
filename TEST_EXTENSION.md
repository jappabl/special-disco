# Extension Loading Test

## Current Problem
The content script isn't loading on Reddit. You're showing me the Reddit page console, but there's no `[Content Script] Loaded` message.

## Steps to Fix

### 1. Remove Old Extension
1. Go to `chrome://extensions/`
2. Find "Screen Activity Tracker"
3. Click **"Remove"** button

### 2. Load from Correct Folder
1. Click **"Load unpacked"** button
2. Navigate to: `/home/dennis/Projects/special-disco/dist`
   - **IMPORTANT:** Select the `dist` subfolder, NOT the root project folder
3. Click "Select Folder"

### 3. Verify It's Loaded Correctly
After loading, on the extension card you should see:
- Extension name: "Screen Activity Tracker"
- Version: "1.0.0"
- The folder path should show: `.../special-disco/dist`

### 4. Test on Reddit
1. Open a new Reddit tab (or reload existing one)
2. Press F12 → Console tab
3. You should immediately see: `[Content Script] Loaded`

If you don't see that message, the content script isn't injecting.

### 5. Test Background Script
1. On `chrome://extensions/` page
2. Click "service worker" link on the extension card
3. You should see logs like:
   ```
   [Background] Service worker started with network tracking
   [Network Tracker] Initialized
   ```

## What You Should See After 60 Seconds on Reddit

In the **Reddit page console** (not background console):
```
[Content Script] Loaded
[Content Script] Forwarded SCREEN_SNAPSHOT to page
[Content Script] Checking alert conditions: {
  state: "off_task",
  confidence: 0.8,
  hasVision: true,
  recommendation: "focus"  ← This needs to be "focus" for alert
}
```

If `recommendation: "focus"`, you'll get the red alert!

## Common Issues

**Issue: Still no `[Content Script] Loaded`**
- Solution: Make sure you loaded from `dist/` folder, not project root
- Try: Remove extension → Load unpacked → Select `dist` folder → Reload Reddit tab

**Issue: Content script loads but no alert**
- Check what `recommendation` value is in the logs
- If it's `"warning"` instead of `"focus"`, we need to make Gemini more aggressive

**Issue: Getting 401 API errors**
- New API key is in the build (verified)
- If still 401 after reload, the API key might be invalid
