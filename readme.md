# ULTIMATE SLEEP DEFEATER — Personal Attention & Task Awareness Tracker

**sleepdefeater** is a web app + extension combo that helps you stay focused and avoid dozing off while working or studying.  
It monitors two main signals:
- **Webcam attention (eyes, blinks, head pose)**  
- **Screen activity (tabs, idle time, site categories)**  

Everything runs **locally in your browser** — no cloud recording, no uploads, no surveillance.

---

## 🚀 Project Scope & Roadmap

### 🧩 Phase 1 — Core MVP (2–3 weeks)

**Goal:** Local-only prototype that detects drowsiness and off-task moments.

#### You (Webcam / Attention module)
- [ ] Implement webcam capture (`getUserMedia`)
- [ ] Integrate MediaPipe / TF.js face landmarks
- [ ] Compute Eye Aspect Ratio (EAR)
- [ ] Detect eye closure duration → classify `awake | drowsy`
- [ ] Send `AttentionSnapshot` via `pushAttention(snapshot)`
- [ ] Basic React UI: video preview + status indicator

#### Partner (Screen / Web-traffic module)
- [ ] Build Chrome MV3 extension using Plasmo or Vite
- [ ] Track active tab URL + title
- [ ] Detect idle time via `chrome.idle`
- [ ] Classify category: code / docs / video / social / other
- [ ] Emit `ScreenSnapshot` → postMessage → web app

#### Shared (Fusion / UI)
- [ ] Create shared `types.ts`
- [ ] Combine `AttentionSnapshot` + `ScreenSnapshot`
- [ ] Compute fused state: `good`, `sleepy`, `off_task`, `sleepy_and_off_task`
- [ ] Trigger overlay alert or sound

---

### ⚙️ Phase 2 — Calibration & Feedback (2–3 weeks)

**Goal:** Improve reliability, reduce false alarms.

#### Attention
- [ ] Add calibration flow (“look normal” → “close eyes” → “look down”)
- [ ] Dynamically set EAR thresholds per user
- [ ] Add blink rate trend analysis
- [ ] Head pose (pitch angle via face landmarks)

#### Screen
- [ ] Add per-domain “allowlist / blocklist”
- [ ] Aggregate focus stats (per hour/day)
- [ ] Idle vs off-task differentiation

#### Fusion
- [ ] Weighted scoring instead of hard logic
- [ ] Display attention & focus timeline graph
- [ ] Export session summary (CSV / JSON)

---

### 🔒 Phase 3 — Privacy & UX Polish (2 weeks)

**Goal:** Make it safe, transparent, and pleasant to use.

- [ ] Add visible “Camera Active” indicator
- [ ] Add on/off toggle for both modules
- [ ] Local-only data storage via IndexedDB
- [ ] Clear data export/delete options
- [ ] Add dark/light UI themes
- [ ] Add pause/resume button for sessions

---

### ☁️ Phase 4 — Optional Cloud Features (Later)

**Goal:** If you decide to sync or visualize data remotely.

- [ ] Lightweight Node.js/Fastify backend (Railway / Fly.io)
- [ ] Supabase/Postgres for aggregate stats
- [ ] JWT auth (Clerk or NextAuth)
- [ ] Daily/weekly attention reports
- [ ] Device sync (if multiple machines)

---

## 🧱 Tech Stack Summary

| Area | Stack |
|------|-------|
| Frontend | **Next.js**, **TypeScript**, **React**, **Tailwind CSS** |
| ML (client-side) | **MediaPipe Tasks Vision**, **TensorFlow.js** |
| State Mgmt | **Zustand** |
| Storage | **IndexedDB (Dexie.js)** |
| Extension | **Chrome MV3**, **Plasmo**, **TypeScript** |
| Messaging | **window.postMessage**, **chrome.runtime.sendMessage** |
| Optional Backend | **Node.js (Fastify)** + **PostgreSQL / Supabase** |

---

## 🧠 Core Concepts

- **AttentionSnapshot:** from webcam  
  `{ state: 'awake' | 'noddingOff' | 'sleeping', confidence, ear, eyesClosedSec, headPitchDeg }`
- **ScreenSnapshot:** from extension  
  `{ state: 'on_task' | 'off_task', confidence, activeUrl, idleMs, category }`
- **Fusion logic:** combines both snapshots → overall focus state

---

## 🧪 Testing & Metrics

- Test with various lighting and camera angles
- Log false positives / negatives
- Measure:
  - EAR stability
  - Detection latency
  - User false alert rate
- Iteratively tune thresholds

---

## 🛠️ Developer Setup

```bash
# clone
git clone https://github.com/yourname/focusguard
cd focusguard

# install deps
pnpm install

# dev run (web app)
pnpm dev

# dev run (extension)
cd extension && pnpm build && pnpm dev
