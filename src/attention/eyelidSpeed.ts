/**
 * Eyelid Closure Speed Analysis
 *
 * Measures how fast the eyelids close during each closure event.
 * Slow closures (>300ms) indicate fatigue/drowsiness.
 * Fast closures (<200ms) are normal blinks.
 *
 * This helps distinguish between:
 * - Alert blinks: Fast, crisp movements
 * - Drowsy closures: Slow, heavy eyelid movements
 */

export type ClosureSpeedEvent = {
  timestamp: number;
  closureDuration: number; // milliseconds
  speed: "fast" | "normal" | "slow";
};

export type EyelidSpeedState = {
  currentClosureDuration: number; // milliseconds
  isClosing: boolean;
  slowClosureCount: number; // in last minute
  avgClosureSpeed: number; // milliseconds
  recentEvents: ClosureSpeedEvent[];
};

export class EyelidSpeedDetector {
  private closureStartTime: number | null = null;
  private closureEvents: ClosureSpeedEvent[] = [];
  private wasEyesOpen: boolean = true;
  private lastEAR: number = 0.3; // Start with open eyes

  private readonly FAST_CLOSURE_MS = 200; // <200ms = fast blink
  private readonly SLOW_CLOSURE_MS = 300; // >300ms = slow/drowsy
  private readonly EVENT_WINDOW_MS = 60000; // Track events in 1-minute window
  private readonly EAR_THRESHOLD = 0.20; // Same as main threshold

  update(currentEAR: number): EyelidSpeedState {
    const now = Date.now();
    const isEyesOpen = currentEAR >= this.EAR_THRESHOLD;
    const wasEyesOpen = this.lastEAR >= this.EAR_THRESHOLD;

    // Detect closure start (eyes transitioning from open to closed)
    if (wasEyesOpen && !isEyesOpen) {
      this.closureStartTime = now;
      this.wasEyesOpen = false;
    }

    // Detect closure complete (eyes fully closed)
    // We measure time from start of closure to fully closed
    if (
      this.closureStartTime &&
      !wasEyesOpen &&
      !isEyesOpen &&
      currentEAR < this.lastEAR - 0.05 // Still closing
    ) {
      // Still in closure phase, keep tracking
    }

    // Detect eye opening (closure event ended)
    if (!wasEyesOpen && isEyesOpen && this.closureStartTime) {
      const closureDuration = now - this.closureStartTime;

      // Classify speed
      let speed: "fast" | "normal" | "slow";
      if (closureDuration < this.FAST_CLOSURE_MS) {
        speed = "fast";
      } else if (closureDuration > this.SLOW_CLOSURE_MS) {
        speed = "slow";
      } else {
        speed = "normal";
      }

      this.closureEvents.push({
        timestamp: now,
        closureDuration,
        speed,
      });

      this.closureStartTime = null;
      this.wasEyesOpen = true;
    }

    // Clean up old events
    this.closureEvents = this.closureEvents.filter(
      (event) => now - event.timestamp <= this.EVENT_WINDOW_MS
    );

    // Calculate metrics
    const slowClosures = this.closureEvents.filter((e) => e.speed === "slow").length;
    const avgSpeed =
      this.closureEvents.length > 0
        ? this.closureEvents.reduce((sum, e) => sum + e.closureDuration, 0) /
          this.closureEvents.length
        : 0;

    const currentClosureDuration =
      this.closureStartTime && !isEyesOpen ? now - this.closureStartTime : 0;

    this.lastEAR = currentEAR;

    return {
      currentClosureDuration,
      isClosing: !!this.closureStartTime,
      slowClosureCount: slowClosures,
      avgClosureSpeed: avgSpeed,
      recentEvents: [...this.closureEvents],
    };
  }

  /**
   * Check if slow closure frequency indicates drowsiness
   * >3 slow closures per minute = drowsy
   */
  isDrowsyClosureSpeed(slowClosureCount: number): boolean {
    return slowClosureCount >= 3;
  }
}
