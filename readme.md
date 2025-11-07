# SleepDefeater - Local-First Attention Tracking System

A privacy-focused drowsiness detection system combining webcam-based attention tracking with screen activity monitoring. All processing happens locally in your browser - no cloud uploads or external recording.

## Components

### 1. Webcam Attention Detection (Next.js Web App)
Real-time drowsiness detection using MediaPipe and TensorFlow.js

### 2. Screen Activity Tracker (Chrome Extension)
Tracks tab activity, categorizes browsing behavior, and detects idle time

---

# 📹 Webcam Attention Detection

## Features

- **Eye tracking**: Detects eye closure duration using Eye Aspect Ratio (EAR)
- **Head pose tracking**: Monitors head nodding, tilting, and pitch angles
- **Posture analysis**: Tracks slouching, leaning, and body presence
- **Voice warnings**: Gentle audio warnings before loud alarms (5-second grace period)
- **Audio fallback**: Tone-based alerts when speech synthesis fails
- **Calibration system**: Personalizes thresholds to individual users
- **Challenge prompts**: Math/trivia/typing challenges to confirm wakefulness

## Setup (Web App)

```bash
npm install
npm run dev
```

Visit `http://localhost:3000/attention-demo` to access the attention tracking interface.

## How It Works

1. **Face Detection** (`src/attention/faceLandmarks.ts`):
   - Uses MediaPipe Face Mesh to detect 468 facial landmarks
   - Tracks eyes, mouth, nose, and head orientation
   - Runs at 30 FPS for real-time detection

2. **Pose Detection** (`src/attention/poseLandmarks.ts`):
   - Uses MediaPipe Pose to detect body landmarks (shoulders, hips, spine)
   - Tracks posture and body position
   - Detects slouching and leaning

3. **Attention Analysis** (`src/attention/useAttentionDetector.ts`):
   - **Eye closure**: EAR < threshold for 3.5s = "nodding off", 5s = "sleeping"
   - **Head nodding**: Forward pitch > 10° indicates drowsiness
   - **Posture**: Slouch angle > threshold for 3s triggers warning
   - **Presence**: Detects if user leaves frame
   - Produces `AttentionSnapshot` objects: `{ state: 'awake' | 'noddingOff' | 'sleeping', confidence, ear, eyesClosedSec, ... }`

4. **Warning System** (`src/attention/voiceWarnings.ts`):
   - **Voice warnings**: Text-to-speech alerts (e.g., "Please open your eyes")
   - **5-second grace period**: Time to correct behavior before alarm
   - **Audio fallback**: Beep patterns if speech synthesis fails
   - **Loud alarm**: Blaring sound + challenge prompt if grace period expires

5. **Calibration**:
   - 4-second calibration on first use
   - Records baseline EAR, head pitch, and posture
   - Personalizes thresholds for better accuracy

## Detection States

- **awake**: Normal attention, eyes open, good posture
- **noddingOff**: Eyes closed 3.5+ seconds OR head nodding forward
- **sleeping**: Eyes closed 5+ seconds, high confidence drowsiness

## Attention Metrics

```typescript
{
  state: 'awake' | 'noddingOff' | 'sleeping',
  confidence: number,           // 0-1 probability
  ear: number,                  // Eye aspect ratio
  eyesClosedSec: number,        // Duration eyes closed
  headTiltAngle: number,        // Left/right tilt in degrees
  headPitchAngle: number,       // Forward/backward pitch
  isHeadNodding: boolean,       // Forward nod detected
  isSlouched: boolean,          // Poor posture detected
  isPresent: boolean,           // Body in frame
  activeWarning: string | null  // Current voice warning
}
```

## File Structure (Attention Detection)

```
src/
├── app/attention-demo/
│   └── page.tsx              # Main UI with canvas overlay
├── attention/
│   ├── faceLandmarks.ts      # MediaPipe face detection
│   ├── poseLandmarks.ts      # MediaPipe body detection
│   ├── ear.ts                # Eye aspect ratio
│   ├── headTilt.ts           # Side-to-side tilt
│   ├── headPitch.ts          # Forward/backward nod
│   ├── yawning.ts            # Mouth opening detection
│   ├── gazeDirection.ts      # Looking away detection
│   ├── faceDistance.ts       # Too close/far warning
│   ├── postureAnalysis.ts    # Slouching/leaning
│   ├── voiceWarnings.ts      # Voice + audio alerts
│   ├── useWebcamStream.ts    # Camera access
│   └── useAttentionDetector.ts # Main orchestrator
└── types/
    └── attention.ts          # TypeScript interfaces
```

---

# 📱 Chrome Extension (Screen Tracking)

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

## Setup (Extension)

```bash
npm install
npm run build
```

This will generate a `dist/` folder with your built extension.

**Note**: For the web app (attention detection), use `npm run dev` instead (see Webcam section above).

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
