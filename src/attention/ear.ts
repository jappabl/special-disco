import type { Landmark } from "./faceLandmarks";

/**
 * Compute Eye Aspect Ratio (EAR) for a single eye
 *
 * Formula: EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
 *
 * Using 6-point eye model:
 * - p1, p4: horizontal eye corners (left and right)
 * - p2, p3, p5, p6: vertical landmarks (top and bottom pairs)
 *
 * Eye indices from MediaPipe (already extracted in faceLandmarks.ts):
 * Left eye: [362, 385, 387, 263, 373, 380]
 * Right eye: [33, 160, 158, 133, 153, 144]
 *
 * Mapped to positions:
 * [0] = p1 (left corner)
 * [1] = p2 (top-left)
 * [2] = p3 (top-right)
 * [3] = p4 (right corner)
 * [4] = p5 (bottom-right)
 * [5] = p6 (bottom-left)
 *
 * @param eye - Array of 6 landmarks representing one eye
 * @returns EAR value (typically 0.15-0.35 when open, <0.2 when closed)
 */
export function computeEAR(eye: Landmark[]): number {
  if (eye.length !== 6) {
    console.warn(`Expected 6 landmarks for eye, got ${eye.length}`);
    return 0;
  }

  const [p1, p2, p3, p4, p5, p6] = eye;

  // Euclidean distance helper
  const distance = (a: Landmark, b: Landmark): number => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Vertical distances
  const vertical1 = distance(p2, p6); // ||p2 - p6||
  const vertical2 = distance(p3, p5); // ||p3 - p5||

  // Horizontal distance
  const horizontal = distance(p1, p4); // ||p1 - p4||

  // Avoid division by zero
  if (horizontal === 0) {
    return 0;
  }

  // EAR formula
  const ear = (vertical1 + vertical2) / (2.0 * horizontal);

  return ear;
}

/**
 * Compute average EAR from both eyes
 * @param leftEye - Left eye landmarks (6 points)
 * @param rightEye - Right eye landmarks (6 points)
 * @returns Average EAR value
 */
export function computeAverageEAR(
  leftEye: Landmark[],
  rightEye: Landmark[]
): number {
  const leftEAR = computeEAR(leftEye);
  const rightEAR = computeEAR(rightEye);

  return (leftEAR + rightEAR) / 2.0;
}
