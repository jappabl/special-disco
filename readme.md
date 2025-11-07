# SleepDefeater - Local-First Attention Tracking System

A comprehensive attention monitoring system combining **webcam-based drowsiness detection** with **Chrome extension screen activity tracking**. All processing happens locally - no cloud uploads or external recording.

## Overview

SleepDefeater consists of two integrated modules:

1. **Attention Module (Webcam)** - Detects drowsiness using facial landmarks and eye tracking
2. **Screen Module (Chrome Extension)** - Monitors browsing activity and categorizes on-task/off-task behavior

Both modules produce snapshots that can be fused for comprehensive focus monitoring.

## Project Structure

```
src/
├── attention/              # Webcam-based drowsiness detection
│   ├── useWebcamStream.ts      # React hook for webcam access
│   ├── faceLandmarks.ts        # MediaPipe face landmark detection
│   ├── ear.ts                  # Eye Aspect Ratio calculation
│   ├── blinkDetection.ts       # Blink rate monitoring
│   ├── perclos.ts              # PERCLOS drowsiness metric
│   ├── microsleep.ts           # Microsleep detection
│   ├── headPitch.ts            # Head pose (nodding) detection
│   ├── headTilt.ts             # Head tilt analysis
│   ├── gazeDirection.ts        # Gaze tracking
│   ├── eyelidSpeed.ts          # Eyelid closure speed
│   ├── faceDistance.ts         # Distance from camera
│   ├── yawning.ts              # Yawn detection
│   └── useAttentionDetector.ts # Main detection state machine
├── app/
│   └── attention-demo/         # Demo UI for testing webcam detection
│       └── page.tsx
├── fusion/
│   └── bridge.ts               # Fusion logic for combining snapshots
├── types/
│   └── attention.ts            # AttentionState, AttentionSnapshot types
├── shared/
│   └── types.ts                # ScreenSnapshot, SessionContext types
│
├── background.ts               # Chrome extension service worker
├── content.ts                  # Chrome extension content script
├── popup.ts                    # Extension popup UI logic
├── popup.html                  # Extension popup HTML
├── analytics.ts                # Analytics dashboard logic
├── analytics.html              # Analytics dashboard HTML
├── analyticsPage.ts            # Analytics page implementation
├── networkTracker.ts           # Network request monitoring
├── aiClassifier.ts             # Claude AI domain classification
├── screenshotCapture.ts        # Screenshot capture for vision AI
└── offTaskRules.ts             # Domain categorization rules

manifest.json                   # Chrome extension manifest (MV3)
vite.config.ts                  # Vite build config for extension
next.config.ts                  # Next.js config for web app
```

## Quick Start

### Web App (Attention Detection)

```bash
npm install
npm run dev
```

Visit [http://localhost:3000/attention-demo](http://localhost:3000/attention-demo) to test the webcam-based attention detector.

### Chrome Extension (Screen Tracking)

```bash
npm run build     # Builds extension to dist/ folder
```

**Load in Chrome:**
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/` folder

## How It Works

### Module 1: Attention Detection (Webcam)

Uses MediaPipe Face Landmarker to detect drowsiness in real-time:

1. **Webcam Capture** - `useWebcamStream` hook manages camera access and permissions
2. **Face Detection** - MediaPipe extracts 478 facial landmarks at 30 FPS
3. **Eye Analysis** - Multiple metrics track eye closure and drowsiness:
   - **EAR (Eye Aspect Ratio)** - Primary drowsiness indicator (threshold: 0.22)
   - **PERCLOS** - Percentage of eye closure over time
   - **Blink Detection** - Rapid blink counting (indicator of fatigue)
   - **Microsleep Detection** - Extended eye closures (>500ms)
   - **Eyelid Speed** - Closure/opening velocity analysis
4. **Head Pose** - Detects nodding off via:
   - **Head Pitch** - Forward/backward tilt
   - **Head Tilt** - Side-to-side tilt
5. **Additional Metrics**:
   - **Yawn Detection** - Mouth aspect ratio analysis
   - **Gaze Direction** - Eye focus tracking
   - **Face Distance** - Proximity to camera
6. **State Machine** - Produces `AttentionSnapshot` every 300ms:
   - `state`: "awake" | "drowsy" | "microsleep" | "distracted"
   - `confidence`: 0.0-1.0
   - `metrics`: EAR, PERCLOS, blink rate, etc.

**Thresholds (tunable):**
- EAR < 0.22 = eyes closing
- Eyes closed > 1.5s = drowsy
- Eyes closed > 3s = microsleep
- Blink rate < 5/min or > 35/min = fatigue

### Module 2: Screen Tracking (Chrome Extension)

1. **Background Service Worker** (`src/background.ts`):
   - Polls active tab every 5 seconds
   - Captures URL, title, idle state
   - **Tracks ALL network requests** in 30s window
   - Categorizes domain using `offTaskRules.ts`
   - **Uses Claude AI** to classify background domains (~every 60s)
   - Detects suspicious patterns (e.g., "YouTube streaming while on GitHub")
   - **Visual Verification**: Takes screenshots for Claude Vision API analysis
   - Builds enhanced `ScreenSnapshot` with network context
   - Stores in `chrome.storage.local`

2. **Content Script** (`src/content.ts`):
   - Receives messages from background
   - Forwards `SCREEN_SNAPSHOT` to page via `window.postMessage`
   - **Shows alerts** when off-task behavior detected
   - Puzzle challenge system to disable alerts (requires solving 10 puzzles)

3. **Popup UI** (`popup.html`/`popup.ts`):
   - Real-time status display
   - Current task declaration
   - Disable/enable extension controls
   - Link to analytics dashboard

4. **Analytics Dashboard** (`analytics.html`):
   - Historical session data
   - Focus time tracking
   - Off-task pattern analysis

### Data Flow

```
┌─────────────────┐         ┌──────────────────┐
│  Webcam Module  │         │ Extension Module │
│                 │         │                  │
│ AttentionSnapshot│         │ ScreenSnapshot   │
│  every 300ms    │         │  every 5s        │
└────────┬────────┘         └────────┬─────────┘
         │                           │
         └──────────┬────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │  Fusion Bridge   │
         │  (bridge.ts)     │
         └──────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Combined FocusState │
         │  - good              │
         │  - sleepy            │
         │  - off_task          │
         │  - sleepy_and_off    │
         └──────────────────────┘
```

### Web App Integration

Listen for snapshots from the extension:

```js
window.addEventListener("message", (event) => {
  if (event.data.type === "SCREEN_SNAPSHOT") {
    const snapshot = event.data.payload; // ScreenSnapshot
    // Process snapshot: snapshot.state, snapshot.confidence, etc.
  }
});

// Request latest snapshot
window.postMessage({ type: "GET_SCREEN_SNAPSHOT" }, "*");
```

## Tech Stack

### Web App (Attention Module)
- **Framework**: Next.js 15 (React 19, TypeScript 5)
- **Styling**: Tailwind CSS 3
- **ML Library**: MediaPipe Tasks Vision 0.10
- **State Management**: React hooks (can add Zustand later)
- **Build**: Next.js built-in bundler

### Chrome Extension (Screen Module)
- **Manifest**: Chrome MV3
- **Build Tool**: Vite 5
- **Plugin**: @crxjs/vite-plugin
- **APIs Used**:
  - `chrome.tabs` - Active tab monitoring
  - `chrome.idle` - User idle detection
  - `chrome.storage.local` - Data persistence
  - `chrome.webRequest` - Network tracking
  - `chrome.tabs.captureVisibleTab` - Screenshots
- **AI APIs**:
  - Anthropic Claude (text classification)
  - Anthropic Claude Vision (screenshot analysis)

### Planned Additions
- **Database**: Dexie.js (IndexedDB wrapper)
- **Charts**: Recharts or Chart.js
- **Testing**: Vitest, React Testing Library
- **Backend** (optional): Fastify + PostgreSQL/Supabase

## Development

### Web App
```bash
npm run dev          # Start Next.js dev server (port 3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Chrome Extension
```bash
npm run build        # Build extension to dist/
# Then reload extension in chrome://extensions/
```

For extension development, enable "Developer mode" and use "Reload" after each build.

## Customizing Rules

Edit `src/offTaskRules.ts` to:
- Add/remove domains in `DOMAIN_MAP`
- Change idle threshold (`IDLE_THRESHOLD_MS`)
- Modify which categories are considered off-task (`OFF_TASK_CATEGORIES`)

Threshold tuning in attention detection:
- Edit constants in `src/attention/useAttentionDetector.ts`
- Or use calibration flow (when implemented)

## Privacy & Permissions

### Chrome Extension Permissions
- `tabs` - Read active tab URL/title
- `idle` - Detect user idle state
- `storage` - Store snapshots locally
- `webRequest` - Track network requests
- `host_permissions: <all_urls>` - Inject content script

### Webcam Module
- Requires camera permission on first use
- **Camera indicator always visible** when active
- Toggle on/off anytime
- No video recording - only real-time processing
- All data stays local (no uploads)

### Data Privacy
- **Local-first**: All processing happens in browser
- **No cloud storage**: Data never leaves your device (except optional AI calls)
- **Clear controls**: Toggle camera/extension anytime
- **Data export**: Export your data anytime
- **Data deletion**: Clear history with one click
- **AI API calls**: Optional Claude API usage for domain/vision classification (sends URLs/screenshots to Anthropic)

To use 100% offline: disable AI features in settings (when implemented).

---

## AI-Powered Features (Optional)

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

---

## Current Implementation Status

### Webcam Attention Detection
- MediaPipe Face Landmarker integration
- Eye Aspect Ratio (EAR) calculation
- PERCLOS drowsiness metric
- Blink detection and rate tracking
- Microsleep detection
- Head pitch/tilt analysis
- Yawn detection (MAR - Mouth Aspect Ratio)
- Gaze direction tracking
- Eyelid closure speed analysis
- Face distance from camera
- Comprehensive state machine with multiple states
- Demo UI at `/attention-demo`
- Real-time metrics display

### Chrome Extension Screen Tracking
- Active tab monitoring
- Network request tracking (all domains)
- Idle state detection
- Domain categorization (code/docs/video/social/etc.)
- Claude AI domain classification
- Screenshot capture for visual verification
- Claude Vision API integration
- Session context (user-declared task)
- Popup UI with status display
- Analytics dashboard
- Off-task alerts in content script
- Puzzle challenge to disable alerts
- Background service worker architecture

### Infrastructure
- TypeScript types for both modules
- Next.js web app setup
- Chrome MV3 manifest
- Vite build configuration
- Local storage (chrome.storage.local)
- Message passing (window.postMessage)
- Error handling and permissions

## Roadmap

### High Priority

1. **Fusion Logic Implementation** (`src/fusion/bridge.ts`)
   - Currently just logs to console
   - Need to implement actual fusion of AttentionSnapshot + ScreenSnapshot
   - Produce unified `FocusState` with combined confidence scores
   - Decision rules for state combinations (e.g., sleepy + off_task = critical)

2. **Calibration System**
   - User-specific EAR threshold calibration
   - Baseline collection flow (look normal, close eyes, look down)
   - Store calibration data in IndexedDB or localStorage
   - Per-user profile management

3. **Data Persistence**
   - IndexedDB integration (Dexie.js suggested)
   - Session storage and replay
   - Historical metrics tracking
   - Export/import functionality

4. **Alert System Enhancement**
   - Audio alerts for drowsiness
   - Configurable alert thresholds
   - Alert history tracking
   - Smart alert timing (don't spam)

### Medium Priority

5. **Analytics Dashboard Improvements**
   - Chart.js or Recharts integration
   - Focus time graphs
   - Drowsiness patterns over time
   - Off-task behavior trends
   - Export reports (CSV/PDF)

6. **Configuration UI**
   - Settings page for thresholds
   - Enable/disable specific metrics
   - Notification preferences
   - Privacy controls (camera indicator always visible)

7. **Extension-Web App Bridge**
   - Full bidirectional communication
   - Web app can request extension data
   - Extension can push alerts to web app
   - Unified dashboard combining both modules

8. **Testing & Validation**
   - Unit tests for detection algorithms
   - E2E tests for extension
   - Performance benchmarking
   - Accuracy validation with ground truth data

### Low Priority

9. **Advanced Features**
   - Machine learning model training on user data
   - Adaptive thresholds based on time of day
   - Context-aware detection (meeting mode, focus mode, etc.)
   - Pomodoro timer integration
   - Team/group focus tracking

10. **Mobile Support**
    - React Native version for phone/tablet
    - Safari extension for iOS
    - Android app with camera detection

11. **Backend (Optional)**
    - Node.js/Fastify API
    - PostgreSQL or Supabase
    - Multi-device sync
    - Team dashboards
    - Cloud backups

## Immediate Next Steps

To get a working end-to-end system, focus on these in order:

1. **Implement fusion logic** in `src/fusion/bridge.ts`
   - Define `FocusState` type with combined states
   - Write decision rules for fusing attention + screen data
   - Test with mock data first

2. **Connect web app to extension**
   - Add message listener in Next.js app
   - Display real-time `ScreenSnapshot` data
   - Show fusion results in UI

3. **Add calibration flow**
   - Simple 3-step wizard: baseline → eyes closed → head down
   - Store thresholds per user
   - Apply calibrated values to detection

4. **Implement IndexedDB storage**
   - Install Dexie.js
   - Create schema for sessions/snapshots
   - Write data on every snapshot
   - Build query interface for analytics

5. **Polish alert system**
   - Add sound effects for drowsiness
   - Make alerts dismissible
   - Track alert acknowledgments
   - Prevent alert fatigue

After these 5 steps, you'll have a fully functional MVP.

---

## Troubleshooting

### Webcam Module Issues

**Camera not starting:**
- Check browser permissions (click lock icon in address bar)
- Ensure no other app is using the camera
- Try refreshing the page
- Check browser console for errors

**Face not detected:**
- Ensure good lighting (avoid backlighting)
- Face the camera directly
- Make sure face is centered in frame
- MediaPipe model loads from CDN - check network tab if stuck

**EAR values seem wrong:**
- Different people have different baseline EAR values
- Use calibration flow (when implemented) for personalized thresholds
- Try adjusting lighting or camera angle

### Chrome Extension Issues

**Extension not working:**
1. Go to `chrome://extensions/`
2. Ensure extension is enabled
3. Click "Refresh" icon on the extension
4. Check "Service Worker" link for errors
5. Reload the tab you're monitoring

**Not getting snapshots:**
- Check extension popup shows "On Task" or "Off Task"
- Open browser console and check for `window.postMessage` events
- Verify extension has permissions (check manifest.json)

**AI features not working:**
- Set API keys in `.env.local` or extension settings
- Check API key format and validity
- Monitor network tab for API call failures
- Reduce frequency if hitting rate limits

**Alerts too aggressive:**
- Declare your task in popup ("Set Task" button)
- Adjust `OFF_TASK_CATEGORIES` in `offTaskRules.ts`
- Disable extension temporarily (requires solving puzzles!)

### Build Issues

**TypeScript errors:**
```bash
npm install --save-dev @types/chrome
npx tsc --noEmit
```

**Extension build fails:**
```bash
rm -rf dist node_modules
npm install
npm run build
```

**Next.js build fails:**
```bash
rm -rf .next node_modules
npm install
npm run build
```

### Performance Issues

**High CPU usage:**
- Lower FPS in attention detector (change `FPS` constant)
- Reduce snapshot frequency (change `EMIT_INTERVAL_MS`)
- Disable unused metrics

**Battery drain:**
- Pause webcam detection when not needed
- Reduce extension polling interval (change in `background.ts`)
- Disable AI features

---

## Additional Resources

- [MediaPipe Face Landmarker Guide](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- [Chrome Extensions MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [EAR Algorithm Paper](http://vision.fe.uni-lj.si/cvww2016/proceedings/papers/05.pdf) (Soukupová & Čech, 2016)
- [PERCLOS Drowsiness Detection](https://www.nhtsa.gov/sites/nhtsa.gov/files/perclos_finalreport.pdf)
- [Next.js Documentation](https://nextjs.org/docs)

## License

MIT (or specify your license)

## Contributing

Contributions welcome! Priority areas:
1. Calibration system implementation
2. IndexedDB/Dexie.js integration
3. Fusion logic improvements
4. Test coverage
5. Documentation improvements

## Authors

Built as part of the SleepDefeater project.

---

**Note:** This is a productivity/safety tool. For production use in safety-critical applications (e.g., driver monitoring), additional validation and testing is required.
