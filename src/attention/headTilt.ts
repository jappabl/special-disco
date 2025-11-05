import type { Landmark } from "./faceLandmarks";

/**
 * Calculate head tilt angle (roll) using eye landmarks
 *
 * Uses the angle between the line connecting both eyes and the horizontal
 * to determine if the head is tilted to the side
 *
 * @param leftEye - Left eye landmarks
 * @param rightEye - Right eye landmarks
 * @returns Head roll angle in degrees (positive = tilted right, negative = tilted left)
 */
export function computeHeadTilt(
  leftEye: Landmark[],
  rightEye: Landmark[]
): number {
  if (leftEye.length === 0 || rightEye.length === 0) {
    return 0;
  }

  // Get center point of each eye
  const leftEyeCenter = getEyeCenter(leftEye);
  const rightEyeCenter = getEyeCenter(rightEye);

  // Calculate angle between the eye line and horizontal
  // Note: In MediaPipe coordinates, right eye has lower x than left eye
  // because the video is from the camera's perspective
  const deltaY = leftEyeCenter.y - rightEyeCenter.y;
  const deltaX = leftEyeCenter.x - rightEyeCenter.x;

  // Angle in radians, then convert to degrees
  const angleRad = Math.atan2(deltaY, deltaX);
  let angleDeg = (angleRad * 180) / Math.PI;

  // Normalize to -90 to +90 range (tilt angle)
  // Adjust so that 0° = upright, positive = tilted right, negative = tilted left
  if (angleDeg > 90) {
    angleDeg = angleDeg - 180;
  } else if (angleDeg < -90) {
    angleDeg = angleDeg + 180;
  }

  return angleDeg;
}

/**
 * Get the center point of an eye from its landmarks
 */
function getEyeCenter(eye: Landmark[]): { x: number; y: number } {
  const sum = eye.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / eye.length,
    y: sum.y / eye.length,
  };
}

/**
 * Determine if head tilt is excessive (indicating tiredness/drowsiness)
 * @param tiltAngle - Head tilt angle in degrees
 * @param threshold - Threshold in degrees (default: 15°)
 * @returns True if head is tilted beyond threshold
 */
export function isHeadTilted(
  tiltAngle: number,
  threshold: number = 15
): boolean {
  return Math.abs(tiltAngle) > threshold;
}
