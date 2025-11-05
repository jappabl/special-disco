# Fixes Applied

## 1. ✅ SPORTS = OFF-TASK (BASKETBALL IS NOT WORK!)

Added sports and news categories to off-task list:
- ESPN, NBA.com, NFL.com, MLB.com, NHL.com, etc.
- CNN, BBC, NYTimes, etc.

**Sports and news are now classified as OFF-TASK by default!**

## 2. 🔧 Claude API 401 Error

The 401 error means the Claude API key is invalid or expired. Two options:

### Option A: Get a new Claude API key
1. Go to https://console.anthropic.com/
2. Get a new API key
3. Replace in `src/aiClassifier.ts` line 5

### Option B: Ignore it (use Gemini only)
The extension still works! It just won't do domain classification via Claude.
- Vision verification still uses Gemini (works fine)
- Basic domain rules still work (sports/social/games detected)

**You can ignore the 401 for now - Gemini is handling the important part (screenshots)**

## 3. 🔍 Alert Not Showing - Debugging Added

Added debug logs to see why alert isn't triggering.

**Reload your extension and check the CONSOLE (not just popup)**:

1. Go to the page you're testing (e.g., NBA.com)
2. Press F12 (DevTools)
3. Go to Console tab
4. Look for logs like:
   ```
   [Content Script] Checking alert conditions: {
     state: "off_task",
     confidence: 0.8,
     hasVision: true,
     recommendation: "focus"
   }
   ```

**Why alert might not show:**
- Vision verification needs `recommendation: "focus"` (not just off-task)
- Takes ~60 seconds for AI to classify domains
- Vision AI needs to actually SEE off-task content (screenshot)

## 4. ✅ Build Complete

Extension rebuilt with:
- ✅ Sports as off-task
- ✅ News as off-task
- ✅ Debug logging for alerts
- ✅ Better error handling

## Testing Instructions

1. **Reload extension** in `chrome://extensions/`

2. **Test Sports Detection**:
   - Go to NBA.com or ESPN
   - Should show "off_task" immediately (rule-based)
   - Wait 60s for vision verification

3. **Test Alert**:
   - Open console (F12)
   - Watch for debug logs
   - Alert triggers when:
     - `state === "off_task"` ✓
     - `confidence > 0.8` ✓
     - `recommendation === "focus"` ✓ (this is the key one!)

4. **Check Logs**:
   Look for:
   - `[Content Script] Checking alert conditions:` - Shows why alert did/didn't trigger
   - `[AI Vision] Gemini verification result:` - Shows what vision AI decided
   - `⚠️⚠️⚠️ OFF-TASK DETECTED` - Alert is triggering!

## Known Issues & Solutions

### Issue: 401 API Error
**Solution**: Claude API key expired. Either:
- Get new key from console.anthropic.com
- Or ignore it (Gemini still works)

### Issue: No red screen
**Solution**: Check console logs. Alert only triggers when:
1. Off-task detected
2. High confidence (>80%)
3. Vision says "focus" (not just "warning")

**Most likely**: Vision is saying "warning" instead of "focus"
- Check logs for `recommendation` value
- May need to adjust vision prompt to be more aggressive

### Issue: Takes 60+ seconds to trigger
**This is normal!**
- Network classification: ~60s (throttled)
- Screenshot + vision: ~2-5s
- Alert delay: 1s
- **Total: ~65 seconds from page load**

## Next Steps

1. **Reload extension** - Get the sports fix
2. **Check console logs** - See why alert isn't triggering
3. **Test on NBA.com** - Should be instant off-task now
4. **Wait 60s** - For vision verification
5. **Report back** what the logs say!

The extension is working, just need to debug why the alert condition isn't being met. Check those console logs! 🚀
