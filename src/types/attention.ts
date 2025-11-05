export type AttentionState = "awake" | "noddingOff" | "sleeping";

export type AttentionSnapshot = {
  t: number; // Date.now()
  state: AttentionState;
  confidence: number; // 0–1
  metrics: {
    ear?: number;          // Eye Aspect Ratio
    eyesClosedSec?: number;// seconds eyes have been "closed" in current run
    headPitchDeg?: number; // >0 = head tilted down (optional v1)
  };
};
