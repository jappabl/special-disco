/**
 * PERCLOS (Percentage of Eye Closure)
 *
 * Industry-standard drowsiness metric measuring the percentage of time
 * the eyes are closed (or nearly closed) over a time window.
 *
 * Standard: PERCLOS > 20% over 1 minute indicates drowsiness
 * Critical: PERCLOS > 40% indicates severe drowsiness
 */

export type PERCLOSState = {
  perclos: number; // Percentage (0-100)
  windowDuration: number; // seconds
  closedFrames: number;
  totalFrames: number;
};

export class PERCLOSDetector {
  private eyeStateHistory: boolean[] = []; // true = closed, false = open
  private readonly WINDOW_SIZE = 1800; // 60 seconds at 30 FPS
  private readonly DROWSY_THRESHOLD = 20; // 20% PERCLOS
  private readonly CRITICAL_THRESHOLD = 40; // 40% PERCLOS

  update(isEyesClosed: boolean): PERCLOSState {
    // Add current state to history
    this.eyeStateHistory.push(isEyesClosed);

    // Maintain sliding window
    if (this.eyeStateHistory.length > this.WINDOW_SIZE) {
      this.eyeStateHistory.shift();
    }

    // Calculate PERCLOS
    const closedFrames = this.eyeStateHistory.filter((closed) => closed).length;
    const totalFrames = this.eyeStateHistory.length;
    const perclos = totalFrames > 0 ? (closedFrames / totalFrames) * 100 : 0;

    return {
      perclos,
      windowDuration: totalFrames / 30, // Assuming 30 FPS
      closedFrames,
      totalFrames,
    };
  }

  isDrowsy(perclos: number): boolean {
    return perclos >= this.DROWSY_THRESHOLD;
  }

  isCriticallyDrowsy(perclos: number): boolean {
    return perclos >= this.CRITICAL_THRESHOLD;
  }
}
