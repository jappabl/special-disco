import type { PoseLandmarks } from "./poseLandmarks";

/**
 * Calculate the vertical distance between shoulders and hips (slouch metric)
 * Returns normalized value where higher = more upright, lower = more slouched
 */
export function computePostureVertical(landmarks: PoseLandmarks): number {
  const shoulderMidY =
    (landmarks.leftShoulder.y + landmarks.rightShoulder.y) / 2;
  const hipMidY = (landmarks.leftHip.y + landmarks.rightHip.y) / 2;

  // Y coordinate increases downward in image space
  // Smaller difference = slouched, larger difference = upright
  const verticalDistance = hipMidY - shoulderMidY;

  return verticalDistance;
}

/**
 * Calculate forward lean angle based on shoulder-hip alignment
 * Positive = leaning forward, Negative = leaning backward
 */
export function computeLeanAngle(landmarks: PoseLandmarks): number {
  const shoulderMidZ =
    (landmarks.leftShoulder.z + landmarks.rightShoulder.z) / 2;
  const hipMidZ = (landmarks.leftHip.z + landmarks.rightHip.z) / 2;

  const shoulderMidY =
    (landmarks.leftShoulder.y + landmarks.rightShoulder.y) / 2;
  const hipMidY = (landmarks.leftHip.y + landmarks.rightHip.y) / 2;

  // Calculate angle in degrees
  // Z-axis: smaller Z = closer to camera (forward)
  // When leaning forward, shoulders move closer (smaller Z), so deltaZ is negative
  // We negate it so forward lean = positive angle
  const deltaZ = hipMidZ - shoulderMidZ; // Inverted: now forward = positive
  const deltaY = hipMidY - shoulderMidY;

  const angleRad = Math.atan2(deltaZ, deltaY);
  const angleDeg = (angleRad * 180) / Math.PI;

  return angleDeg;
}

/**
 * Check if user's body is visible in frame
 * Returns visibility score 0-1
 */
export function computeBodyPresence(landmarks: PoseLandmarks): number {
  const { visibility } = landmarks;

  // Average visibility of key upper body landmarks
  const avgVisibility =
    (visibility.leftShoulder +
      visibility.rightShoulder +
      visibility.leftHip +
      visibility.rightHip) /
    4;

  return avgVisibility;
}

/**
 * Detect if user is slouching based on posture vertical distance
 */
export function isSlouchedPosture(
  verticalDistance: number,
  baseline: number
): boolean {
  // If current vertical distance is significantly less than baseline, user is slouching
  const slouchThreshold = baseline * 0.75; // 25% reduction indicates slouching
  return verticalDistance < slouchThreshold;
}

/**
 * Detect if user has left their seat (body not visible)
 */
export function hasLeftSeat(presenceScore: number): boolean {
  const PRESENCE_THRESHOLD = 0.4; // Below 40% visibility = likely away
  return presenceScore < PRESENCE_THRESHOLD;
}

/**
 * Detect if user is leaning too far forward or backward
 */
export function isAbnormalLean(leanAngle: number): {
  isLeaning: boolean;
  direction: "forward" | "backward" | "neutral";
} {
  const FORWARD_THRESHOLD = 15; // degrees
  const BACKWARD_THRESHOLD = -10; // degrees

  if (leanAngle > FORWARD_THRESHOLD) {
    return { isLeaning: true, direction: "forward" };
  } else if (leanAngle < BACKWARD_THRESHOLD) {
    return { isLeaning: true, direction: "backward" };
  }

  return { isLeaning: false, direction: "neutral" };
}

/**
 * Calculate shoulder width for distance estimation
 */
export function computeShoulderWidth(landmarks: PoseLandmarks): number {
  const dx = landmarks.rightShoulder.x - landmarks.leftShoulder.x;
  const dy = landmarks.rightShoulder.y - landmarks.leftShoulder.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Posture tracker that maintains state over time
 */
export class PostureTracker {
  private baselineVertical: number | null = null;
  private baselineLeanAngle: number | null = null;
  private slouchStartTime: number | null = null;
  private awayStartTime: number | null = null;
  private leanStartTime: number | null = null;
  private currentLeanDirection: "forward" | "backward" | "neutral" = "neutral";

  /**
   * Set baseline posture (should be called during calibration)
   */
  setBaseline(verticalDistance: number, leanAngle: number): void {
    this.baselineVertical = verticalDistance;
    this.baselineLeanAngle = leanAngle;
  }

  /**
   * Update posture state with new landmarks
   */
  update(landmarks: PoseLandmarks | null, timestamp: number) {
    if (!landmarks) {
      // No pose detected - user might be away
      if (this.awayStartTime === null) {
        this.awayStartTime = timestamp;
      }

      return {
        isPresent: false,
        isSlouchingNow: false,
        isSlouched: false,
        slouchDuration: 0,
        awayDuration: timestamp - (this.awayStartTime ?? timestamp),
        leanAngle: 0,
        isLeaning: false,
        leanDirection: "neutral" as const,
        leanDuration: 0,
        postureVertical: 0,
        bodyPresence: 0,
      };
    }

    // User is present
    this.awayStartTime = null;

    const postureVertical = computePostureVertical(landmarks);
    const leanAngleRaw = computeLeanAngle(landmarks);
    const bodyPresence = computeBodyPresence(landmarks);
    const isPresent = !hasLeftSeat(bodyPresence);

    // Set one-time fallback baseline if not calibrated
    if (this.baselineLeanAngle === null) {
      this.baselineLeanAngle = leanAngleRaw;
    }

    // Adjust lean angle by baseline (like we do for head pitch)
    const leanAngle = leanAngleRaw - this.baselineLeanAngle;

    // Check slouching
    const baseline = this.baselineVertical ?? postureVertical;
    const isSlouchingNow = isSlouchedPosture(postureVertical, baseline);

    if (isSlouchingNow) {
      if (this.slouchStartTime === null) {
        this.slouchStartTime = timestamp;
      }
    } else {
      this.slouchStartTime = null;
    }

    const slouchDuration = this.slouchStartTime
      ? timestamp - this.slouchStartTime
      : 0;

    // Check leaning (using adjusted angle)
    const leanState = isAbnormalLean(leanAngle);

    if (leanState.isLeaning) {
      if (
        this.leanStartTime === null ||
        this.currentLeanDirection !== leanState.direction
      ) {
        this.leanStartTime = timestamp;
        this.currentLeanDirection = leanState.direction;
      }
    } else {
      this.leanStartTime = null;
      this.currentLeanDirection = "neutral";
    }

    const leanDuration = this.leanStartTime
      ? timestamp - this.leanStartTime
      : 0;

    return {
      isPresent,
      isSlouchingNow,
      isSlouched: slouchDuration > 3000, // Slouched for > 3 seconds
      slouchDuration,
      awayDuration: 0,
      leanAngle,
      isLeaning: leanState.isLeaning,
      leanDirection: leanState.direction,
      leanDuration,
      postureVertical,
      bodyPresence,
    };
  }

  /**
   * Reset all tracking state
   */
  reset(): void {
    this.baselineVertical = null;
    this.slouchStartTime = null;
    this.awayStartTime = null;
    this.leanStartTime = null;
    this.currentLeanDirection = "neutral";
  }
}
