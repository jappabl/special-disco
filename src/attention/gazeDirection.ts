import type { Landmark } from "./faceLandmarks";

// Iris landmarks (center of each eye)
const LEFT_IRIS_CENTER = 468; // MediaPipe iris landmark
const RIGHT_IRIS_CENTER = 473;

// Eye corner landmarks for reference frame
const LEFT_EYE_LEFT_CORNER = 33;
const LEFT_EYE_RIGHT_CORNER = 133;
const RIGHT_EYE_LEFT_CORNER = 362;
const RIGHT_EYE_RIGHT_CORNER = 263;

/**
 * Compute gaze direction as a ratio
 * Returns values between -1 (looking far left) to +1 (looking far right)
 * ~0 means looking at center
 */
export function computeHorizontalGaze(allLandmarks: Landmark[]): number {
  // Left eye gaze
  const leftIris = allLandmarks[LEFT_IRIS_CENTER];
  const leftCornerLeft = allLandmarks[LEFT_EYE_LEFT_CORNER];
  const leftCornerRight = allLandmarks[LEFT_EYE_RIGHT_CORNER];

  const leftEyeWidth = Math.abs(leftCornerRight.x - leftCornerLeft.x);
  const leftIrisOffset = leftIris.x - leftCornerLeft.x;
  const leftGazeRatio = (leftIrisOffset / leftEyeWidth) * 2 - 1; // Normalize to -1 to 1

  // Right eye gaze
  const rightIris = allLandmarks[RIGHT_IRIS_CENTER];
  const rightCornerLeft = allLandmarks[RIGHT_EYE_LEFT_CORNER];
  const rightCornerRight = allLandmarks[RIGHT_EYE_RIGHT_CORNER];

  const rightEyeWidth = Math.abs(rightCornerRight.x - rightCornerLeft.x);
  const rightIrisOffset = rightIris.x - rightCornerLeft.x;
  const rightGazeRatio = (rightIrisOffset / rightEyeWidth) * 2 - 1;

  // Average both eyes
  return (leftGazeRatio + rightGazeRatio) / 2;
}

export type GazeState = {
  horizontalGaze: number;
  isLookingAway: boolean;
  lookAwayDuration: number; // seconds
};

/**
 * Tracks gaze direction over time
 * Detects when user is looking away from screen for extended periods
 * Looking away for >5 seconds indicates inattention/drowsiness
 */
export class GazeTracker {
  private gazeHistory: number[] = [];
  private lookAwayStartTime: number | null = null;
  private lookAwayDurationMs: number = 0;

  private readonly HISTORY_SIZE = 10;
  private readonly LOOK_AWAY_THRESHOLD = 0.4; // Gaze ratio beyond ±0.4 is "looking away"
  private readonly DROWSY_LOOK_AWAY_SEC = 5; // Looking away for >5s indicates drowsiness

  update(horizontalGaze: number): GazeState {
    const now = Date.now();

    // Add to history for smoothing
    this.gazeHistory.push(horizontalGaze);
    if (this.gazeHistory.length > this.HISTORY_SIZE) {
      this.gazeHistory.shift();
    }

    // Calculate average gaze
    const avgGaze =
      this.gazeHistory.reduce((sum, val) => sum + val, 0) / this.gazeHistory.length;

    // Determine if looking away (significantly left or right)
    const isLookingAway = Math.abs(avgGaze) > this.LOOK_AWAY_THRESHOLD;

    // Track look away duration
    if (isLookingAway) {
      if (this.lookAwayStartTime === null) {
        this.lookAwayStartTime = now;
      }
      this.lookAwayDurationMs = now - this.lookAwayStartTime;
    } else {
      this.lookAwayStartTime = null;
      this.lookAwayDurationMs = 0;
    }

    return {
      horizontalGaze: avgGaze,
      isLookingAway,
      lookAwayDuration: this.lookAwayDurationMs / 1000,
    };
  }

  isDrowsyGaze(lookAwayDuration: number): boolean {
    return lookAwayDuration > this.DROWSY_LOOK_AWAY_SEC;
  }
}
