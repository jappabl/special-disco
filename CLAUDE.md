# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**sleepdefeater** is a local-first attention tracking system combining webcam-based drowsiness detection with screen activity monitoring. The project consists of:
- **Web app** (Next.js + TypeScript + React): Handles webcam capture, ML-based attention detection
- **Browser extension** (Chrome MV3 + Plasmo): Tracks tab activity, idle time, and categorizes browsing

All processing happens locally in the browser - no cloud uploads or external recording.

## Architecture

### Two-Module System

1. **Attention Module (Webcam)**
   - Uses MediaPipe/TensorFlow.js for face landmark detection
   - Calculates Eye Aspect Ratio (EAR) to detect drowsiness
   - Produces `AttentionSnapshot` objects: `{ state: 'awake' | 'noddingOff' | 'sleeping', confidence, ear, eyesClosedSec, headPitchDeg }`

2. **Screen Module (Extension)**
   - Monitors active tabs via Chrome APIs
   - Detects idle time using `chrome.idle`
   - Categorizes browsing: code/docs/video/social/other
   - Produces `ScreenSnapshot` objects: `{ state: 'on_task' | 'off_task', confidence, activeUrl, idleMs, category }`

3. **Fusion Logic**
   - Combines both snapshots into unified focus state
   - States: `good`, `sleepy`, `off_task`, `sleepy_and_off_task`
   - Triggers alerts when attention degrades

### Communication Flow

```
Extension (content script) → window.postMessage → Web App
                          ← chrome.runtime.sendMessage ←
```

### Data Storage

- **IndexedDB** (via Dexie.js) for local session storage
- Optional future backend: Node.js/Fastify + PostgreSQL/Supabase

## Tech Stack

- **Frontend:** Next.js, TypeScript, React, Tailwind CSS
- **State:** Zustand
- **ML:** MediaPipe Tasks Vision, TensorFlow.js (client-side)
- **Extension:** Chrome MV3, Plasmo, TypeScript
- **Storage:** IndexedDB (Dexie.js)

## Development Commands

### Web App
```bash
pnpm install              # Install dependencies
pnpm dev                  # Run Next.js dev server
pnpm build                # Production build
pnpm lint                 # Run linter
```

### Extension
```bash
cd extension
pnpm install              # Install extension dependencies
pnpm build                # Build extension
pnpm dev                  # Development mode with hot reload
```

## Key Implementation Notes

### Shared Types
Create `types.ts` for shared interfaces between web app and extension:
- `AttentionSnapshot`
- `ScreenSnapshot`
- `FusedState`

### Calibration Flow
User-specific EAR thresholds improve accuracy:
1. "Look normal" baseline
2. "Close eyes" detection
3. "Look down" head pose
Store calibration data in IndexedDB per user.

### Privacy-First Design
- Camera indicator must always be visible when active
- Toggle switches for both modules
- Clear data export/delete options
- No external network requests for core functionality
