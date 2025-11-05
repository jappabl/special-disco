/**
 * Microsleep Detection
 *
 * Microsleeps are brief, unintended episodes of loss of attention/sleep
 * lasting 0.5-15 seconds. They're a strong indicator of severe drowsiness.
 *
 * Detection strategy:
 * - Track eye closure events lasting 0.5-15 seconds
 * - Multiple microsleeps in a short period = critically drowsy
 * - Different from normal drowsiness (>3.5s sustained closure)
 */

export type MicrosleepEvent = {
  timestamp: number;
  duration: number; // milliseconds
};

export type MicrosleepState = {
  isInMicrosleep: boolean;
  currentDuration: number; // seconds
  microsleepCount: number; // in last 5 minutes
  recentEvents: MicrosleepEvent[];
};

export class MicrosleepDetector {
  private microsleepEvents: MicrosleepEvent[] = [];
  private currentMicrosleepStart: number | null = null;
  private wasEyesClosed: boolean = false;

  private readonly MIN_MICROSLEEP_MS = 500; // 0.5 seconds minimum
  private readonly MAX_MICROSLEEP_MS = 15000; // 15 seconds maximum
  private readonly EVENT_WINDOW_MS = 300000; // Track events in 5-minute window

  update(isEyesClosed: boolean): MicrosleepState {
    const now = Date.now();

    // Detect microsleep start
    if (isEyesClosed && !this.wasEyesClosed) {
      this.currentMicrosleepStart = now;
    }

    // Detect microsleep end
    if (!isEyesClosed && this.wasEyesClosed && this.currentMicrosleepStart) {
      const duration = now - this.currentMicrosleepStart;

      // Check if duration qualifies as microsleep
      if (duration >= this.MIN_MICROSLEEP_MS && duration <= this.MAX_MICROSLEEP_MS) {
        this.microsleepEvents.push({
          timestamp: now,
          duration,
        });
      }

      this.currentMicrosleepStart = null;
    }

    // Clean up old events outside the window
    this.microsleepEvents = this.microsleepEvents.filter(
      (event) => now - event.timestamp <= this.EVENT_WINDOW_MS
    );

    // Calculate current microsleep duration if in one
    let currentDuration = 0;
    let isInMicrosleep = false;
    if (this.currentMicrosleepStart && isEyesClosed) {
      currentDuration = (now - this.currentMicrosleepStart) / 1000;
      isInMicrosleep =
        currentDuration >= this.MIN_MICROSLEEP_MS / 1000 &&
        currentDuration <= this.MAX_MICROSLEEP_MS / 1000;
    }

    this.wasEyesClosed = isEyesClosed;

    return {
      isInMicrosleep,
      currentDuration,
      microsleepCount: this.microsleepEvents.length,
      recentEvents: [...this.microsleepEvents],
    };
  }

  /**
   * Check if microsleep frequency indicates critical drowsiness
   * >2 microsleeps in 5 minutes = critically drowsy
   */
  isCriticallyDrowsy(microsleepCount: number): boolean {
    return microsleepCount >= 2;
  }
}
