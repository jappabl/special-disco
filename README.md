# Screen Activity Tracker - Chrome Extension

Chrome MV3 extension that tracks screen activity and categorizes on-task/off-task behavior. Sends `ScreenSnapshot` messages to the web page via `window.postMessage`.

## Structure

```
src/
├── shared/
│   └── types.ts            # Shared TypeScript types (ScreenSnapshot, etc.)
├── offTaskRules.ts         # Domain categorization and on/off-task rules
├── networkTracker.ts       # Network request monitoring and aggregation
├── aiClassifier.ts         # Claude AI domain + vision classification
├── screenshotCapture.ts    # Screenshot capture for visual verification
├── background.ts           # Service worker (orchestrates everything)
└── content.ts              # Content script (relays messages to page)
```

## Setup

```bash
npm install
npm run build
```

This will generate a `dist/` folder with your built extension.

## Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/` folder

## How it works

1. **Background service worker** (`src/background.ts`):
   - Polls active tab every 5 seconds
   - Captures URL, title, idle state
   - **Tracks ALL network requests** (images, scripts, XHR, media) in a 30s window
   - Categorizes domain using `offTaskRules.ts`
   - **Uses Claude AI** to classify background domains as on/off-task (~every 60s)
   - Detects suspicious patterns (e.g., "YouTube streaming while on GitHub")
   - Overrides on-task → off-task if AI detects distractions
   - Builds an enhanced `ScreenSnapshot` object with network context
   - Sends it to the content script via `chrome.tabs.sendMessage`
   - Stores latest snapshot in `chrome.storage.local`

2. **Content script** (`src/content.ts`):
   - Receives messages from background
   - Forwards `SCREEN_SNAPSHOT` to the page via `window.postMessage`
   - Responds to `GET_SCREEN_SNAPSHOT` requests from the page

3. **Web app integration** (your React app):
   ```js
   // Listen for snapshots
   window.addEventListener("message", (event) => {
     if (event.data.type === "SCREEN_SNAPSHOT") {
       const snapshot = event.data.payload;
       // Use snapshot.t, snapshot.state, snapshot.context, etc.
     }
   });

   // Request the last snapshot
   window.postMessage({ type: "GET_SCREEN_SNAPSHOT" }, "*");
   ```

## Customizing rules

Edit `src/offTaskRules.ts` to:
- Add/remove domains in `DOMAIN_MAP`
- Change idle threshold (`IDLE_THRESHOLD_MS`)
- Modify which categories are considered off-task (`OFF_TASK_CATEGORIES`)

## Development

```bash
npm run dev
```

This will watch for changes and rebuild automatically. You'll need to click "Reload" on the extension in `chrome://extensions/` after changes.

## Permissions

- `tabs`: Read active tab URL/title
- `idle`: Detect user idle state
- `storage`: Store last snapshot
- `webRequest`: Track all network requests (invasive but powerful)
- `host_permissions: <all_urls>`: Inject content script into all pages

## AI-Powered Features

This extension uses **two-tier AI verification** to keep you focused:

### Tier 1: Network Analysis (Primary Detection)
1. **Network request tracking**: Monitors ALL domains you're accessing (not just the active tab)
2. **Context-aware classification**: Claude AI determines if background activity is off-task
3. **Pattern detection**: Identifies suspicious behaviors like:
   - YouTube streaming while coding on GitHub
   - Social media requests while on documentation sites
   - Shopping activity in background tabs

### Tier 2: Visual Verification (Secondary Confirmation)
When network analysis flags suspicious activity, the extension:
1. **Takes a screenshot** of the active tab
2. **Sends to Claude Vision API** for visual analysis
3. **Verifies actual content**: Distinguishes between:
   - YouTube tutorial (on-task) vs cat videos (off-task)
   - GitHub discussions (on-task) vs Twitter feed (off-task)
   - Stack Overflow (on-task) vs Reddit gaming (off-task)
4. **Makes final decision**: Vision AI has the final say

### Example Workflow

```
Step 1 - Network Detection:
  Active tab: youtube.com
  Network: Loading video content, ads, recommendations
  AI Analysis: "Suspicious - video streaming detected"

Step 2 - Visual Verification:
  Screenshot taken → Sent to Claude Vision
  AI sees: "Programming tutorial - React hooks explained"
  Verification: "Actually ON-TASK despite YouTube domain"
  Final state: on_task (confidence: 0.85)

vs.

Step 2 - Visual Verification:
  Screenshot taken → Sent to Claude Vision
  AI sees: "Minecraft gameplay video"
  Verification: "CONFIRMED OFF-TASK - gaming content"
  Final state: off_task (confidence: 0.95)
  Recommendation: "focus" (user needs to refocus)
```

### Verification Levels
- **No verification**: Normal browsing, no flags
- **Network only**: Domains classified, no screenshot needed
- **Network + Vision**: Screenshot taken and analyzed when suspicious

The AI calls are throttled (~60s for network, on-demand for vision) to balance accuracy with API costs.
