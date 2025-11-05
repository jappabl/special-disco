"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { startFaceTracking, type FaceLandmarks } from "./faceLandmarks";
import { computeAverageEAR } from "./ear";
import { computeHeadTilt, isHeadTilted } from "./headTilt";
import { computeHeadPitch, HeadNodDetector } from "./headPitch";
import { computeMAR, YawnDetector, isDrowsyYawnRate } from "./yawning";
import { computeHorizontalGaze, GazeTracker } from "./gazeDirection";
import { computeFaceWidth, FaceDistanceTracker } from "./faceDistance";
import { pushAttention } from "@/fusion/bridge";
import type { AttentionState, AttentionSnapshot } from "@/types/attention";

// Tunable thresholds (user baseline calibration will adjust some of these)
const BASE_EAR_THRESHOLD = 0.20; // Fallback EAR threshold if calibration fails
const EYES_CLOSED_NOD_SEC = 3.5; // Seconds of closed eyes indicating nodding risk
const EYES_CLOSED_SLEEP_SEC = 5; // Seconds of closed eyes indicating likely sleep
const HEAD_TILT_THRESHOLD = 30; // Degrees of head tilt before flagging posture risk
const HEAD_PITCH_THRESHOLD = 10; // Forward pitch that indicates nodding risk
const HEAD_PITCH_BACK_THRESHOLD = 12; // Backward pitch that indicates lean back risk
const FPS = 30; // Detection frame rate (increased for smoother detection)
const CALIBRATION_DURATION_MS = 4000; // Collect ~4 seconds of neutral pose
const MIN_CALIBRATION_FRAMES = 90; // Require at least ~3 seconds of data

type CalibrationBaselines = {
  pitch: number;
  ear: number;
  tilt: number;
  faceWidth: number;
};

type CalibrationAccumulator = {
  collecting: boolean;
  startTimestamp: number | null;
  pitchSamples: number[];
  earSamples: number[];
  tiltSamples: number[];
  faceWidthSamples: number[];
};

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

type AlarmDefinition = {
  id: string;
  message: string;
  level: "warning" | "critical";
};

export type AttentionAlarm = {
  id: string;
  message: string;
  level: "warning" | "critical";
  triggeredAt: number;
};

type ChallengeType = "phrase" | "math" | "trivia";

const BASE_NODDING_MESSAGES = [
  "Time to stretch your neck",
  "Give your eyes a quick reset",
  "Take a deep breath and refocus",
  "Roll your shoulders back",
  "Straighten posture and re-engage",
  "Blink hard three times",
  "Sip some water now",
  "Shift your gaze to the horizon",
  "Stand up for a brief walk",
  "Adjust your seat position",
];

const BASE_SLEEPING_MESSAGES = [
  "Wake up immediately",
  "Stand up and move now",
  "Splash water on your face",
  "Take a 10-minute break",
  "Call a friend for a reset",
  "Do a quick physical check-in",
  "Walk around the room",
  "Step outside for fresh air",
  "Play energizing music",
  "Review your task list aloud",
];

const createAlarmLibrary = (): {
  nodding: AlarmDefinition[];
  sleeping: AlarmDefinition[];
} => {
  const nodding: AlarmDefinition[] = [];
  const sleeping: AlarmDefinition[] = [];

  for (let i = 0; i < 40; i++) {
    const baseMsg =
      BASE_NODDING_MESSAGES[i % BASE_NODDING_MESSAGES.length];
    nodding.push({
      id: `nodding-${i + 1}`,
      message: `Nodding Alarm ${String(i + 1).padStart(
        2,
        "0"
      )}: ${baseMsg} (${i + 1})`,
      level: "warning",
    });
  }

  for (let i = 0; i < 40; i++) {
    const baseMsg =
      BASE_SLEEPING_MESSAGES[i % BASE_SLEEPING_MESSAGES.length];
    sleeping.push({
      id: `sleeping-${i + 1}`,
      message: `Sleep Alarm ${String(i + 1).padStart(
        2,
        "0"
      )}: ${baseMsg} (${i + 1})`,
      level: "critical",
    });
  }

  return { nodding, sleeping };
};

const ALARM_LIBRARY = createAlarmLibrary();

const WORD_BANK = [
  "focus",
  "alert",
  "energy",
  "hydrate",
  "stretch",
  "breathe",
  "wake",
  "active",
  "bright",
  "sharp",
  "drive",
  "spark",
  "tempo",
  "pivot",
  "laser",
  "glow",
  "bounce",
  "charge",
  "ignite",
  "thrive",
  "reset",
  "revive",
  "steady",
  "focus",
  "clarity",
  "swift",
  "fresh",
  "prime",
  "vivid",
  "rise",
  "steady",
  "awake",
  "mirror",
  "stride",
  "sparkle",
  "pulse",
  "anchor",
  "ignite",
  "momentum",
];

function generateAlarmPhrase(): string {
  const words: string[] = [];
  const usedIndices = new Set<number>();
  while (words.length < 4) {
    const idx = Math.floor(Math.random() * WORD_BANK.length);
    if (usedIndices.has(idx)) continue;
    usedIndices.add(idx);
    words.push(WORD_BANK[idx].toUpperCase());
  }
  const digits = Math.floor(100 + Math.random() * 900).toString();
  return `${words.join("-")}-${digits}`;
}

function generateMathChallenge(): { prompt: string; answer: string } {
  const a = Math.floor(10 + Math.random() * 90);
  const b = Math.floor(10 + Math.random() * 90);
  const c = Math.floor(1 + Math.random() * 9);
  const result = a + b - c;
  return {
    prompt: `Solve: ${a} + ${b} - ${c} = ?`,
    answer: String(result),
  };
}

const TRIVIA_BANK: Array<{ prompt: string; answer: string }> = [
  { prompt: "Spell the day that follows Tuesday.", answer: "WEDNESDAY" },
  { prompt: "Type the word 'SUNRISE' backwards.", answer: "ESIRNUS" },
  { prompt: "What planet is known as the Red Planet?", answer: "MARS" },
  { prompt: "What is the capital city of France?", answer: "PARIS" },
  { prompt: "Spell the chemical symbol for water.", answer: "H2O" },
  { prompt: "Type the first three letters of the alphabet in reverse order.", answer: "CBA" },
  { prompt: "What animal says 'moo'?", answer: "COW" },
  { prompt: "Spell the word 'energy' in lowercase letters.", answer: "energy" },
];

function generateTriviaChallenge(): { prompt: string; answer: string } {
  const idx = Math.floor(Math.random() * TRIVIA_BANK.length);
  return TRIVIA_BANK[idx];
}

function createChallenge(preferred?: ChallengeType): {
  type: ChallengeType;
  phrase: string | null;
  prompt: string | null;
  answer: string | null;
} {
  const types: ChallengeType[] = ["phrase", "math", "trivia"];
  const chosen =
    preferred ?? types[Math.floor(Math.random() * types.length)];

  if (chosen === "math") {
    const math = generateMathChallenge();
    return { type: "math", phrase: null, prompt: math.prompt, answer: math.answer };
  }

  if (chosen === "trivia") {
    const trivia = generateTriviaChallenge();
    return { type: "trivia", phrase: null, prompt: trivia.prompt, answer: trivia.answer };
  }

  return { type: "phrase", phrase: generateAlarmPhrase(), prompt: null, answer: null };
}

export type UseAttentionDetectorResult = {
  state: AttentionState;
  confidence: number;
  ear?: number;
  eyesClosedSec?: number;
  headTiltAngle?: number;
  isHeadTilted?: boolean;
  headPitchAngle?: number;
  headPitchWindowMin?: number;
  headPitchWindowMax?: number;
  isHeadNodding?: boolean;
  isHeadTiltingBack?: boolean;
  instantaneousHeadPitchAngle?: number;
  mar?: number;
  isYawning?: boolean;
  yawnCount?: number;
  gazeDirection?: number;
  isLookingAway?: boolean;
  lookAwayDuration?: number;
  faceWidth?: number;
  isTooClose?: boolean;
  isTooFar?: boolean;
  distanceWarningDuration?: number;
  activeAlarms: AttentionAlarm[];
  alarmPhrase?: string | null;
  challengePrompt?: string | null;
  challengeType: ChallengeType;
  requireAlarmAck: boolean;
  silenceAlarm: (input: string) => boolean;
  triggerDebugAlarm: (mode?: ChallengeType) => void;
  landmarks?: FaceLandmarks | null;
  isCalibrating: boolean;
  calibrationProgress: number;
  calibrationBaselines?: CalibrationBaselines | null;
};

export function useAttentionDetector(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  isActive: boolean
): UseAttentionDetectorResult {
  const [state, setState] = useState<AttentionState>("awake");
  const [confidence, setConfidence] = useState<number>(0);
  const [ear, setEar] = useState<number | undefined>(undefined);
  const [eyesClosedSec, setEyesClosedSec] = useState<number | undefined>(
    undefined
  );
  const [headTiltAngle, setHeadTiltAngle] = useState<number | undefined>(undefined);
  const [headTilted, setHeadTilted] = useState<boolean>(false);
  const [headPitchAngle, setHeadPitchAngle] = useState<number | undefined>(undefined);
  const [headPitchWindowMin, setHeadPitchWindowMin] = useState<number | undefined>(undefined);
  const [headPitchWindowMax, setHeadPitchWindowMax] = useState<number | undefined>(undefined);
  const [instantaneousHeadPitchAngle, setInstantaneousHeadPitchAngle] = useState<number | undefined>(undefined);
  const [headNodding, setHeadNodding] = useState<boolean>(false);
  const [headTiltingBack, setHeadTiltingBack] = useState<boolean>(false);
  const [mar, setMar] = useState<number | undefined>(undefined);
  const [yawning, setYawning] = useState<boolean>(false);
  const [yawnCount, setYawnCount] = useState<number>(0);
  const [gazeDirection, setGazeDirection] = useState<number | undefined>(undefined);
  const [lookingAway, setLookingAway] = useState<boolean>(false);
  const [lookAwayDuration, setLookAwayDuration] = useState<number>(0);
  const [faceWidth, setFaceWidth] = useState<number | undefined>(undefined);
  const [tooClose, setTooClose] = useState<boolean>(false);
  const [tooFar, setTooFar] = useState<boolean>(false);
  const [distanceWarningDuration, setDistanceWarningDuration] = useState<number>(0);
  const [landmarks, setLandmarks] = useState<FaceLandmarks | null>(null);
  const [baselines, setBaselines] = useState<CalibrationBaselines | null>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationProgress, setCalibrationProgress] = useState<number>(0);
  const [activeAlarms, setActiveAlarms] = useState<AttentionAlarm[]>([]);
  const [alarmPhrase, setAlarmPhrase] = useState<string | null>(null);
  const [requireAlarmAck, setRequireAlarmAck] = useState<boolean>(false);
  const [challengePrompt, setChallengePrompt] = useState<string | null>(null);
  const [challengeType, setChallengeType] = useState<ChallengeType>("phrase");

  const activeAlarmsRef = useRef<AttentionAlarm[]>([]);
  const requireAckRef = useRef<boolean>(false);
  const alarmPhraseRef = useRef<string | null>(null);
  const challengeTypeRef = useRef<ChallengeType>("phrase");
  const challengeAnswerRef = useRef<string | null>(null);
  const latestStateRef = useRef<AttentionState>("awake");
  const lastAlarmStateRef = useRef<AttentionState>("awake");
  const missingFaceFramesRef = useRef<number>(0);

  const updateActiveAlarms = useCallback((alarms: AttentionAlarm[]) => {
    activeAlarmsRef.current = alarms;
    setActiveAlarms(alarms);
  }, []);

  const updateRequireAck = useCallback((value: boolean) => {
    requireAckRef.current = value;
    setRequireAlarmAck(value);
  }, []);

  const updateAlarmPhrase = useCallback((phrase: string | null) => {
    alarmPhraseRef.current = phrase;
    setAlarmPhrase(phrase);
  }, []);

const updateChallenge = useCallback(
  (type: ChallengeType, prompt: string | null, answer: string | null) => {
    challengeTypeRef.current = type;
    challengeAnswerRef.current = answer;
    setChallengeType(type);
    setChallengePrompt(prompt);
  },
  []
);

  const assignNewChallenge = useCallback(
    (preferred?: ChallengeType): ChallengeType => {
      const challenge = createChallenge(preferred);
      if (challenge.type === "phrase" && challenge.phrase) {
        updateAlarmPhrase(challenge.phrase);
        updateChallenge("phrase", null, null);
      } else {
        updateAlarmPhrase(null);
        updateChallenge(challenge.type, challenge.prompt, challenge.answer);
      }
      return challenge.type;
    },
    [updateAlarmPhrase, updateChallenge]
  );

  const resetAlarmState = useCallback(() => {
    updateActiveAlarms([]);
    updateAlarmPhrase(null);
    updateRequireAck(false);
    lastAlarmStateRef.current = "awake";
    updateChallenge("phrase", null, null);
  }, [updateActiveAlarms, updateAlarmPhrase, updateRequireAck, updateChallenge]);

  // Track consecutive closed frames
  const closedFramesRef = useRef<number>(0);
  const lastEmitTimeRef = useRef<number>(0);
  const headNodDetectorRef = useRef<HeadNodDetector>(new HeadNodDetector());
  const yawnDetectorRef = useRef<YawnDetector>(new YawnDetector());
  const gazeTrackerRef = useRef<GazeTracker>(new GazeTracker());
  const faceDistanceTrackerRef = useRef<FaceDistanceTracker>(new FaceDistanceTracker());
  const calibrationRef = useRef<CalibrationAccumulator>({
    collecting: false,
    startTimestamp: null,
    pitchSamples: [],
    earSamples: [],
    tiltSamples: [],
    faceWidthSamples: [],
  });
  const calibrationProgressRef = useRef<number>(0);
  const alarmCursorRef = useRef<{ nodding: number; sleeping: number }>({
    nodding: 0,
    sleeping: 0,
  });

  const getAlarmBatch = useCallback(
    (
      type: "nodding" | "sleeping",
      count: number,
      timestamp: number
    ): AttentionAlarm[] => {
      const source =
        type === "nodding" ? ALARM_LIBRARY.nodding : ALARM_LIBRARY.sleeping;
      const cursor = alarmCursorRef.current[type];
      const batch: AttentionAlarm[] = [];

      for (let i = 0; i < count; i++) {
        const idx = (cursor + i) % source.length;
        const def = source[idx];
        batch.push({
          id: def.id,
          message: def.message,
          level: def.level,
          triggeredAt: timestamp,
        });
      }

      alarmCursorRef.current[type] = (cursor + count) % source.length;
      return batch;
    },
    []
  );

  const silenceAlarm = useCallback(
    (input: string): boolean => {
      if (!requireAckRef.current) {
        resetAlarmState();
        return true;
      }

      if (latestStateRef.current !== "awake") {
        return false;
      }

      if (challengeTypeRef.current === "phrase") {
        if (!alarmPhraseRef.current || input !== alarmPhraseRef.current) {
          return false;
        }
      } else if (challengeTypeRef.current === "math") {
        if (!challengeAnswerRef.current || input.trim() !== challengeAnswerRef.current) {
          return false;
        }
      } else {
        if (
          !challengeAnswerRef.current ||
          input.trim().toUpperCase() !== challengeAnswerRef.current.toUpperCase()
        ) {
          return false;
        }
      }

      resetAlarmState();
      return true;
    },
    [resetAlarmState]
  );

  const triggerDebugAlarm = useCallback(
    (preferred?: ChallengeType) => {
      resetAlarmState();

      const chosenType = assignNewChallenge(preferred);
      const now = Date.now();
      const treatAsSleeping = chosenType !== "phrase";

      const alarms = getAlarmBatch(
        treatAsSleeping ? "sleeping" : "nodding",
        treatAsSleeping ? 5 : 4,
        now
      );

      updateActiveAlarms(alarms);
      updateRequireAck(true);

      const forcedState: AttentionState = treatAsSleeping ? "sleeping" : "noddingOff";
      latestStateRef.current = forcedState;
      lastAlarmStateRef.current = forcedState;
      setState(forcedState);
      setConfidence(treatAsSleeping ? 0.99 : 0.95);
    },
    [
      assignNewChallenge,
      resetAlarmState,
      getAlarmBatch,
      updateActiveAlarms,
      updateRequireAck,
    ]
  );

  useEffect(() => {
    if (isActive) {
      calibrationRef.current = {
        collecting: true,
        startTimestamp: null,
        pitchSamples: [],
        earSamples: [],
        tiltSamples: [],
        faceWidthSamples: [],
      };
      calibrationProgressRef.current = 0;
      setCalibrationProgress(0);
      setIsCalibrating(true);
      setBaselines(null);
      closedFramesRef.current = 0;
      lastEmitTimeRef.current = 0;
      resetAlarmState();

      headNodDetectorRef.current = new HeadNodDetector();
      yawnDetectorRef.current = new YawnDetector();
      gazeTrackerRef.current = new GazeTracker();
      faceDistanceTrackerRef.current = new FaceDistanceTracker();
    } else {
      calibrationRef.current.collecting = false;
      calibrationRef.current.startTimestamp = null;
      calibrationRef.current.pitchSamples = [];
      calibrationRef.current.earSamples = [];
      calibrationRef.current.tiltSamples = [];
      calibrationRef.current.faceWidthSamples = [];
      calibrationProgressRef.current = 0;
      setIsCalibrating(false);
      setCalibrationProgress(0);
      setBaselines(null);
      closedFramesRef.current = 0;
      resetAlarmState();
    }
  }, [isActive, resetAlarmState]);

  useEffect(() => {
    if (!isActive || !videoRef.current) {
      // Reset state when inactive
      setState("awake");
      setConfidence(0);
      setEar(undefined);
      setEyesClosedSec(undefined);
      closedFramesRef.current = 0;
      resetAlarmState();
      return;
    }

    const video = videoRef.current;

    const handleLandmarks = (detectedLandmarks: FaceLandmarks | null) => {
      const now = Date.now();

      // Store landmarks for visualization
      setLandmarks(detectedLandmarks);

      if (!detectedLandmarks) {
        missingFaceFramesRef.current += 1;
        const missingSec = missingFaceFramesRef.current / FPS;
        setEyesClosedSec(missingSec);

        if (calibrationRef.current.collecting) {
          calibrationRef.current.startTimestamp = null;
          calibrationRef.current.pitchSamples = [];
          calibrationRef.current.earSamples = [];
          calibrationRef.current.tiltSamples = [];
          calibrationRef.current.faceWidthSamples = [];
          calibrationProgressRef.current = 0;
          setCalibrationProgress(0);
          setState("awake");
          setConfidence(0.2);
          if (!requireAckRef.current) {
            resetAlarmState();
          }
          return;
        }

        const shouldSleep = missingSec >= EYES_CLOSED_SLEEP_SEC;
        const shouldNod = !shouldSleep && missingSec >= EYES_CLOSED_NOD_SEC;

        if (shouldSleep) {
          latestStateRef.current = "sleeping";
          if (!requireAckRef.current || lastAlarmStateRef.current !== "sleeping") {
            updateActiveAlarms(getAlarmBatch("sleeping", 5, now));
            if (!requireAckRef.current) {
              assignNewChallenge(Math.random() < 0.5 ? "math" : "trivia");
            } else {
              assignNewChallenge("math");
            }
            updateRequireAck(true);
            lastAlarmStateRef.current = "sleeping";
          } else if (requireAckRef.current && activeAlarmsRef.current.length === 0) {
            updateActiveAlarms(getAlarmBatch("sleeping", 5, now));
          }
          setState("sleeping");
          setConfidence(0.98);
        } else if (shouldNod) {
          latestStateRef.current = "noddingOff";
          if (!requireAckRef.current || lastAlarmStateRef.current !== "noddingOff") {
            updateActiveAlarms(getAlarmBatch("nodding", 4, now));
            if (!requireAckRef.current) {
              assignNewChallenge();
            }
            updateRequireAck(true);
            lastAlarmStateRef.current = "noddingOff";
          } else if (requireAckRef.current && activeAlarmsRef.current.length === 0) {
            updateActiveAlarms(getAlarmBatch("nodding", 4, now));
          }
          setState("noddingOff");
          setConfidence(0.94);
        } else {
          latestStateRef.current = "awake";
          setState("awake");
          setConfidence(0.25);
          if (!requireAckRef.current) {
            resetAlarmState();
          }
        }

        return;
      }

      missingFaceFramesRef.current = 0;

      // Pre-compute core metrics (raw values before baseline adjustment)
      const currentEar = computeAverageEAR(
        detectedLandmarks.leftEyeEAR,
        detectedLandmarks.rightEyeEAR
      );
      setEar(currentEar);

      const tiltAngleRaw = computeHeadTilt(
        detectedLandmarks.leftEye,
        detectedLandmarks.rightEye
      );

      const pitchAngleRaw = computeHeadPitch(detectedLandmarks.allPoints);
      const currentFaceWidth = computeFaceWidth(detectedLandmarks.allPoints);
      const currentMAR = computeMAR(detectedLandmarks.allPoints);
      const horizontalGaze = computeHorizontalGaze(detectedLandmarks.allPoints);

      if (calibrationRef.current.collecting) {
        if (calibrationRef.current.startTimestamp === null) {
          calibrationRef.current.startTimestamp = now;
        }

        calibrationRef.current.pitchSamples.push(pitchAngleRaw);
        calibrationRef.current.earSamples.push(currentEar);
        calibrationRef.current.tiltSamples.push(tiltAngleRaw);
        calibrationRef.current.faceWidthSamples.push(currentFaceWidth);

        const elapsed =
          now - (calibrationRef.current.startTimestamp ?? now);
        const progress = Math.min(1, elapsed / CALIBRATION_DURATION_MS);

        if (
          progress - calibrationProgressRef.current >= 0.05 ||
          progress === 1
        ) {
          calibrationProgressRef.current = progress;
          setCalibrationProgress(progress);
        }

        const enoughSamples =
          calibrationRef.current.pitchSamples.length >= MIN_CALIBRATION_FRAMES;

        if (elapsed >= CALIBRATION_DURATION_MS && enoughSamples) {
          const newBaselines: CalibrationBaselines = {
            pitch: median(calibrationRef.current.pitchSamples),
            ear: average(calibrationRef.current.earSamples),
            tilt: average(calibrationRef.current.tiltSamples),
            faceWidth: average(calibrationRef.current.faceWidthSamples),
          };
          setBaselines(newBaselines);
          calibrationRef.current.collecting = false;
          setIsCalibrating(false);
          calibrationProgressRef.current = 1;
          setCalibrationProgress(1);
        } else {
          // Still calibrating – surface neutral state
          setState("awake");
          setConfidence(0.15);
          setHeadTiltAngle(undefined);
          setHeadTilted(false);
          setHeadPitchAngle(undefined);
          setInstantaneousHeadPitchAngle(undefined);
          setHeadPitchWindowMax(undefined);
          setHeadPitchWindowMin(undefined);
          setHeadNodding(false);
          setHeadTiltingBack(false);
          if (!requireAckRef.current) {
            updateActiveAlarms([]);
          }
          return;
        }
      }

      const activeBaselines =
        baselines ??
        (!calibrationRef.current.collecting
          ? {
              pitch: pitchAngleRaw,
              ear: currentEar,
              tilt: tiltAngleRaw,
              faceWidth: currentFaceWidth,
            }
          : null);

      if (!activeBaselines) {
        // We expect calibration to re-run when baselines are missing.
        setConfidence(0.2);
        return;
      }

      const effectiveEarThreshold = Math.max(
        activeBaselines.ear * 0.75,
        BASE_EAR_THRESHOLD * 0.75
      );

      const adjustedTilt = tiltAngleRaw - activeBaselines.tilt;
      setHeadTiltAngle(adjustedTilt);
      const isTilted = isHeadTilted(adjustedTilt, HEAD_TILT_THRESHOLD);
      setHeadTilted(isTilted);

      const adjustedPitch = pitchAngleRaw - activeBaselines.pitch;
      const nodState = headNodDetectorRef.current.update(
        adjustedPitch,
        HEAD_PITCH_THRESHOLD,
        HEAD_PITCH_BACK_THRESHOLD
      );
      setHeadPitchAngle(nodState.avgPitch);
      setInstantaneousHeadPitchAngle(nodState.instantaneousPitch);
      setHeadPitchWindowMax(nodState.windowMax);
      setHeadPitchWindowMin(nodState.windowMin);
      setHeadNodding(nodState.isForwardNodding);
      setHeadTiltingBack(nodState.isBackwardTilting);

      // Compute MAR (Mouth Aspect Ratio) for yawn detection
      const yawnState = yawnDetectorRef.current.update(currentMAR);
      setMar(yawnState.avgMAR);
      const currentIsYawning = yawnState.isYawning;
      const currentYawCount = yawnState.yawnCount;
      setYawning(currentIsYawning);
      setYawnCount(currentYawCount);
      const isFrequentYawning = isDrowsyYawnRate(currentYawCount);

      // Compute gaze direction
      const gazeState = gazeTrackerRef.current.update(horizontalGaze);
      const currentIsLookingAway = gazeState.isLookingAway;
      const currentLookAwayDuration = gazeState.lookAwayDuration;
      setGazeDirection(gazeState.horizontalGaze);
      setLookingAway(currentIsLookingAway);
      setLookAwayDuration(currentLookAwayDuration);

      // Compute face distance from camera
      const distanceState = faceDistanceTrackerRef.current.update(currentFaceWidth);
      const currentIsTooClose = distanceState.isTooClose;
      const currentIsTooFar = distanceState.isTooFar;
      const currentDistanceWarning = distanceState.distanceWarningDuration;
      setFaceWidth(distanceState.faceWidth);
      setTooClose(currentIsTooClose);
      setTooFar(currentIsTooFar);
      setDistanceWarningDuration(currentDistanceWarning);
      const isAbnormalDistance = faceDistanceTrackerRef.current.isDrowsyDistance(
        currentDistanceWarning
      );

      // Track eye closure with hysteresis to prevent blink false positives
      // Only start counting if eyes have been closed for multiple consecutive frames
      const MIN_CLOSED_FRAMES = 15; // ~0.5 seconds at 30 FPS - filters out blinks

      if (currentEar < effectiveEarThreshold) {
        closedFramesRef.current += 1;
      } else {
        closedFramesRef.current = 0;
      }

      // Convert frames to seconds (but only if past minimum threshold)
      let closedSec = 0;
      if (closedFramesRef.current >= MIN_CLOSED_FRAMES) {
        closedSec = (closedFramesRef.current - MIN_CLOSED_FRAMES) / FPS;
      }
      setEyesClosedSec(closedSec);

      // Aggregate evidence for each attention state
      const eyesClosedDuration = closedSec;
      const forwardPeak = nodState.windowMax ?? 0;
      const backwardPeak = nodState.windowMin ?? 0;

      let sleepingEvidence = 0;
      let noddingEvidence = 0;
      let awakeEvidence = 0.3; // baseline trust in awake state

      if (eyesClosedDuration >= EYES_CLOSED_SLEEP_SEC) {
        const over = eyesClosedDuration - EYES_CLOSED_SLEEP_SEC;
        sleepingEvidence += 0.6 + Math.min(over / 5, 0.4);
      } else if (eyesClosedDuration >= EYES_CLOSED_NOD_SEC) {
        noddingEvidence += 0.5;
      } else if (eyesClosedDuration >= 1.5) {
        noddingEvidence += 0.2;
      }

      if (nodState.isForwardNodding) {
        noddingEvidence += 0.3;
      }

      if (forwardPeak > HEAD_PITCH_THRESHOLD + 4) {
        noddingEvidence += 0.25;
      }

      if (nodState.isBackwardTilting) {
        noddingEvidence += 0.2;
        if (eyesClosedDuration >= 4) {
          sleepingEvidence += 0.2;
        }
      }

      if (currentIsYawning) {
        noddingEvidence += 0.15;
      }

      if (isFrequentYawning) {
        noddingEvidence += 0.1;
      }

      if (currentIsLookingAway && currentLookAwayDuration > 5) {
        noddingEvidence += 0.15;
      } else {
        awakeEvidence += 0.05;
      }

      if (isAbnormalDistance) {
        noddingEvidence += 0.1;
      }

      if (!isTilted) {
        awakeEvidence += 0.1;
      }

      if (!nodState.isForwardNodding && !nodState.isBackwardTilting) {
        awakeEvidence += 0.2;
      }

      if (Math.abs(forwardPeak) < HEAD_PITCH_THRESHOLD && Math.abs(backwardPeak) < HEAD_PITCH_BACK_THRESHOLD) {
        awakeEvidence += 0.05;
      }

      if (!currentIsYawning && currentYawCount < 2) {
        awakeEvidence += 0.05;
      }

      if (eyesClosedDuration < 1) {
        awakeEvidence += 0.3;
      } else if (eyesClosedDuration < EYES_CLOSED_NOD_SEC) {
        awakeEvidence += 0.1;
      }

      sleepingEvidence = Math.min(1, Math.max(0, sleepingEvidence));
      noddingEvidence = Math.min(1, Math.max(0, noddingEvidence));
      awakeEvidence = Math.min(1, Math.max(0.05, awakeEvidence));

      const totalEvidence = sleepingEvidence + noddingEvidence + awakeEvidence;
      const sleepingProb = totalEvidence > 0 ? sleepingEvidence / totalEvidence : 0;
      const noddingProb = totalEvidence > 0 ? noddingEvidence / totalEvidence : 0;
      const awakeProb = totalEvidence > 0 ? awakeEvidence / totalEvidence : 1;

      const ranked = [
        { state: "awake" as AttentionState, prob: awakeProb },
        { state: "noddingOff" as AttentionState, prob: noddingProb },
        { state: "sleeping" as AttentionState, prob: sleepingProb },
      ].sort((a, b) => b.prob - a.prob);

      const best = ranked[0];
      const second = ranked[1];
      const confidenceMargin = best.prob - second.prob;
      const newConfidence = Math.min(0.99, Math.max(0.05, best.prob + confidenceMargin * 0.5));

      latestStateRef.current = best.state;

      const isRiskState = best.state === "noddingOff" || best.state === "sleeping";

      if (isRiskState) {
        const isSleeping = best.state === "sleeping";
        const enteringAlarm = !requireAckRef.current || lastAlarmStateRef.current !== best.state;

        if (enteringAlarm) {
          const alarms = getAlarmBatch(
            isSleeping ? "sleeping" : "nodding",
            isSleeping ? 5 : 4,
            now
          );
          updateActiveAlarms(alarms);

          const preferredChallenge: ChallengeType | undefined = isSleeping
            ? Math.random() < 0.5
              ? "math"
              : "trivia"
            : undefined;

          assignNewChallenge(preferredChallenge);
          updateRequireAck(true);
          lastAlarmStateRef.current = best.state;
        } else if (isSleeping && lastAlarmStateRef.current !== "sleeping") {
          const alarms = getAlarmBatch("sleeping", 5, now);
          updateActiveAlarms(alarms);
          assignNewChallenge(Math.random() < 0.5 ? "math" : "trivia");
          updateRequireAck(true);
          lastAlarmStateRef.current = "sleeping";
        } else if (requireAckRef.current && activeAlarmsRef.current.length === 0) {
          const alarms = getAlarmBatch(
            isSleeping ? "sleeping" : "nodding",
            isSleeping ? 5 : 4,
            now
          );
          updateActiveAlarms(alarms);
        }
      } else {
        if (!requireAckRef.current && activeAlarmsRef.current.length > 0) {
          updateActiveAlarms([]);
          lastAlarmStateRef.current = "awake";
        }

        if (!requireAckRef.current && alarmPhraseRef.current) {
          updateAlarmPhrase(null);
          updateChallenge("phrase", null, null);
        }

        if (!requireAckRef.current) {
          lastAlarmStateRef.current = "awake";
        }
      }
      setState(best.state);
      setConfidence(newConfidence);

      // Emit snapshot every 200-500ms (configurable)
      const EMIT_INTERVAL_MS = 300;
      if (now - lastEmitTimeRef.current >= EMIT_INTERVAL_MS) {
        lastEmitTimeRef.current = now;

        const snapshot: AttentionSnapshot = {
          t: now,
          state: best.state,
          confidence: newConfidence,
          metrics: {
            ear: currentEar,
            eyesClosedSec: closedSec,
            headPitchDeg: nodState.avgPitch,
          },
        };

        pushAttention(snapshot);
      }
    };

    // Start face tracking
    const stopTracking = startFaceTracking(video, handleLandmarks, FPS);

    return () => {
      stopTracking();
    };
  }, [
    isActive,
    videoRef,
    baselines,
    updateActiveAlarms,
    updateAlarmPhrase,
    updateRequireAck,
    resetAlarmState,
    updateChallenge,
    assignNewChallenge,
    getAlarmBatch,
  ]);

  return {
    state,
    confidence,
    ear,
    eyesClosedSec,
    headTiltAngle,
    isHeadTilted: headTilted,
    headPitchAngle,
    headPitchWindowMin,
    headPitchWindowMax,
    instantaneousHeadPitchAngle,
    isHeadNodding: headNodding,
    isHeadTiltingBack: headTiltingBack,
    mar,
    isYawning: yawning,
    yawnCount,
    gazeDirection,
    isLookingAway: lookingAway,
    lookAwayDuration,
    faceWidth,
    isTooClose: tooClose,
    isTooFar: tooFar,
    distanceWarningDuration,
    activeAlarms,
    alarmPhrase,
    challengePrompt,
    challengeType,
    requireAlarmAck,
    silenceAlarm,
    triggerDebugAlarm,
    landmarks,
    isCalibrating,
    calibrationProgress,
    calibrationBaselines: baselines,
  };
}
