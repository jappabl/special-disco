import type { Landmark } from "./faceLandmarks";

// Mouth landmarks for MAR (Mouth Aspect Ratio) calculation
const MOUTH_TOP_INDICES = [13, 14]; // Upper inner lip points
const MOUTH_BOTTOM_INDICES = [78, 308]; // Lower inner lip points
const MOUTH_LEFT_INDEX = 61; // Left corner
const MOUTH_RIGHT_INDEX = 291; // Right corner

/**
 * Compute Mouth Aspect Ratio (MAR)
 * Similar to EAR but for the mouth
 * MAR = vertical_distance / horizontal_distance
 *
 * Typical values:
 * - Closed mouth: ~0.1-0.2
 * - Normal speaking: ~0.3-0.5
 * - Yawning: >0.6
 */
export function computeMAR(allLandmarks: Landmark[]): number {
  const top1 = allLandmarks[MOUTH_TOP_INDICES[0]];
  const top2 = allLandmarks[MOUTH_TOP_INDICES[1]];
  const bottom1 = allLandmarks[MOUTH_BOTTOM_INDICES[0]];
  const bottom2 = allLandmarks[MOUTH_BOTTOM_INDICES[1]];
  const left = allLandmarks[MOUTH_LEFT_INDEX];
  const right = allLandmarks[MOUTH_RIGHT_INDEX];

  // Average vertical distance
  const vertical1 = distance(top1, bottom1);
  const vertical2 = distance(top2, bottom2);
  const avgVertical = (vertical1 + vertical2) / 2;

  // Horizontal distance
  const horizontal = distance(left, right);

  return avgVertical / (horizontal + 0.0001); // Avoid division by zero
}

function distance(p1: Landmark, p2: Landmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export type YawnState = {
  isYawning: boolean;
  avgMAR: number;
  yawnCount: number;
};

/**
 * Tracks yawning patterns over time
 * A yawn is detected when:
 * - MAR exceeds threshold (>0.6) for sustained period (0.5-3 seconds)
 * - Frequent yawning (>2 per minute) indicates drowsiness
 */
export class YawnDetector {
  private marHistory: number[] = [];
  private yawnCount: number = 0;
  private yawnTimes: number[] = [];
  private isCurrentlyYawning: boolean = false;
  private yawnStartTime: number | null = null;

  private readonly HISTORY_SIZE = 10; // Track last 10 frames for smoothing
  private readonly MAR_THRESHOLD = 0.6; // Mouth considered "wide open" above this
  private readonly MIN_YAWN_DURATION_MS = 500; // Minimum 0.5s to count as yawn
  private readonly MAX_YAWN_DURATION_MS = 3000; // Maximum 3s (after that it's just talking)
  private readonly YAWN_WINDOW_MS = 60000; // 1 minute window for counting yawns

  update(mar: number): YawnState {
    const now = Date.now();

    // Add to history for smoothing
    this.marHistory.push(mar);
    if (this.marHistory.length > this.HISTORY_SIZE) {
      this.marHistory.shift();
    }

    // Calculate average MAR
    const avgMAR =
      this.marHistory.reduce((sum, val) => sum + val, 0) / this.marHistory.length;

    // Detect yawn start/end
    const isMouthWideOpen = avgMAR > this.MAR_THRESHOLD;

    if (isMouthWideOpen && !this.isCurrentlyYawning) {
      // Yawn started
      this.isCurrentlyYawning = true;
      this.yawnStartTime = now;
    } else if (!isMouthWideOpen && this.isCurrentlyYawning && this.yawnStartTime) {
      // Yawn ended - check if it was a valid yawn duration
      const yawnDuration = now - this.yawnStartTime;
      if (
        yawnDuration >= this.MIN_YAWN_DURATION_MS &&
        yawnDuration <= this.MAX_YAWN_DURATION_MS
      ) {
        this.yawnCount++;
        this.yawnTimes.push(now);
      }
      this.isCurrentlyYawning = false;
      this.yawnStartTime = null;
    }

    // Clean up old yawns outside the window
    this.yawnTimes = this.yawnTimes.filter(
      (time) => now - time <= this.YAWN_WINDOW_MS
    );

    return {
      isYawning: this.isCurrentlyYawning,
      avgMAR,
      yawnCount: this.yawnCount,
    };
  }
}

/**
 * Check if yawn frequency indicates drowsiness
 * Normal: <2 yawns per minute
 * Drowsy: >=2 yawns per minute
 */
export function isDrowsyYawnRate(yawnCount: number): boolean {
  return yawnCount >= 2;
}
