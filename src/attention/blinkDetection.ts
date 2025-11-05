/**
 * Blink Detection and Rate Tracking
 *
 * Detects blinks by tracking rapid EAR changes and calculates blinks per minute.
 * Normal blink rate: 15-20 blinks/min
 * Drowsy blink rate: <10 blinks/min
 */

export type BlinkState = {
  isBlinking: boolean;
  blinkCount: number;
  blinksPerMinute: number;
  lastBlinkTime: number;
};

export class BlinkDetector {
  private blinkCount = 0;
  private blinkTimes: number[] = []; // Timestamps of blinks
  private wasEyesClosed = false;
  private readonly WINDOW_MS = 60000; // 1 minute window for calculating rate

  /**
   * Update blink detection with current EAR value
   * @param ear - Current Eye Aspect Ratio
   * @param threshold - EAR threshold for considering eyes "closed" (default: 0.20)
   * @returns Current blink state
   */
  update(ear: number, threshold: number = 0.20): BlinkState {
    const now = Date.now();
    const eyesClosed = ear < threshold;

    // Detect a blink: transition from open -> closed -> open
    // We count the blink when eyes reopen (closed -> open transition)
    if (this.wasEyesClosed && !eyesClosed) {
      // Eyes just reopened - count as a blink
      this.blinkCount++;
      this.blinkTimes.push(now);
    }

    this.wasEyesClosed = eyesClosed;

    // Remove blinks older than 1 minute from the window
    this.blinkTimes = this.blinkTimes.filter(
      (time) => now - time <= this.WINDOW_MS
    );

    // Calculate blinks per minute
    const blinksInWindow = this.blinkTimes.length;
    const windowDurationMs = now - (this.blinkTimes[0] || now);
    const blinksPerMinute =
      blinksInWindow > 0
        ? (blinksInWindow / windowDurationMs) * this.WINDOW_MS
        : 0;

    return {
      isBlinking: eyesClosed,
      blinkCount: this.blinkCount,
      blinksPerMinute: Math.round(blinksPerMinute * 10) / 10, // Round to 1 decimal
      lastBlinkTime: this.blinkTimes[this.blinkTimes.length - 1] || 0,
    };
  }

  /**
   * Reset blink tracking
   */
  reset(): void {
    this.blinkCount = 0;
    this.blinkTimes = [];
    this.wasEyesClosed = false;
  }
}

/**
 * Determine if blink rate indicates drowsiness
 * @param blinksPerMinute - Current blinks per minute
 * @returns True if blink rate suggests drowsiness
 */
export function isDrowsyBlinkRate(blinksPerMinute: number): boolean {
  // Normal: 15-20 blinks/min
  // Drowsy: <10 blinks/min
  return blinksPerMinute < 10 && blinksPerMinute > 0;
}
