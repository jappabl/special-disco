# Setup & Run Guide

## Project Structure

```
src/
├── types/
│   └── attention.ts              # Shared type definitions
├── fusion/
│   └── bridge.ts                 # Fusion bridge (placeholder)
├── attention/
│   ├── useWebcamStream.ts        # Webcam capture hook
│   ├── faceLandmarks.ts          # MediaPipe face tracking
│   ├── ear.ts                    # Eye Aspect Ratio calculation
│   └── useAttentionDetector.ts   # Main attention detection hook
└── app/
    ├── layout.tsx
    ├── page.tsx
    ├── globals.css
    └── attention-demo/
        └── page.tsx              # Debug UI page
```

## Installation

```bash
# Install dependencies
pnpm install
```

## Running the App

```bash
# Start development server
pnpm dev
```

Then open http://localhost:3000

- Main page has a link to the attention demo
- Navigate to `/attention-demo` to test the attention detection

## Usage

1. Click "Start Camera" to request webcam permission
2. Make sure your face is visible in the camera feed
3. Watch the metrics update in real-time:
   - **EAR** (Eye Aspect Ratio): typically 0.25-0.35 when eyes open, <0.22 when closed
   - **Eyes Closed Duration**: seconds eyes have been closed continuously
   - **State**: `AWAKE` (green) or `DROWSY` (red)
4. Open browser console to see `AttentionSnapshot` objects being logged every ~300ms

## Testing

Try these scenarios:
- Normal viewing → should show `AWAKE` state
- Close eyes for 2+ seconds → should trigger `DROWSY` state
- Blink normally → should not trigger drowsy (blinks are <0.5s)
- Look away (no face detected) → confidence drops

## Next Steps

- Tune `EAR_THRESHOLD` and `DROWSY_SEC` constants in `useAttentionDetector.ts`
- Add calibration flow for personalized thresholds
- Implement head pose detection using landmark positions
- Add blink rate tracking
- Replace `pushAttention` in `bridge.ts` with real fusion logic
