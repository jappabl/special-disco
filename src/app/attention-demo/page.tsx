"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import { useWebcamStream } from "@/attention/useWebcamStream";
import { useAttentionDetector } from "@/attention/useAttentionDetector";
import { primeSpeechSynthesis } from "@/attention/voiceWarnings";
export default function AttentionDemoPage() {
  const { videoRef, isReady, error, start, stop } = useWebcamStream();
  const [isActive, setIsActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmOscRef = useRef<OscillatorNode[] | null>(null);
  const alarmGainRef = useRef<GainNode | null>(null);

  const {
    state,
    confidence,
    ear,
    eyesClosedSec,
    headTiltAngle,
    isHeadTilted,
    headPitchAngle,
    headPitchWindowMin,
    headPitchWindowMax,
    instantaneousHeadPitchAngle,
    isHeadNodding,
    isHeadTiltingBack,
    mar,
    isYawning,
    yawnCount,
    gazeDirection,
    isLookingAway,
    lookAwayDuration,
    faceWidth,
    isTooClose,
    isTooFar,
    distanceWarningDuration,
    // Posture metrics
    isSlouchingNow,
    isSlouched,
    slouchDuration,
    leanAngle,
    isLeaning,
    leanDirection,
    leanDuration,
    bodyPresence,
    isPresent,
    awayDuration,
    // Absence alarm
    absentCountdown,
    isAbsenceAlarmArmed,
    disarmAbsenceAlarm,
    // Voice warning
    activeWarning,
    landmarks,
    poseLandmarks,
    isCalibrating,
    calibrationProgress,
    calibrationBaselines,
    activeAlarms,
    alarmPhrase,
    challengePrompt,
    challengeType,
    requireAlarmAck,
    silenceAlarm,
    triggerDebugAlarm,
  } = useAttentionDetector(videoRef, isReady && isActive);
  const [alarmInput, setAlarmInput] = useState<string>("");
  const [alarmError, setAlarmError] = useState<string | null>(null);

  const ensureAudioContext = useCallback(async () => {
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new AudioContext();
      } catch (err) {
        console.warn("Failed to create AudioContext", err);
        return;
      }
    }

    if (audioCtxRef.current?.state === "suspended") {
      try {
        await audioCtxRef.current.resume();
      } catch (err) {
        console.warn("Failed to resume AudioContext", err);
      }
    }
  }, []);

  const handleStart = useCallback(async () => {
    await start();
    await ensureAudioContext();
    primeSpeechSynthesis(); // Prime speech synthesis on user interaction
    setIsActive(true);
  }, [ensureAudioContext, start]);

  const handleStop = useCallback(() => {
    stop();
    setIsActive(false);
  }, [stop]);

  const handlePrimeAudio = useCallback(async () => {
    await ensureAudioContext();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (err) {
      console.warn("Unable to play test tone", err);
    }
  }, [ensureAudioContext]);

  // Draw face landmarks on canvas
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current || !isReady) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas size to video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    let lastDrawTime = 0;
    const DRAW_FPS = 30;
    const DRAW_INTERVAL = 1000 / DRAW_FPS; // ~33ms between draws

    const drawLandmarks = () => {
      if (!ctx || !canvas) return;

      const now = performance.now();

      // Throttle rendering to 30 FPS
      if (now - lastDrawTime < DRAW_INTERVAL) {
        requestAnimationFrame(drawLandmarks);
        return;
      }

      lastDrawTime = now;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;

      if (isCalibrating) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "white";
        ctx.font = "bold 24px monospace";
        ctx.fillText(
          `Calibrating... ${Math.round(calibrationProgress * 100)}%`,
          20,
          40
        );
        ctx.font = "16px monospace";
        ctx.fillText("Hold a neutral, upright pose", 20, 70);
        if (!landmarks) {
          ctx.fillText("Center your face inside the frame", 20, 95);
        }
      }

      // Draw text overlays first (before flipping for landmarks)
      const calibratedEarThreshold = calibrationBaselines
        ? Math.max(calibrationBaselines.ear * 0.75, 0.15)
        : 0.2;

      const stateLabel = formatStateLabel(state);
      const hasAlarms = activeAlarms.length > 0 || requireAlarmAck;
      const overlayHeight = hasAlarms ? 84 : 44;

      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(12, 12, 340, overlayHeight);

      ctx.fillStyle = "white";
      ctx.font = "bold 20px monospace";
      ctx.fillText(`STATE: ${stateLabel}`, 20, 36);

      if (!landmarks) {
        requestAnimationFrame(drawLandmarks);
        return;
      }

      if (hasAlarms) {
        ctx.font = "bold 16px monospace";
        ctx.fillStyle = "#fbbf24";
        ctx.fillText(
          activeAlarms.length > 0
            ? activeAlarms[0].message
            : "ALARM ACTIVE",
          20,
          60
        );
        if (requireAlarmAck) {
          ctx.font = "12px monospace";
          ctx.fillStyle = "#fef3c7";
          const instruction =
            challengeType === "phrase"
              ? "Complete the on-screen typing challenge to silence alarm"
              : challengeType === "math"
              ? "Solve the on-screen math challenge to silence alarm"
              : "Answer the on-screen trivia question to silence alarm";
          ctx.fillText(instruction, 20, 80);
        }
        ctx.fillStyle = "white";
      }

      // Apply horizontal flip for landmarks to match mirrored video
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-w, 0);

      // Draw all face points (small gray dots)
      ctx.fillStyle = "rgba(200, 200, 200, 0.3)";
      landmarks.allPoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x * w, point.y * h, 1, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Draw left eye (green)
      ctx.strokeStyle = "lime";
      ctx.fillStyle = "lime";
      ctx.lineWidth = 2;
      ctx.beginPath();
      landmarks.leftEye.forEach((point, i) => {
        const x = point.x * w;
        const y = point.y * h;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        // Draw point
        ctx.fillRect(x - 3, y - 3, 6, 6);
      });
      ctx.closePath();
      ctx.stroke();

      // Draw right eye (cyan)
      ctx.strokeStyle = "cyan";
      ctx.fillStyle = "cyan";
      ctx.beginPath();
      landmarks.rightEye.forEach((point, i) => {
        const x = point.x * w;
        const y = point.y * h;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        // Draw point
        ctx.fillRect(x - 3, y - 3, 6, 6);
      });
      ctx.closePath();
      ctx.stroke();

      // Restore canvas for text overlays
      ctx.restore();

      // Draw eye closure indicator and timer (text - not flipped)
      if (ear !== undefined && ear < calibratedEarThreshold) {
        // Eyes closed - draw red overlay
        ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
        ctx.fillRect(0, 0, w, h);

        // Text indicator with timer - positioned below STATE box
        ctx.fillStyle = "red";
        ctx.font = "bold 24px monospace";
        ctx.fillText("EYES CLOSED", 20, 120);

        // Draw timer
        if (eyesClosedSec !== undefined && eyesClosedSec > 0) {
          ctx.font = "bold 32px monospace";
          ctx.fillText(`${eyesClosedSec.toFixed(1)}s`, 20, 160);
        }
      }

      // Draw head tilt indicator - positioned in middle-left
      if (isHeadTilted && headTiltAngle !== undefined) {
        ctx.fillStyle = "rgba(255, 165, 0, 0.3)"; // Orange overlay
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "orange";
        ctx.font = "bold 24px monospace";
        const tiltText = headTiltAngle > 0 ? "HEAD TILTED RIGHT" : "HEAD TILTED LEFT";
        ctx.fillText(tiltText, 20, 220);
        ctx.font = "bold 20px monospace";
        ctx.fillText(`${Math.abs(headTiltAngle).toFixed(1)}°`, 20, 250);
      }

      // Highlight head pitch extremes
      if (isHeadNodding) {
        ctx.fillStyle = "rgba(255, 0, 0, 0.18)";
        ctx.fillRect(0, 0, w, h);
      } else if (isHeadTiltingBack) {
        ctx.fillStyle = "rgba(96, 165, 250, 0.18)";
        ctx.fillRect(0, 0, w, h);
      }

      // Draw head pitch diagnostics - positioned in bottom-left with more spacing
      const pitchTextColor = isHeadNodding
        ? "red"
        : isHeadTiltingBack
          ? "#60a5fa"
          : "white";
      ctx.fillStyle = pitchTextColor;
      ctx.font = "bold 14px monospace";
      ctx.strokeStyle = "black";
      ctx.lineWidth = 3;
      let pitchLabelY = h - 180; // Move up to avoid overlap

      if (headPitchAngle !== undefined) {
        const label = `Pitch avg: ${headPitchAngle.toFixed(1)}°`;
        ctx.strokeText(label, 20, pitchLabelY);
        ctx.fillText(label, 20, pitchLabelY);
        pitchLabelY += 20;
      }

      if (instantaneousHeadPitchAngle !== undefined) {
        const label = `Pitch inst: ${instantaneousHeadPitchAngle.toFixed(1)}°`;
        ctx.strokeText(label, 20, pitchLabelY);
        ctx.fillText(label, 20, pitchLabelY);
        pitchLabelY += 20;
      }

      if (headPitchWindowMax !== undefined) {
        const label = `Forward peak: ${headPitchWindowMax.toFixed(1)}°`;
        ctx.strokeText(label, 20, pitchLabelY);
        ctx.fillText(label, 20, pitchLabelY);
        pitchLabelY += 20;
      }

      if (headPitchWindowMin !== undefined) {
        const label = `Backward peak: ${headPitchWindowMin.toFixed(1)}°`;
        ctx.strokeText(label, 20, pitchLabelY);
        ctx.fillText(label, 20, pitchLabelY);
        pitchLabelY += 20;
      }

      if (calibrationBaselines?.pitch !== undefined) {
        const label = `Baseline pitch: ${calibrationBaselines.pitch.toFixed(1)}°`;
        ctx.strokeText(label, 20, pitchLabelY);
        ctx.fillText(label, 20, pitchLabelY);
        pitchLabelY += 20;
      }

      if (isHeadNodding) {
        const label = `FORWARD NOD`;
        ctx.strokeText(label, 20, pitchLabelY);
        ctx.fillText(label, 20, pitchLabelY);
      } else if (isHeadTiltingBack) {
        const label = `BACKWARD TILT`;
        ctx.strokeText(label, 20, pitchLabelY);
        ctx.fillText(label, 20, pitchLabelY);
      }

    // Draw pose landmarks (body/shoulders) - need flipping
    if (poseLandmarks) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-w, 0);

      const { leftShoulder, rightShoulder, leftHip, rightHip, nose, visibility } = poseLandmarks;

      // Draw all pose points (small purple dots)
      ctx.fillStyle = "rgba(200, 150, 255, 0.4)";
      poseLandmarks.allPoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x * w, point.y * h, 2, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Draw skeleton connections
      ctx.strokeStyle = "rgba(147, 51, 234, 0.8)"; // Purple
      ctx.lineWidth = 3;

      // Shoulder line
      if (visibility.leftShoulder > 0.5 && visibility.rightShoulder > 0.5) {
        ctx.beginPath();
        ctx.moveTo(leftShoulder.x * w, leftShoulder.y * h);
        ctx.lineTo(rightShoulder.x * w, rightShoulder.y * h);
        ctx.stroke();
      }

      // Hip line
      if (visibility.leftHip > 0.5 && visibility.rightHip > 0.5) {
        ctx.beginPath();
        ctx.moveTo(leftHip.x * w, leftHip.y * h);
        ctx.lineTo(rightHip.x * w, rightHip.y * h);
        ctx.stroke();
      }

      // Spine (connect shoulder midpoint to hip midpoint)
      if (visibility.leftShoulder > 0.5 && visibility.rightShoulder > 0.5 &&
          visibility.leftHip > 0.5 && visibility.rightHip > 0.5) {
        const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2 * w;
        const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2 * h;
        const hipMidX = (leftHip.x + rightHip.x) / 2 * w;
        const hipMidY = (leftHip.y + rightHip.y) / 2 * h;

        ctx.beginPath();
        ctx.moveTo(shoulderMidX, shoulderMidY);
        ctx.lineTo(hipMidX, hipMidY);
        ctx.stroke();
      }

      // Draw key landmarks (larger circles)
      const drawLandmark = (point: { x: number; y: number }, vis: number, color: string, label: string) => {
        if (vis > 0.5) {
          ctx.fillStyle = color;
          ctx.strokeStyle = "white";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(point.x * w, point.y * h, 8, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();

          // Label
          ctx.fillStyle = "white";
          ctx.strokeStyle = "black";
          ctx.font = "bold 12px monospace";
          ctx.lineWidth = 3;
          ctx.strokeText(label, point.x * w + 12, point.y * h + 5);
          ctx.fillText(label, point.x * w + 12, point.y * h + 5);
        }
      };

      drawLandmark(leftShoulder, visibility.leftShoulder, "#a855f7", "LS"); // Purple
      drawLandmark(rightShoulder, visibility.rightShoulder, "#c084fc", "RS"); // Light purple
      drawLandmark(leftHip, visibility.leftHip, "#7c3aed", "LH"); // Dark purple
      drawLandmark(rightHip, visibility.rightHip, "#9333ea", "RH"); // Medium purple
    }

      // Restore canvas for text rendering
      ctx.restore();

      // Draw posture status overlay (text - not flipped)
    if (poseLandmarks) {
      let postureY = h - 40;
      ctx.fillStyle = "white";
      ctx.strokeStyle = "black";
      ctx.font = "bold 16px monospace";
      ctx.lineWidth = 3;

      if (isSlouched && slouchDuration !== undefined) {
        ctx.fillStyle = "orange";
        const label = `SLOUCHING (${(slouchDuration / 1000).toFixed(1)}s)`;
        ctx.strokeText(label, w - 280, postureY);
        ctx.fillText(label, w - 280, postureY);
        postureY -= 25;
      }

      if (isLeaning && leanDirection !== "neutral" && leanAngle !== undefined) {
        const color = leanDirection === "forward" ? "#ef4444" : "#60a5fa";
        ctx.fillStyle = color;
        const dirText = leanDirection === "forward" ? "FORWARD" : "BACKWARD";
        const label = `LEANING ${dirText} ${Math.abs(leanAngle).toFixed(1)}°`;
        ctx.strokeText(label, w - 280, postureY);
        ctx.fillText(label, w - 280, postureY);
        postureY -= 25;
      }

      if (!isPresent && awayDuration !== undefined) {
        ctx.fillStyle = "red";
        const label = `AWAY (${(awayDuration / 1000).toFixed(1)}s)`;
        ctx.strokeText(label, w - 280, postureY);
        ctx.fillText(label, w - 280, postureY);
      }
    }

    requestAnimationFrame(drawLandmarks);
    }

    drawLandmarks();
  }, [
    landmarks,
    poseLandmarks,
    isReady,
    ear,
    eyesClosedSec,
    headTiltAngle,
    isHeadTilted,
    headPitchAngle,
    headPitchWindowMin,
    headPitchWindowMax,
    instantaneousHeadPitchAngle,
    isHeadNodding,
    isHeadTiltingBack,
    mar,
    isYawning,
    gazeDirection,
    isLookingAway,
    faceWidth,
    isTooClose,
    isTooFar,
    isCalibrating,
    calibrationProgress,
    calibrationBaselines,
    activeAlarms,
    alarmPhrase,
    challengeType,
    requireAlarmAck,
    state,
    videoRef,
    isSlouched,
    slouchDuration,
    isLeaning,
    leanDirection,
    leanAngle,
    isPresent,
    awayDuration,
  ]);

  const stopAlarmAudio = useCallback((): void => {
    if (alarmOscRef.current) {
      alarmOscRef.current.forEach((osc) => {
        try {
          osc.stop();
        } catch (err) {
          console.warn("Failed to stop alarm oscillator", err);
        }
        osc.disconnect();
      });
      alarmOscRef.current = null;
    }
    if (alarmGainRef.current) {
      alarmGainRef.current.disconnect();
      alarmGainRef.current = null;
    }
  }, []);

  const handleDebugAlarm = useCallback(
    async (mode?: "phrase" | "math" | "trivia") => {
      await ensureAudioContext();
      stopAlarmAudio();
      triggerDebugAlarm(mode);
    },
    [ensureAudioContext, stopAlarmAudio, triggerDebugAlarm]
  );

  useEffect(() => {
    if (!requireAlarmAck || activeAlarms.length === 0) {
      stopAlarmAudio();
      return;
    }

    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      audioCtxRef.current = ctx;
    }

    const resumeAudio = async () => {
      if (!ctx) return;
      try {
        if (ctx && ctx.state === "suspended") {
          await ctx.resume();
        }
      } catch (err) {
        console.warn("Unable to resume AudioContext", err);
      }
    };

    void resumeAudio();

    stopAlarmAudio();

    if (!ctx) {
      return;
    }

    const gain = ctx.createGain();
    const baseGain = state === "sleeping" ? 1.0 : 0.8;

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(baseGain, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(baseGain, ctx.currentTime + 2);

    const oscPrimary = ctx.createOscillator();
    oscPrimary.type = "square";
    oscPrimary.frequency.value = state === "sleeping" ? 960 : 720;

    const oscSecondary = ctx.createOscillator();
    oscSecondary.type = "sawtooth";
    oscSecondary.frequency.value = state === "sleeping" ? 1440 : 1080;

    const oscTertiary = ctx.createOscillator();
    oscTertiary.type = "triangle";
    oscTertiary.frequency.value = state === "sleeping" ? 240 : 180;

    [oscPrimary, oscSecondary, oscTertiary].forEach((osc) => {
      const individualGain = ctx.createGain();
      individualGain.gain.value = 1;
      osc.connect(individualGain).connect(gain);
      osc.start();
    });

    gain.connect(ctx.destination);

    alarmOscRef.current = [oscPrimary, oscSecondary, oscTertiary];
    alarmGainRef.current = gain;

    return () => {
      stopAlarmAudio();
    };
  }, [activeAlarms, requireAlarmAck, state, stopAlarmAudio]);

  useEffect(() => {
    return () => {
      stopAlarmAudio();
    };
  }, [stopAlarmAudio, activeAlarms, requireAlarmAck, state]);

  useEffect(() => {
    return () => {
      stopAlarmAudio();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {
          /* ignore close errors */
        });
        audioCtxRef.current = null;
      }
    };
  }, [stopAlarmAudio]);

  // State colors
  const getStateColor = (state: string) => {
    switch (state) {
      case "awake":
        return "text-green-600";
      case "noddingOff":
        return "text-orange-600";
      case "sleeping":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getStateBgColor = (state: string) => {
    switch (state) {
      case "awake":
        return "bg-green-100";
      case "noddingOff":
        return "bg-orange-100";
      case "sleeping":
        return "bg-red-100";
      default:
        return "bg-gray-100";
    }
  };

const formatStateLabel = (currentState: string) => {
  switch (currentState) {
    case "noddingOff":
      return "NODDING OFF";
    case "sleeping":
        return "SLEEPING";
      case "awake":
      default:
        return "AWAKE";
    }
  };

  const formatAlarmTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  useEffect(() => {
    setAlarmInput("");
    setAlarmError(null);
  }, [alarmPhrase, challengePrompt, challengeType]);

  useEffect(() => {
    if (requireAlarmAck && (alarmPhrase || challengeType !== "phrase")) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [requireAlarmAck, alarmPhrase, challengeType]);

  const handleAlarmSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireAlarmAck) {
      setAlarmInput("");
      setAlarmError(null);
      silenceAlarm(alarmInput);
      return;
    }

    const success = silenceAlarm(alarmInput.trim());
    if (success) {
      setAlarmInput("");
      setAlarmError(null);
      stopAlarmAudio();
    } else {
      setAlarmError(
        challengeType === "phrase"
          ? "Either the phrase is incorrect or you're not fully awake yet. Open your eyes and type it exactly."
          : challengeType === "math"
          ? "Incorrect math answer or you're still drowsy. Try again while staying alert."
          : "Trivia answer doesn't match or you're not fully awake. Give it another shot."
      );
    }
  };

  const calibratedEarThreshold = calibrationBaselines
    ? Math.max(calibrationBaselines.ear * 0.75, 0.15)
    : 0.2;

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Attention Detector Demo</h1>
          <p className="text-gray-600 mb-8">
            Webcam-based drowsiness detection using MediaPipe face landmarks
          </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Video + Visualization */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-xl font-semibold mb-4">
                Camera Feed + Face Tracking
              </h2>

              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                {/* Video (mirrored) */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
                {/* Canvas overlay (NOT mirrored - text stays readable) */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                  style={{ pointerEvents: "none" }}
                />
                {!isReady && (
                  <div className="absolute inset-0 flex items-center justify-center text-white">
                    <p>Camera not active</p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                {!isReady ? (
                  <button
                    onClick={handleStart}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Start Camera
                  </button>
                ) : (
                  <button
                    onClick={handleStop}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Stop Camera
                  </button>
                )}
                <button
                  onClick={handlePrimeAudio}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Prime Alarm Audio
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleDebugAlarm(undefined)}
                    className="px-4 py-2 bg-red-200 text-red-800 rounded-lg hover:bg-red-300 transition-colors"
                  >
                    Trigger Alarm Test
                  </button>
                  <button
                    onClick={() => handleDebugAlarm("math")}
                    className="px-3 py-2 bg-red-200 text-red-800 rounded-lg hover:bg-red-300 transition-colors"
                  >
                    Force Math
                  </button>
                  <button
                    onClick={() => handleDebugAlarm("trivia")}
                    className="px-3 py-2 bg-red-200 text-red-800 rounded-lg hover:bg-red-300 transition-colors"
                  >
                    Force Trivia
                  </button>
                </div>

                {/* Voice Warning Test Buttons */}
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-semibold mb-2 text-blue-900">🔊 Test Voice Warnings:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        console.log('[Test] Simple direct speech test');
                        const synth = window.speechSynthesis;
                        console.log('[Test] SpeechSynthesis object:', synth);
                        console.log('[Test] Speaking:', synth.speaking);
                        console.log('[Test] Pending:', synth.pending);
                        console.log('[Test] Paused:', synth.paused);

                        const voices = synth.getVoices();
                        console.log('[Test] Voices available:', voices.length);
                        if (voices.length > 0) {
                          console.log('[Test] First voice:', voices[0]);
                        }

                        const utterance = new SpeechSynthesisUtterance("Hello");
                        utterance.lang = 'en-US';
                        utterance.volume = 1.0;
                        utterance.rate = 1.0;
                        utterance.pitch = 1.0;

                        if (voices.length > 0) {
                          utterance.voice = voices[0];
                          console.log('[Test] Using voice:', voices[0].name);
                        }

                        utterance.onstart = () => console.log('[Test] ✅ Started');
                        utterance.onend = () => console.log('[Test] ✅ Ended');
                        utterance.onerror = (e) => console.error('[Test] ❌ Error:', e.error, e);

                        console.log('[Test] Calling speak()...');
                        synth.speak(utterance);

                        setTimeout(() => {
                          console.log('[Test] After 500ms - Speaking:', synth.speaking, 'Pending:', synth.pending);
                        }, 500);
                      }}
                      className="px-3 py-2 bg-green-200 text-green-800 rounded-lg hover:bg-green-300 transition-colors text-sm"
                    >
                      Simple Test
                    </button>
                    <button
                      onClick={() => {
                        const { speakWarning, primeSpeechSynthesis } = require('@/attention/voiceWarnings');
                        primeSpeechSynthesis();
                        speakWarning("Your eyes are closing. Stay alert.", "medium");
                      }}
                      className="px-3 py-2 bg-blue-200 text-blue-800 rounded-lg hover:bg-blue-300 transition-colors text-sm"
                    >
                      Test Voice (Medium)
                    </button>
                    <button
                      onClick={() => {
                        const { speakWarning, primeSpeechSynthesis } = require('@/attention/voiceWarnings');
                        primeSpeechSynthesis();
                        speakWarning("Please open your eyes.", "high");
                      }}
                      className="px-3 py-2 bg-blue-300 text-blue-900 rounded-lg hover:bg-blue-400 transition-colors text-sm"
                    >
                      Test Voice (High)
                    </button>
                    <button
                      onClick={() => {
                        const { speakWarning, primeSpeechSynthesis } = require('@/attention/voiceWarnings');
                        primeSpeechSynthesis();
                        speakWarning("Please correct your posture.", "low");
                      }}
                      className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                    >
                      Test Voice (Low)
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700">
                  <p className="font-semibold">Error:</p>
                  <p>{error}</p>
                </div>
              )}

              {/* Legend */}
              <div className="mt-4 p-3 bg-gray-50 rounded">
                <p className="text-sm font-semibold mb-2">Visualization:</p>
                <div className="flex flex-wrap gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                    <span>Face mesh (468 points)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "lime" }}></div>
                    <span>Left eye (16 points)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "cyan" }}></div>
                    <span>Right eye (16 points)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span>Red overlay = eyes closed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span>Orange overlay = head tilted</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Algorithm Explanation */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold mb-3">
                🧠 How Drowsiness Detection Works
              </h3>

              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">
                    1. Face Landmark Detection (MediaPipe)
                  </h4>
                  <p className="text-gray-700">
                    Uses <strong>MediaPipe Tasks Vision</strong> to detect 468
                    facial landmarks in real-time at 30 FPS. This runs entirely
                    in your browser using WebAssembly + GPU acceleration.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">
                    2. Eye Aspect Ratio (EAR) Calculation
                  </h4>
                  <p className="text-gray-700 mb-2">
                    For each eye, we extract 6 key landmarks and compute:
                  </p>
                  <div className="bg-gray-100 p-3 rounded font-mono text-xs">
                    EAR = (||p2-p6|| + ||p3-p5||) / (2 × ||p1-p4||)
                  </div>
                  <p className="text-gray-700 mt-2">
                    Where p1-p4 are horizontal corners, and p2,p3,p5,p6 are
                    vertical pairs. This gives us a ratio that&apos;s ~0.25-0.35 when
                    eyes are open, and drops below ~0.22 when eyes close.
                  </p>
                  <div className="mt-2 text-xs text-gray-600">
                    <strong>Left eye indices:</strong> [362, 385, 387, 263,
                    373, 380]
                    <br />
                    <strong>Right eye indices:</strong> [33, 160, 158, 133,
                    153, 144]
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">
                    3. Eye Closure Tracking
                  </h4>
                  <p className="text-gray-700">
                    We count consecutive frames where EAR &lt; 0.20 (threshold).
                    At 30 FPS, we convert frame count to seconds:
                  </p>
                  <div className="bg-gray-100 p-3 rounded font-mono text-xs mt-2">
                    eyesClosedSec = closedFrames / 30
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">
                    4. Drowsiness State Machine
                  </h4>
                  <div className="bg-gray-100 p-3 rounded text-xs mt-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono">if</span>
                      <span className="text-green-700">eyesClosedSec &lt; 3.5s</span>
                      <span className="font-mono">→</span>
                      <span className="font-bold text-green-600">AWAKE</span>
                      <span className="text-gray-500">(confidence: 70%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">if</span>
                      <span className="text-red-700">eyesClosedSec &gt; 3.5s</span>
                      <span className="font-mono">→</span>
                      <span className="font-bold text-red-600">DROWSY</span>
                      <span className="text-gray-500">(confidence: 90%)</span>
                    </div>
                  </div>
                  <p className="text-gray-700 mt-2">
                    Normal blinks last ~0.1-0.4 seconds, so this logic filters out
                    quick blinks while still catching sustained closures.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">
                    5. Snapshot Emission
                  </h4>
                  <p className="text-gray-700">
                    Every 300ms, an <code>AttentionSnapshot</code> is emitted to
                    the fusion layer (check console). This will later be combined
                    with screen activity data from the browser extension.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: Metrics */}
          <div className="space-y-4">
            {(isCalibrating || calibrationBaselines) && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4">Calibration</h2>
                {isCalibrating ? (
                  <>
                    <p className="text-sm text-gray-600 mb-3">
                      Hold a neutral, upright pose so we can capture your baseline posture.
                    </p>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${Math.round(calibrationProgress * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Progress: {Math.round(calibrationProgress * 100)}%
                    </p>
                  </>
                ) : (
                  calibrationBaselines && (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">EAR baseline</p>
                        <p className="font-mono font-semibold">
                          {calibrationBaselines.ear.toFixed(3)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Pitch baseline</p>
                        <p className="font-mono font-semibold">
                          {calibrationBaselines.pitch.toFixed(1)}°
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Tilt baseline</p>
                        <p className="font-mono font-semibold">
                          {calibrationBaselines.tilt.toFixed(1)}°
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Face width baseline</p>
                        <p className="font-mono font-semibold">
                          {calibrationBaselines.faceWidth.toFixed(3)}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Attention State</h2>

              {/* Current state */}
              <div className={`p-4 rounded-lg ${getStateBgColor(state)} mb-6`}>
                <p className="text-sm text-gray-600 mb-1">Current State</p>
                <p className={`text-4xl font-bold ${getStateColor(state)}`}>
                  {formatStateLabel(state)}
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Confidence: {(confidence * 100).toFixed(0)}%
                </p>
              </div>

              {/* Absence Alarm */}
              {absentCountdown !== undefined && absentCountdown > 0 && (
                <div className="p-4 rounded-lg bg-orange-100 border-2 border-orange-500 mb-6 animate-pulse">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-lg font-bold text-orange-900">
                      ⚠️ USER NOT DETECTED
                    </p>
                    <button
                      onClick={disarmAbsenceAlarm}
                      className="px-3 py-1 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-semibold"
                    >
                      DISARM
                    </button>
                  </div>
                  <p className="text-sm text-orange-800">
                    Alarm triggers in: <span className="text-2xl font-mono font-bold">{absentCountdown.toFixed(1)}s</span>
                  </p>
                  <div className="mt-2 h-3 bg-orange-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-600 transition-all"
                      style={{ width: `${((5 - absentCountdown) / 5) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {!isAbsenceAlarmArmed && (
                <div className="p-4 rounded-lg bg-gray-100 border-2 border-gray-400 mb-6">
                  <p className="text-sm font-semibold text-gray-700">
                    🔕 Absence alarm disarmed
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    The system will not trigger alarms when you leave the frame
                  </p>
                </div>
              )}

              {/* Voice Warning */}
              {activeWarning && !requireAlarmAck && (
                <div className="p-6 rounded-xl bg-gradient-to-r from-yellow-100 to-orange-100 border-4 border-orange-500 mb-6 shadow-lg animate-pulse">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <span className="text-5xl">⚠️</span>
                    <p className="text-3xl font-black text-orange-900 uppercase">
                      Warning!
                    </p>
                    <span className="text-5xl">⚠️</span>
                  </div>
                  <p className="text-center text-2xl font-bold text-orange-900 mb-3">
                    {activeWarning}
                  </p>
                  <div className="text-center bg-red-100 border-2 border-red-500 rounded-lg p-3">
                    <p className="text-lg font-bold text-red-700">
                      🚨 Loud alarm in 5 seconds if not corrected 🚨
                    </p>
                  </div>
                </div>
              )}

              {/* Metrics */}
              <div className="space-y-4">
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-3">Live Metrics</h3>

                  {/* EAR */}
                  <div className="mb-3 p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-700 font-medium text-sm">
                        Eye Aspect Ratio (EAR)
                      </span>
                      <span className="text-2xl font-mono font-bold">
                        {ear !== undefined ? ear.toFixed(3) : "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          ear !== undefined && ear < calibratedEarThreshold
                            ? "bg-red-500"
                            : "bg-green-500"
                        }`}
                        style={{
                          width: `${ear !== undefined ? Math.min(ear * 200, 100) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Threshold: {calibratedEarThreshold.toFixed(3)}
                    </p>
                  </div>

                  {/* Eyes closed duration */}
                  <div className="mb-3 p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 font-medium text-sm">
                        Eyes Closed Duration
                      </span>
                      <span className="text-2xl font-mono font-bold">
                        {eyesClosedSec !== undefined
                          ? `${eyesClosedSec.toFixed(2)}s`
                          : "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          eyesClosedSec !== undefined && eyesClosedSec > 3.5
                            ? "bg-red-500"
                            : "bg-yellow-400"
                        }`}
                        style={{
                          width: `${eyesClosedSec !== undefined ? Math.min((eyesClosedSec / 5) * 100, 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Head tilt */}
                  <div className="mb-3 p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-700 font-medium text-sm">
                        Head Tilt Angle
                      </span>
                      <span className="text-2xl font-mono font-bold">
                        {headTiltAngle !== undefined ? `${headTiltAngle.toFixed(1)}°` : "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          isHeadTilted
                            ? "bg-orange-500"
                            : "bg-green-500"
                        }`}
                        style={{
                          width: `${headTiltAngle !== undefined ? Math.min(Math.abs(headTiltAngle) * 3, 100) : 0}%`,
                        }}
                      />
                    </div>
                    {isHeadTilted && (
                      <p className="text-xs text-orange-600 font-semibold mt-1">
                        ⚠️ Head tilted {headTiltAngle && headTiltAngle > 0 ? "right" : "left"}
                      </p>
                    )}
                  </div>

                  {/* Head pitch (nodding) */}
                  <div className="mb-3 p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-700 font-medium text-sm">
                        Head Pitch Angle
                      </span>
                      <span className="text-2xl font-mono font-bold">
                        {headPitchAngle !== undefined ? `${headPitchAngle.toFixed(1)}°` : "—"}
                      </span>
                    </div>
                  <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        isHeadNodding
                          ? "bg-red-500"
                          : isHeadTiltingBack
                            ? "bg-blue-500"
                            : "bg-green-500"
                      }`}
                      style={{
                        width: `${headPitchAngle !== undefined ? Math.min(Math.abs(headPitchAngle) * 5, 100) : 0}%`,
                      }}
                    />
                  </div>
                  {isHeadNodding && (
                    <p className="text-xs text-red-600 font-semibold mt-1">
                      ⚠️ Head nodding forward (nodding off)
                    </p>
                  )}
                  {!isHeadNodding && isHeadTiltingBack && (
                    <p className="text-xs text-blue-600 font-semibold mt-1">
                      ⚠️ Head tilting backward (sleep risk)
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Positive = forward, Negative = backward
                  </p>
                  {instantaneousHeadPitchAngle !== undefined && (
                    <p className="text-xs text-gray-500">
                      Instant: {instantaneousHeadPitchAngle.toFixed(1)}°
                    </p>
                  )}
                  {calibrationBaselines?.pitch !== undefined && (
                    <p className="text-xs text-gray-500">
                      Baseline: {calibrationBaselines.pitch.toFixed(1)}°
                    </p>
                  )}
                  {headPitchWindowMax !== undefined && (
                    <p className="text-xs text-gray-500">
                      Forward peak: {headPitchWindowMax.toFixed(1)}°
                    </p>
                  )}
                  {headPitchWindowMin !== undefined && (
                    <p className="text-xs text-gray-500">
                      Backward peak: {headPitchWindowMin.toFixed(1)}°
                    </p>
                  )}
                </div>

                  {/* Yawning detection */}
                  <div className="mb-3 p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-700 font-medium text-sm">
                        Mouth Aspect Ratio (MAR)
                      </span>
                      <span className="text-2xl font-mono font-bold">
                        {mar !== undefined ? mar.toFixed(3) : "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          isYawning
                            ? "bg-purple-500"
                            : "bg-green-500"
                        }`}
                        style={{
                          width: `${mar !== undefined ? Math.min(mar * 150, 100) : 0}%`,
                        }}
                      />
                    </div>
                    {isYawning && (
                      <p className="text-xs text-purple-600 font-semibold mt-1">
                        😴 Yawning detected
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Yawns in last minute: {yawnCount || 0}
                      {yawnCount !== undefined && yawnCount >= 2 && (
                        <span className="text-orange-600 font-semibold ml-2">⚠️ Frequent yawning (nodding-off risk)</span>
                      )}
                    </p>
                  </div>

                  {/* Body posture section */}
                  <div className="mb-3 p-3 bg-gray-50 rounded border-2 border-purple-200">
                    <h3 className="text-sm font-bold text-purple-900 mb-2">
                      🧍 Body Posture
                    </h3>

                    {/* Body presence */}
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-700 font-medium text-xs">
                          Body Presence
                        </span>
                        <span className="text-lg font-mono font-bold">
                          {bodyPresence !== undefined ? `${(bodyPresence * 100).toFixed(0)}%` : "—"}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isPresent ? "bg-green-500" : "bg-red-500"
                          }`}
                          style={{
                            width: `${bodyPresence !== undefined ? bodyPresence * 100 : 0}%`,
                          }}
                        />
                      </div>
                      {!isPresent && (
                        <p className="text-xs text-red-600 font-semibold mt-1">
                          ⚠️ User not at desk ({awayDuration ? (awayDuration / 1000).toFixed(0) : 0}s)
                        </p>
                      )}
                    </div>

                    {/* Slouching */}
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-700 font-medium text-xs">
                          Posture
                        </span>
                        <span className={`text-sm font-bold ${isSlouched ? "text-orange-600" : "text-green-600"}`}>
                          {isSlouchingNow ? "SLOUCHING" : "GOOD"}
                        </span>
                      </div>
                      {isSlouched && (
                        <p className="text-xs text-orange-600 font-semibold">
                          ⚠️ Slouched for {slouchDuration ? (slouchDuration / 1000).toFixed(0) : 0}s
                        </p>
                      )}
                    </div>

                    {/* Lean angle */}
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-700 font-medium text-xs">
                          Lean Angle
                        </span>
                        <span className="text-lg font-mono font-bold">
                          {leanAngle !== undefined ? `${leanAngle.toFixed(1)}°` : "—"}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isLeaning
                              ? leanDirection === "forward"
                                ? "bg-blue-500"
                                : "bg-orange-500"
                              : "bg-green-500"
                          }`}
                          style={{
                            width: `${leanAngle !== undefined ? Math.min(Math.abs(leanAngle) * 5, 100) : 0}%`,
                          }}
                        />
                      </div>
                      {isLeaning && (
                        <p className="text-xs text-orange-600 font-semibold mt-1">
                          ⚠️ Leaning {leanDirection} ({leanDuration ? (leanDuration / 1000).toFixed(0) : 0}s)
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Positive = forward, Negative = backward
                      </p>
                    </div>
                  </div>

                  {/* Gaze direction */}
                  <div className="mb-3 p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-700 font-medium text-sm">
                        Gaze Direction
                      </span>
                      <span className="text-2xl font-mono font-bold">
                        {gazeDirection !== undefined ? gazeDirection.toFixed(2) : "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden relative">
                      {/* Center marker */}
                      <div className="absolute inset-0 flex justify-center">
                        <div className="w-0.5 h-full bg-gray-400"></div>
                      </div>
                      {/* Gaze indicator */}
                      <div
                        className={`absolute h-full w-2 transition-all ${
                          isLookingAway
                            ? "bg-yellow-500"
                            : "bg-blue-500"
                        }`}
                        style={{
                          left: `${gazeDirection !== undefined ? (gazeDirection + 1) * 50 : 50}%`,
                          transform: "translateX(-50%)",
                        }}
                      />
                    </div>
                    {isLookingAway && (
                      <p className="text-xs text-yellow-600 font-semibold mt-1">
                        👀 Looking away ({lookAwayDuration !== undefined ? lookAwayDuration.toFixed(1) : "0"}s)
                      </p>
                    )}
                    {lookAwayDuration !== undefined && lookAwayDuration > 5 && (
                      <p className="text-xs text-orange-600 font-semibold mt-1">
                        ⚠️ Prolonged inattention (nodding-off risk)
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      -1.0 = left, 0.0 = center, +1.0 = right
                    </p>
                  </div>

                  {/* Face distance */}
                  <div className="mb-3 p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-700 font-medium text-sm">
                        Face Distance
                      </span>
                      <span className="text-2xl font-mono font-bold">
                        {faceWidth !== undefined ? faceWidth.toFixed(3) : "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden relative">
                      {/* Normal range markers */}
                      <div className="absolute h-full" style={{ left: "15%", width: "20%", backgroundColor: "rgba(34, 197, 94, 0.2)" }}></div>
                      {/* Distance indicator */}
                      <div
                        className={`absolute h-full w-2 transition-all ${
                          isTooClose || isTooFar
                            ? "bg-orange-500"
                            : "bg-green-500"
                        }`}
                        style={{
                          left: `${faceWidth !== undefined ? Math.min(faceWidth * 200, 100) : 0}%`,
                        }}
                      />
                    </div>
                    {isTooClose && (
                      <p className="text-xs text-orange-600 font-semibold mt-1">
                        📏 Too close to camera ({distanceWarningDuration !== undefined ? distanceWarningDuration.toFixed(1) : "0"}s)
                      </p>
                    )}
                    {isTooFar && (
                      <p className="text-xs text-orange-600 font-semibold mt-1">
                        📏 Too far from camera ({distanceWarningDuration !== undefined ? distanceWarningDuration.toFixed(1) : "0"}s)
                      </p>
                    )}
                    {distanceWarningDuration !== undefined && distanceWarningDuration > 5 && (
                      <p className="text-xs text-orange-600 font-semibold mt-1">
                        ⚠️ Prolonged poor posture (nodding-off risk)
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Normal range: 0.15-0.35 (green zone)
                    </p>
                  </div>

                  {/* Face detected */}
                  <div className="mb-3 p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 font-medium text-sm">
                        Face Detected
                      </span>
                      <span className="text-lg font-bold">
                        {landmarks ? (
                          <span className="text-green-600">✓ YES</span>
                        ) : (
                          <span className="text-red-600">✗ NO</span>
                        )}
                      </span>
                    </div>
                    {landmarks && (
                      <p className="text-xs text-gray-500 mt-1">
                        Tracking {landmarks.allPoints.length} landmarks
                      </p>
                    )}
                  </div>

                  {/* Threshold reference */}
                  <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm font-semibold text-blue-900 mb-1">
                      Detection Thresholds
                    </p>
                    <p className="text-xs text-blue-700">
                      EAR &lt; <strong>0.20</strong> = eye closure detected
                    </p>
                    <p className="text-xs text-blue-700">
                      Eyes closed &gt; <strong>3.5s</strong> = nodding-off evidence
                    </p>
                    <p className="text-xs text-blue-700">
                      Eyes closed &gt; <strong>5s</strong> = sleeping evidence
                    </p>
                    <p className="text-xs text-blue-700">
                      Head tilt &gt; <strong>±30°</strong> = posture risk
                    </p>
                    <p className="text-xs text-blue-700">
                      Head pitch &gt; <strong>+18°</strong> = nodding-off risk
                    </p>
                    <p className="text-xs text-blue-700">
                      Head pitch &lt; <strong>-12°</strong> = lean-back risk
                    </p>
                    <p className="text-xs text-blue-700">
                      Yawns &gt; <strong>2/min</strong> = fatigue signal
                    </p>
                    <p className="text-xs text-blue-700">
                      Look away &gt; <strong>5s</strong> = inattention signal
                    </p>
                    <p className="text-xs text-blue-700">
                      Abnormal distance &gt; <strong>5s</strong> = posture signal
                    </p>
                    <p className="text-xs text-blue-700">
                      Detection rate: <strong>30 FPS</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-3">Alarm Stack</h2>
              {activeAlarms.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No alarms are active. Keep monitoring posture and focus.
                </p>
              ) : (
                <ul className="space-y-3">
                  {activeAlarms.map((alarm) => (
                    <li
                      key={`${alarm.id}-${alarm.triggeredAt}`}
                      className="border border-gray-200 rounded p-3 bg-gray-50"
                    >
                      <p
                        className={`text-sm font-semibold ${
                          alarm.level === "critical"
                            ? "text-red-600"
                            : "text-orange-600"
                        }`}
                      >
                        {alarm.level === "critical" ? "Critical" : "Warning"} Alarm
                      </p>
                      <p className="text-sm text-gray-800">{alarm.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Triggered at {formatAlarmTime(alarm.triggeredAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {requireAlarmAck && alarmPhrase && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                  <p className="text-sm text-red-700 font-semibold">
                    Alarm challenge active. Complete the popup typing task to silence the alarm.
                  </p>
                </div>
              )}
            </div>

            {/* Status indicator */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isReady && isActive ? "bg-green-500 animate-pulse" : "bg-gray-400"
                  }`}
                />
                <span className="text-sm text-gray-600">
                  {isReady && isActive
                    ? "Detector Active"
                    : "Detector Inactive"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
      {requireAlarmAck && (alarmPhrase || challengeType !== "phrase") && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 px-4 py-8">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-red-600 p-6 space-y-4">
            <h3 className="text-2xl font-bold text-red-700">ALARM OVERRIDE REQUIRED</h3>
            {challengeType === "math" && challengePrompt ? (
              <>
                <p className="text-sm text-gray-700">
                  Solve the math challenge below to prove you&apos;re awake. Alarm stops only when the
                  answer is exact and you are visibly alert.
                </p>
                <div className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Math Challenge
                  </p>
                  <p className="font-mono text-lg text-gray-900">
                    {challengePrompt}
                  </p>
                </div>
              </>
            ) : challengeType === "trivia" && challengePrompt ? (
              <>
                <p className="text-sm text-gray-700">
                  Answer the trivia question below to prove you&apos;re awake. Use exact spelling and
                  punctuation. Alarm stops only when the answer matches and you are visibly alert.
                </p>
                <div className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Trivia Challenge
                  </p>
                  <p className="font-mono text-lg text-gray-900">
                    {challengePrompt}
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700">
                  You must stay awake and type the exact phrase below. Alarm will only stop once the
                  phrase matches perfectly while you are visibly awake.
                </p>
                <div className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Challenge Phrase
                  </p>
                  <p className="font-mono text-lg text-gray-900 break-words select-all">
                    {alarmPhrase}
                  </p>
                </div>
              </>
            )}
            <form onSubmit={handleAlarmSubmit} className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                {challengeType === "math"
                  ? "Enter the numeric answer"
                  : challengeType === "trivia"
                  ? "Type the trivia answer exactly (case and punctuation matter unless stated)"
                  : "Type the phrase exactly (case, dashes, and numbers)"}
                <input
                  type="text"
                  value={alarmInput}
                  onChange={(event) => {
                    setAlarmInput(event.target.value);
                    setAlarmError(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base font-mono focus:outline-none focus:ring-4 focus:ring-red-300"
                  placeholder={
                    challengeType === "math"
                      ? "123"
                      : challengeType === "trivia"
                      ? "YOUR ANSWER"
                      : "FOCUS-SPARK-ENERGY-123"
                  }
                  autoComplete="off"
                  autoFocus
                  onPaste={(event) => event.preventDefault()}
                  onCopy={(event) => event.preventDefault()}
                  onCut={(event) => event.preventDefault()}
                  onContextMenu={(event) => event.preventDefault()}
                />
              </label>
              {alarmError && (
                <p className="text-sm text-red-600 font-medium">{alarmError}</p>
              )}
              <button
                type="submit"
                className="w-full justify-center inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white font-semibold text-base hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-300 disabled:bg-gray-400"
                disabled={alarmInput.trim().length === 0}
              >
                Stop Alarm
              </button>
            </form>
            <p className="text-xs text-gray-500">
              Tip: Keep your eyes open and maintain posture—the alarm will not silence while you appear drowsy.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
