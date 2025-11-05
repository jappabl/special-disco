import type { Landmark } from "./faceLandmarks";

/**
 * Head Pitch Detection (Forward/Backward Head Movement)
 *
 * Detects when the head is tilted forward (nodding down) or backward.
 * Uses a face plane constructed from multiple landmarks to estimate the
 * actual head orientation in 3D space rather than relying on raw 2D deltas.
 *
 * Drowsy indicator: Head repeatedly nodding forward or sustained forward tilt
 */

// MediaPipe landmark indices (see face_mesh_landmarks.png for reference)
const FOREHEAD_INDEX = 10; // Between eyebrows
const CHIN_INDEX = 152; // Bottom of chin
const LEFT_EYE_OUTER_INDEX = 263; // Temporal corner of left eye (viewer left)
const RIGHT_EYE_OUTER_INDEX = 33; // Temporal corner of right eye (viewer right)

type Vec3 = { x: number; y: number; z: number };

function subtract(a: Landmark, b: Landmark): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: (a.z ?? 0) - (b.z ?? 0),
  };
}

function length(vec: Vec3): number {
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
}

function normalize(vec: Vec3): Vec3 {
  const len = length(vec);
  if (len === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: vec.x / len,
    y: vec.y / len,
    z: vec.z / len,
  };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Calculate head pitch angle using a plane defined by forehead, chin, and eye landmarks.
 *
 * @param allLandmarks - All 468 face landmarks
 * @returns Pitch angle in degrees (positive = head tilted down/forward, negative = tilted up/backward)
 */
export function computeHeadPitch(allLandmarks: Landmark[]): number {
  const requiredIndices = [
    FOREHEAD_INDEX,
    CHIN_INDEX,
    LEFT_EYE_OUTER_INDEX,
    RIGHT_EYE_OUTER_INDEX,
  ];

  const hasAllPoints = requiredIndices.every(
    (index) => allLandmarks.length > index && allLandmarks[index] !== undefined
  );

  if (!hasAllPoints) {
    return 0;
  }

  const forehead = allLandmarks[FOREHEAD_INDEX];
  const chin = allLandmarks[CHIN_INDEX];
  const leftEyeOuter = allLandmarks[LEFT_EYE_OUTER_INDEX];
  const rightEyeOuter = allLandmarks[RIGHT_EYE_OUTER_INDEX];

  // Construct orthogonal basis vectors for the head
  const sideVector = normalize(subtract(leftEyeOuter, rightEyeOuter));
  const rawDownVector = subtract(chin, forehead);
  const downVector = normalize(rawDownVector); // Points down the face

  // Estimate forward vector (normal of face plane). Choose orientation that faces the camera.
  const candidateA = normalize(cross(sideVector, downVector));
  const candidateB = normalize(cross(downVector, sideVector));
  const cameraForward: Vec3 = { x: 0, y: 0, z: -1 };

  let forwardVector = candidateA;
  if (dot(candidateB, cameraForward) > dot(candidateA, cameraForward)) {
    forwardVector = candidateB;
  }

  const forwardLength = length(forwardVector);
  if (forwardLength === 0) {
    // Degenerate case (landmarks collapsed) – fall back to chin/forehead vector
    const fallbackRadians = Math.atan2(-rawDownVector.z, rawDownVector.y || 1e-6);
    return clamp((fallbackRadians * 180) / Math.PI, -60, 60);
  }

  // Pitch corresponds to rotation around the horizontal axis. Positive when tilting forward.
  const pitchRadians = Math.asin(clamp(forwardVector.y, -1, 1));
  const pitchDegrees = (pitchRadians * 180) / Math.PI;

  return clamp(pitchDegrees, -60, 60);
}

/**
 * Determine if head pitch indicates drowsiness
 *
 * @param pitchAngle - Head pitch angle in degrees
 * @param threshold - Threshold in degrees (default: 20° forward tilt)
 * @returns True if head is tilted forward excessively
 */
export function isHeadNodding(pitchAngle: number, threshold: number = 20): boolean {
  // Only flag forward tilt (positive angles) as drowsy
  // Backward tilt is less indicative of drowsiness
  return pitchAngle > threshold;
}

/**
 * Track head nod patterns over time with automatic baseline calibration
 */
export class HeadNodDetector {
  private pitchHistory: number[] = [];
  private readonly HISTORY_SIZE = 18; // ~0.6 second at 30 FPS for responsive detection
  private readonly FORWARD_HYSTERESIS = 3; // Degrees below threshold before allowing re-trigger
  private readonly BACKWARD_HYSTERESIS = 3;
  private nodCount = 0;
  private wasForward = false;
  private wasBackward = false;

  /**
   * Update with current adjusted pitch angle and detect pitch extremes.
   *
   * @param adjustedPitch - Head pitch angle relative to calibrated baseline
   * @param forwardThreshold - Positive angle threshold that indicates forward nodding
   * @param backwardThreshold - Positive angle threshold (applied to absolute value) for backward tilt
   * @returns Detection state
   */
  update(
    adjustedPitch: number,
    forwardThreshold: number = 20,
    backwardThreshold: number = 20
  ): {
    isForwardNodding: boolean;
    isBackwardTilting: boolean;
    nodCount: number;
    avgPitch: number;
    instantaneousPitch: number;
    windowMax: number;
    windowMin: number;
  } {
    this.pitchHistory.push(adjustedPitch);

    // Keep only recent history
    if (this.pitchHistory.length > this.HISTORY_SIZE) {
      this.pitchHistory.shift();
    }

    // Calculate average pitch over window
    const avgPitch =
      this.pitchHistory.reduce((a, b) => a + b, 0) /
      this.pitchHistory.length;

    // Look at extrema in the recent window for faster response
    const windowMax = Math.max(...this.pitchHistory);
    const windowMin = Math.min(...this.pitchHistory);

    // Detect nods / tilts
    const isForward = windowMax > forwardThreshold;
    const isBackward = windowMin < -backwardThreshold;

    if (isForward && !this.wasForward) {
      this.nodCount++;
      this.wasForward = true;
    } else if (!isForward && windowMax < forwardThreshold - this.FORWARD_HYSTERESIS) {
      this.wasForward = false;
    }

    if (isBackward && !this.wasBackward) {
      this.wasBackward = true;
    } else if (!isBackward && windowMin > -(backwardThreshold - this.BACKWARD_HYSTERESIS)) {
      this.wasBackward = false;
    }

    return {
      isForwardNodding: isForward,
      isBackwardTilting: isBackward,
      nodCount: this.nodCount,
      avgPitch,
      instantaneousPitch: adjustedPitch,
      windowMax,
      windowMin,
    };
  }

  reset(): void {
    this.pitchHistory = [];
    this.nodCount = 0;
    this.wasForward = false;
    this.wasBackward = false;
  }
}
