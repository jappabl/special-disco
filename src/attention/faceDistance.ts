import type { Landmark } from "./faceLandmarks";

// Face landmarks for measuring face size (distance proxy)
const FACE_LEFT_INDEX = 234; // Left edge of face
const FACE_RIGHT_INDEX = 454; // Right edge of face

/**
 * Compute face width as a proxy for distance from camera
 * Returns normalized face width (0-1 range based on landmark coordinates)
 *
 * Typical values:
 * - Too far: <0.15 (face appears small)
 * - Normal: 0.15-0.35
 * - Too close: >0.35 (face appears large)
 */
export function computeFaceWidth(allLandmarks: Landmark[]): number {
  const leftEdge = allLandmarks[FACE_LEFT_INDEX];
  const rightEdge = allLandmarks[FACE_RIGHT_INDEX];

  const faceWidth = Math.abs(rightEdge.x - leftEdge.x);
  return faceWidth;
}

export type DistanceState = {
  faceWidth: number;
  isTooClose: boolean;
  isTooFar: boolean;
  distanceWarningDuration: number; // seconds
};

/**
 * Tracks face distance from camera over time
 * Unusual distance (too close/far) sustained for >5 seconds indicates:
 * - Too close: Leaning in due to fatigue/poor posture
 * - Too far: Slouching/leaning back due to drowsiness
 */
export class FaceDistanceTracker {
  private widthHistory: number[] = [];
  private warningStartTime: number | null = null;
  private warningDurationMs: number = 0;

  private readonly HISTORY_SIZE = 10;
  private readonly TOO_CLOSE_THRESHOLD = 0.35; // Face width > 35% of frame
  private readonly TOO_FAR_THRESHOLD = 0.15; // Face width < 15% of frame
  private readonly DROWSY_WARNING_SEC = 5; // Sustained unusual distance for >5s

  update(faceWidth: number): DistanceState {
    const now = Date.now();

    // Add to history for smoothing
    this.widthHistory.push(faceWidth);
    if (this.widthHistory.length > this.HISTORY_SIZE) {
      this.widthHistory.shift();
    }

    // Calculate average width
    const avgWidth =
      this.widthHistory.reduce((sum, val) => sum + val, 0) / this.widthHistory.length;

    // Determine if distance is abnormal
    const isTooClose = avgWidth > this.TOO_CLOSE_THRESHOLD;
    const isTooFar = avgWidth < this.TOO_FAR_THRESHOLD;
    const isAbnormalDistance = isTooClose || isTooFar;

    // Track warning duration
    if (isAbnormalDistance) {
      if (this.warningStartTime === null) {
        this.warningStartTime = now;
      }
      this.warningDurationMs = now - this.warningStartTime;
    } else {
      this.warningStartTime = null;
      this.warningDurationMs = 0;
    }

    return {
      faceWidth: avgWidth,
      isTooClose,
      isTooFar,
      distanceWarningDuration: this.warningDurationMs / 1000,
    };
  }

  isDrowsyDistance(warningDuration: number): boolean {
    return warningDuration > this.DROWSY_WARNING_SEC;
  }
}
