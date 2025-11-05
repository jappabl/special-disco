# How to Load/Reload the Extension

## The Problem
The content script isn't loading because Chrome is looking at the wrong folder.

## The Solution

1. **Go to `chrome://extensions/`**
2. **Enable "Developer mode"** (toggle in top-right)
3. **Remove the old extension** (click "Remove" on "Screen Activity Tracker")
4. **Click "Load unpacked"**
5. **SELECT THE `dist` FOLDER** (NOT the project root!)
   - Navigate to: `/home/dennis/Projects/special-disco/dist`
   - Click "Select Folder"

## After Making Code Changes

Every time you edit the source code:
```bash
npm run build
```

Then in `chrome://extensions/`:
- Click the **reload icon** (circular arrow) on the extension card

## Testing

1. After loading, go to **reddit.com** or **nba.com**
2. Press **F12** to open DevTools
3. Go to **Console** tab
4. You should see: `[Content Script] Loaded`
5. Wait ~60 seconds for full AI analysis
6. You should see: `[Content Script] Checking alert conditions: { ... }`

## If No Red Alert Shows

Check the console logs for:
```
recommendation: "focus"  ← This must say "focus" for alert to trigger
```

If it says `"warning"` instead of `"focus"`, the Gemini AI is being too lenient. We can adjust the prompt to be more aggressive.
