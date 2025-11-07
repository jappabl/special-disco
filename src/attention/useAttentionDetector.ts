"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { startFaceTracking, type FaceLandmarks } from "./faceLandmarks";
import { startPoseTracking, type PoseLandmarks } from "./poseLandmarks";
import { PostureTracker, computeLeanAngle } from "./postureAnalysis";
import { computeAverageEAR } from "./ear";
import { computeHeadTilt, isHeadTilted } from "./headTilt";
import { computeHeadPitch, HeadNodDetector } from "./headPitch";
import { computeMAR, YawnDetector, isDrowsyYawnRate } from "./yawning";
import { computeHorizontalGaze, GazeTracker } from "./gazeDirection";
import { computeFaceWidth, FaceDistanceTracker } from "./faceDistance";
import { pushAttention } from "@/fusion/bridge";
import type { AttentionState, AttentionSnapshot } from "@/types/attention";
import { speakWarning, cancelVoiceWarning, getWarningForState } from "./voiceWarnings";

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

// Audio alert system
let audioContext: AudioContext | null = null;

/**
 * Play alert sound at maximum volume for drowsiness detection
 */
function playDrowsinessAlert(isCritical: boolean = false) {
  if (typeof window === 'undefined') return; // Server-side safety

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  // Full volume relative to system
  gainNode.gain.value = 1.0;

  if (isCritical) {
    // Critical alert: aggressive pattern for sleeping state
    oscillator.type = "square";
    oscillator.frequency.value = 1800;
    oscillator.start();
    setTimeout(() => (oscillator.frequency.value = 800), 100);
    setTimeout(() => (oscillator.frequency.value = 1800), 200);
    setTimeout(() => (oscillator.frequency.value = 800), 300);
    setTimeout(() => oscillator.stop(), 500);
  } else {
    // Warning alert: gentler pattern for nodding off
    oscillator.type = "sine";
    oscillator.frequency.value = 800;
    oscillator.start();
    setTimeout(() => (oscillator.frequency.value = 1200), 150);
    setTimeout(() => oscillator.stop(), 400);
  }
}

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
  // Posture metrics
  isSlouchingNow?: boolean;
  isSlouched?: boolean;
  slouchDuration?: number;
  leanAngle?: number;
  isLeaning?: boolean;
  leanDirection?: "forward" | "backward" | "neutral";
  leanDuration?: number;
  bodyPresence?: number;
  isPresent?: boolean;
  awayDuration?: number;
  // Absence alarm
  absentCountdown?: number;
  isAbsenceAlarmArmed: boolean;
  disarmAbsenceAlarm: () => void;
  // Voice warning system
  activeWarning?: string | null;
  // Alarm system
  activeAlarms: AttentionAlarm[];
  alarmPhrase?: string | null;
  challengePrompt?: string | null;
  challengeType: ChallengeType;
  requireAlarmAck: boolean;
  silenceAlarm: (input: string) => boolean;
  triggerDebugAlarm: (mode?: ChallengeType) => void;
  landmarks?: FaceLandmarks | null;
  poseLandmarks?: import("./poseLandmarks").PoseLandmarks | null;
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
  const [poseLandmarks, setPoseLandmarks] = useState<PoseLandmarks | null>(null);
  const [baselines, setBaselines] = useState<CalibrationBaselines | null>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationProgress, setCalibrationProgress] = useState<number>(0);
  const [activeAlarms, setActiveAlarms] = useState<AttentionAlarm[]>([]);
  const [alarmPhrase, setAlarmPhrase] = useState<string | null>(null);
  const [requireAlarmAck, setRequireAlarmAck] = useState<boolean>(false);
  const [challengePrompt, setChallengePrompt] = useState<string | null>(null);
  const [challengeType, setChallengeType] = useState<ChallengeType>("phrase");

  // Posture state
  const [isSlouchingNow, setIsSlouchingNow] = useState<boolean>(false);
  const [isSlouched, setIsSlouched] = useState<boolean>(false);
  const [slouchDuration, setSlouchDuration] = useState<number>(0);
  const [leanAngle, setLeanAngle] = useState<number>(0);
  const [isLeaning, setIsLeaning] = useState<boolean>(false);
  const [leanDirection, setLeanDirection] = useState<"forward" | "backward" | "neutral">("neutral");
  const [leanDuration, setLeanDuration] = useState<number>(0);
  const [bodyPresence, setBodyPresence] = useState<number>(0);
  const [isPresent, setIsPresent] = useState<boolean>(true);
  const [awayDuration, setAwayDuration] = useState<number>(0);

  // Absence alarm state
  const [absentCountdown, setAbsentCountdown] = useState<number | undefined>(undefined);
  const [isAbsenceAlarmArmed, setIsAbsenceAlarmArmed] = useState<boolean>(true);
  const absentStartTimeRef = useRef<number | null>(null);

  // Voice warning state
  const [activeWarning, setActiveWarning] = useState<string | null>(null);
  const warningStartTimeRef = useRef<number | null>(null);
  const VOICE_GRACE_PERIOD_MS = 5000; // 5 seconds

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

  const disarmAbsenceAlarm = useCallback(() => {
    setIsAbsenceAlarmArmed(false);
    setAbsentCountdown(undefined);
    absentStartTimeRef.current = null;
  }, []);

  // Batch state updates to reduce re-renders
  const queueStateUpdate = useCallback((updates: Partial<UseAttentionDetectorResult>) => {
    Object.assign(pendingUpdatesRef.current, updates);
  }, []);

  const flushStateUpdates = useCallback(() => {
    const updates = pendingUpdatesRef.current;
    if (Object.keys(updates).length === 0) return;

    // Apply all batched updates
    if (updates.ear !== undefined) setEar(updates.ear);
    if (updates.eyesClosedSec !== undefined) setEyesClosedSec(updates.eyesClosedSec);
    if (updates.headTiltAngle !== undefined) setHeadTiltAngle(updates.headTiltAngle);
    if (updates.isHeadTilted !== undefined) setHeadTilted(updates.isHeadTilted);
    if (updates.headPitchAngle !== undefined) setHeadPitchAngle(updates.headPitchAngle);
    if (updates.instantaneousHeadPitchAngle !== undefined) setInstantaneousHeadPitchAngle(updates.instantaneousHeadPitchAngle);
    if (updates.headPitchWindowMax !== undefined) setHeadPitchWindowMax(updates.headPitchWindowMax);
    if (updates.headPitchWindowMin !== undefined) setHeadPitchWindowMin(updates.headPitchWindowMin);
    if (updates.isHeadNodding !== undefined) setHeadNodding(updates.isHeadNodding);
    if (updates.isHeadTiltingBack !== undefined) setHeadTiltingBack(updates.isHeadTiltingBack);
    if (updates.mar !== undefined) setMar(updates.mar);
    if (updates.isYawning !== undefined) setYawning(updates.isYawning);
    if (updates.yawnCount !== undefined) setYawnCount(updates.yawnCount);
    if (updates.gazeDirection !== undefined) setGazeDirection(updates.gazeDirection);
    if (updates.isLookingAway !== undefined) setLookingAway(updates.isLookingAway);
    if (updates.lookAwayDuration !== undefined) setLookAwayDuration(updates.lookAwayDuration);
    if (updates.faceWidth !== undefined) setFaceWidth(updates.faceWidth);
    if (updates.isTooClose !== undefined) setTooClose(updates.isTooClose);
    if (updates.isTooFar !== undefined) setTooFar(updates.isTooFar);
    if (updates.distanceWarningDuration !== undefined) setDistanceWarningDuration(updates.distanceWarningDuration);
    if (updates.isSlouchingNow !== undefined) setIsSlouchingNow(updates.isSlouchingNow);
    if (updates.isSlouched !== undefined) setIsSlouched(updates.isSlouched);
    if (updates.slouchDuration !== undefined) setSlouchDuration(updates.slouchDuration);
    if (updates.leanAngle !== undefined) setLeanAngle(updates.leanAngle);
    if (updates.isLeaning !== undefined) setIsLeaning(updates.isLeaning);
    if (updates.leanDirection !== undefined) setLeanDirection(updates.leanDirection);
    if (updates.leanDuration !== undefined) setLeanDuration(updates.leanDuration);
    if (updates.bodyPresence !== undefined) setBodyPresence(updates.bodyPresence);
    if (updates.isPresent !== undefined) setIsPresent(updates.isPresent);
    if (updates.awayDuration !== undefined) setAwayDuration(updates.awayDuration);

    // Clear pending updates
    pendingUpdatesRef.current = {};
  }, []);

  // Track consecutive closed frames
  const closedFramesRef = useRef<number>(0);
  const lastEmitTimeRef = useRef<number>(0);
  const headNodDetectorRef = useRef<HeadNodDetector>(new HeadNodDetector());
  const yawnDetectorRef = useRef<YawnDetector>(new YawnDetector());
  const gazeTrackerRef = useRef<GazeTracker>(new GazeTracker());
  const faceDistanceTrackerRef = useRef<FaceDistanceTracker>(new FaceDistanceTracker());
  const postureTrackerRef = useRef<PostureTracker>(new PostureTracker());
  const latestPostureStateRef = useRef<ReturnType<PostureTracker['update']> | null>(null);

  // Batched state updates (flush every 100ms)
  const pendingUpdatesRef = useRef<Partial<UseAttentionDetectorResult>>({});
  const lastStateFlushRef = useRef<number>(0);
  const STATE_FLUSH_INTERVAL = 100; // ms
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
      postureTrackerRef.current = new PostureTracker();
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

        // Handle absence alarm countdown
        if (isAbsenceAlarmArmed) {
          if (absentStartTimeRef.current === null) {
            absentStartTimeRef.current = now;
          }
          const absentDuration = (now - absentStartTimeRef.current) / 1000;
          const countdown = Math.max(0, 5 - absentDuration);
          setAbsentCountdown(countdown);

          // Trigger alarm after 5 seconds
          if (absentDuration >= 5 && !requireAckRef.current) {
            updateActiveAlarms(getAlarmBatch("sleeping", 5, now));
            playDrowsinessAlert(true);
            assignNewChallenge(Math.random() < 0.5 ? "math" : "trivia");
            updateRequireAck(true);
            lastAlarmStateRef.current = "sleeping";
            setState("sleeping");
            setConfidence(0.99);
            return;
          }
        }

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
          absentStartTimeRef.current = null;
          setAbsentCountdown(undefined);
          return;
        }

        const shouldSleep = missingSec >= EYES_CLOSED_SLEEP_SEC;
        const shouldNod = !shouldSleep && missingSec >= EYES_CLOSED_NOD_SEC;

        if (shouldSleep) {
          latestStateRef.current = "sleeping";
          if (!requireAckRef.current || lastAlarmStateRef.current !== "sleeping") {
            updateActiveAlarms(getAlarmBatch("sleeping", 5, now));
            playDrowsinessAlert(true); // Play critical alert
            if (!requireAckRef.current) {
              assignNewChallenge(Math.random() < 0.5 ? "math" : "trivia");
            } else {
              assignNewChallenge("math");
            }
            updateRequireAck(true);
            lastAlarmStateRef.current = "sleeping";
          } else if (requireAckRef.current && activeAlarmsRef.current.length === 0) {
            updateActiveAlarms(getAlarmBatch("sleeping", 5, now));
            playDrowsinessAlert(true); // Play critical alert
          }
          setState("sleeping");
          setConfidence(0.98);
        } else if (shouldNod) {
          latestStateRef.current = "noddingOff";
          if (!requireAckRef.current || lastAlarmStateRef.current !== "noddingOff") {
            updateActiveAlarms(getAlarmBatch("nodding", 4, now));
            playDrowsinessAlert(false); // Play warning alert
            if (!requireAckRef.current) {
              assignNewChallenge();
            }
            updateRequireAck(true);
            lastAlarmStateRef.current = "noddingOff";
          } else if (requireAckRef.current && activeAlarmsRef.current.length === 0) {
            updateActiveAlarms(getAlarmBatch("nodding", 4, now));
            playDrowsinessAlert(false); // Play warning alert
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

      // Reset absence alarm countdown when face is detected
      absentStartTimeRef.current = null;
      setAbsentCountdown(undefined);

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

          // Set posture baseline during calibration
          const postureState = latestPostureStateRef.current;
          if (postureState && postureState.isPresent && poseLandmarks) {
            // Calculate raw lean angle for baseline
            const leanAngleRaw = computeLeanAngle(poseLandmarks);
            postureTrackerRef.current.setBaseline(postureState.postureVertical, leanAngleRaw);
          }

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
      const isTilted = isHeadTilted(adjustedTilt, HEAD_TILT_THRESHOLD);

      const adjustedPitch = pitchAngleRaw - activeBaselines.pitch;
      const nodState = headNodDetectorRef.current.update(
        adjustedPitch,
        HEAD_PITCH_THRESHOLD,
        HEAD_PITCH_BACK_THRESHOLD
      );

      // Compute MAR (Mouth Aspect Ratio) for yawn detection
      const yawnState = yawnDetectorRef.current.update(currentMAR);
      const currentIsYawning = yawnState.isYawning;
      const currentYawCount = yawnState.yawnCount;
      const isFrequentYawning = isDrowsyYawnRate(currentYawCount);

      // Compute gaze direction
      const gazeState = gazeTrackerRef.current.update(horizontalGaze);
      const currentIsLookingAway = gazeState.isLookingAway;
      const currentLookAwayDuration = gazeState.lookAwayDuration;

      // Compute face distance from camera
      const distanceState = faceDistanceTrackerRef.current.update(currentFaceWidth);
      const currentIsTooClose = distanceState.isTooClose;
      const currentIsTooFar = distanceState.isTooFar;
      const currentDistanceWarning = distanceState.distanceWarningDuration;

      // Queue batched state updates
      queueStateUpdate({
        headTiltAngle: adjustedTilt,
        isHeadTilted: isTilted,
        headPitchAngle: nodState.avgPitch,
        instantaneousHeadPitchAngle: nodState.instantaneousPitch,
        headPitchWindowMax: nodState.windowMax,
        headPitchWindowMin: nodState.windowMin,
        isHeadNodding: nodState.isForwardNodding,
        isHeadTiltingBack: nodState.isBackwardTilting,
        mar: yawnState.avgMAR,
        isYawning: currentIsYawning,
        yawnCount: currentYawCount,
        gazeDirection: gazeState.horizontalGaze,
        isLookingAway: currentIsLookingAway,
        lookAwayDuration: currentLookAwayDuration,
        faceWidth: distanceState.faceWidth,
        isTooClose: currentIsTooClose,
        isTooFar: currentIsTooFar,
        distanceWarningDuration: currentDistanceWarning,
      });
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
      queueStateUpdate({ eyesClosedSec: closedSec });

      // Aggregate evidence for each attention state
      const eyesClosedDuration = closedSec;
      const forwardPeak = nodState.windowMax ?? 0;
      const backwardPeak = nodState.windowMin ?? 0;

      let sleepingEvidence = 0;
      let noddingEvidence = 0;
      let awakeEvidence = 0.3; // baseline trust in awake state

      // Very aggressive eye closing detection - eyes closed = strong signal
      if (eyesClosedDuration >= EYES_CLOSED_SLEEP_SEC) {
        const over = eyesClosedDuration - EYES_CLOSED_SLEEP_SEC;
        sleepingEvidence += 2.0 + Math.min(over / 2, 1.0); // Much stronger evidence
      } else if (eyesClosedDuration >= EYES_CLOSED_NOD_SEC) {
        noddingEvidence += 1.5; // Triple the evidence
      } else if (eyesClosedDuration >= 2.0) {
        noddingEvidence += 0.8; // Increased from 1.5s to 2s threshold, stronger evidence
      } else if (eyesClosedDuration >= 1.0) {
        noddingEvidence += 0.3;
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

      // Reduce awake evidence significantly when eyes are closed
      if (eyesClosedDuration < 1) {
        awakeEvidence += 0.3;
      } else if (eyesClosedDuration < 2.0) {
        awakeEvidence += 0.05; // Reduced from 0.1
      } else if (eyesClosedDuration < EYES_CLOSED_NOD_SEC) {
        awakeEvidence = 0; // No awake evidence if eyes closed 2+ seconds
      } else {
        awakeEvidence = 0; // Definitely not awake if eyes closed 3.5+ seconds
      }

      // POSTURE EVIDENCE INTEGRATION
      const postureState = latestPostureStateRef.current;

      if (postureState) {
        // Critical sleeping indicators from posture
        if (postureState.leanDirection === "backward" &&
            postureState.leanDuration > 5000 &&
            eyesClosedDuration > 3) {
          sleepingEvidence += 0.4; // Strong sleep signal
        }

        if (!postureState.isPresent && postureState.awayDuration > 10000) {
          sleepingEvidence += 0.5; // User away = sleeping/left desk
        }

        if (postureState.isSlouched &&
            postureState.leanDirection === "backward" &&
            eyesClosedDuration > 4) {
          sleepingEvidence += 0.3; // Loss of postural control
        }

        // Nodding/fatigue indicators from posture
        if (postureState.isSlouched) {
          if (postureState.slouchDuration > 10000) {
            noddingEvidence += 0.3; // Prolonged slouching
          } else if (postureState.slouchDuration > 5000) {
            noddingEvidence += 0.2; // Early fatigue
          }
        }

        if (postureState.leanDirection === "forward" &&
            postureState.leanDuration > 3000 &&
            eyesClosedDuration > 1.5) {
          noddingEvidence += 0.25; // Classic nodding off
        }

        if (postureState.leanDirection === "backward" &&
            postureState.leanDuration > 5000 &&
            postureState.leanDuration < 15000) {
          noddingEvidence += 0.15; // Mild backward lean = trying to stay awake
        }

        if (postureState.isLeaning && currentIsYawning) {
          noddingEvidence += 0.1; // Compound fatigue signal
        }

        // Awake indicators from posture
        if (!postureState.isSlouched &&
            !postureState.isLeaning &&
            postureState.isPresent) {
          awakeEvidence += 0.25; // Good posture = alert
        }

        if (postureState.isPresent &&
            postureState.bodyPresence > 0.7 &&
            !postureState.isSlouched) {
          awakeEvidence += 0.15; // Clear presence + good posture
        }

        if (!postureState.isSlouchingNow &&
            postureState.slouchDuration === 0 &&
            postureState.leanDirection === "neutral") {
          awakeEvidence += 0.1; // Actively maintaining posture
        }

        // Confidence reduction for uncertain states
        if (postureState.bodyPresence < 0.5 && landmarks !== null) {
          // User moving around - reduce all confidence by 20%
          sleepingEvidence *= 0.8;
          noddingEvidence *= 0.8;
          awakeEvidence *= 0.8;
        }
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

      console.log('[Detection] State:', best.state, 'IsRiskState:', isRiskState, 'Confidence:', newConfidence);

      if (isRiskState) {
        const isSleeping = best.state === "sleeping";

        // Get appropriate voice warning based on current metrics
        const warning = getWarningForState({
          eyesClosedSec: closedSec,
          isHeadNodding: nodState.isForwardNodding,
          isHeadTiltingBack: nodState.isBackwardTilting,
          isHeadTilted: isTilted,
          isSlouched: postureState?.isSlouched,
          leanDirection: postureState?.leanDirection,
          isLeaning: postureState?.isLeaning,
          isYawning: currentIsYawning,
          yawnCount: currentYawCount,
          isLookingAway: currentIsLookingAway,
          isPresent: postureState?.isPresent,
          landmarks: detectedLandmarks,
        });

        console.log('[Detection] Risk state detected. Warning:', warning, 'RequireAck:', requireAckRef.current);

        // Voice warning system with 3-second grace period
        if (warning && !requireAckRef.current) {
          // Check if this is a brand new warning category or just an escalation
          const isNewWarningCategory = !warningStartTimeRef.current ||
            (activeWarning && !warning.message.includes(activeWarning.split(' ')[0]) && !activeWarning.includes(warning.message.split(' ')[0]));

          if (isNewWarningCategory) {
            // Brand new warning - speak it and start timer
            speakWarning(warning.message, warning.priority);
            setActiveWarning(warning.message);
            warningStartTimeRef.current = now;

            // Debug log
            console.log('[Voice Warning] New warning:', warning.message, 'Priority:', warning.priority);
          } else if (activeWarning !== warning.message) {
            // Same category but different message (escalation) - speak new message but DON'T reset timer
            speakWarning(warning.message, warning.priority);
            setActiveWarning(warning.message);
            console.log('[Voice Warning] Escalating warning:', warning.message, 'Time elapsed:', ((now - (warningStartTimeRef.current || now)) / 1000).toFixed(1), 's');
          }

          // Check if grace period has expired
          if (warningStartTimeRef.current && now - warningStartTimeRef.current >= VOICE_GRACE_PERIOD_MS) {
            // Grace period expired - sound the alarm
            const enteringAlarm = !requireAckRef.current || lastAlarmStateRef.current !== best.state;

            if (enteringAlarm) {
              const alarms = getAlarmBatch(
                isSleeping ? "sleeping" : "nodding",
                isSleeping ? 5 : 4,
                now
              );
              updateActiveAlarms(alarms);
              playDrowsinessAlert(isSleeping);

              const preferredChallenge: ChallengeType | undefined = isSleeping
                ? Math.random() < 0.5
                  ? "math"
                  : "trivia"
                : undefined;

              assignNewChallenge(preferredChallenge);
              updateRequireAck(true);
              lastAlarmStateRef.current = best.state;
            }
          }
        } else if (requireAckRef.current) {
          // Already in alarm state - handle escalation
          const enteringAlarm = lastAlarmStateRef.current !== best.state;

          if (enteringAlarm && isSleeping && lastAlarmStateRef.current !== "sleeping") {
            const alarms = getAlarmBatch("sleeping", 5, now);
            updateActiveAlarms(alarms);
            playDrowsinessAlert(true);
            assignNewChallenge(Math.random() < 0.5 ? "math" : "trivia");
            updateRequireAck(true);
            lastAlarmStateRef.current = "sleeping";
          } else if (activeAlarmsRef.current.length === 0) {
            const alarms = getAlarmBatch(
              isSleeping ? "sleeping" : "nodding",
              isSleeping ? 5 : 4,
              now
            );
            updateActiveAlarms(alarms);
            playDrowsinessAlert(isSleeping);
          }
        }
      } else {
        // User is awake - reset warning state
        if (activeWarning) {
          cancelVoiceWarning();
          setActiveWarning(null);
          warningStartTimeRef.current = null;
        }

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

      // Flush batched state updates every 100ms
      if (now - lastStateFlushRef.current >= STATE_FLUSH_INTERVAL) {
        lastStateFlushRef.current = now;
        flushStateUpdates();
      }

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

    // Handle pose landmarks for posture tracking
    const handlePose = (detectedPose: PoseLandmarks | null) => {
      const now = Date.now();
      setPoseLandmarks(detectedPose);

      const postureState = postureTrackerRef.current.update(detectedPose, now);

      // Store in ref for evidence integration
      latestPostureStateRef.current = postureState;

      // Queue batched posture state updates
      queueStateUpdate({
        isSlouchingNow: postureState.isSlouchingNow,
        isSlouched: postureState.isSlouched,
        slouchDuration: postureState.slouchDuration,
        leanAngle: postureState.leanAngle,
        isLeaning: postureState.isLeaning,
        leanDirection: postureState.leanDirection,
        leanDuration: postureState.leanDuration,
        bodyPresence: postureState.bodyPresence,
        isPresent: postureState.isPresent,
        awayDuration: postureState.awayDuration,
      });
    };

    // Start face tracking
    const stopTracking = startFaceTracking(video, handleLandmarks, FPS);

    // Start pose tracking (lower FPS for performance)
    let stopPoseTracking: (() => void) | null = null;
    startPoseTracking(video, handlePose, 10).then((stopFn) => {
      stopPoseTracking = stopFn;
    });

    return () => {
      stopTracking();
      if (stopPoseTracking) {
        stopPoseTracking();
      }
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
    queueStateUpdate,
    flushStateUpdates,
    isAbsenceAlarmArmed,
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
    // Alarms
    activeAlarms,
    alarmPhrase,
    challengePrompt,
    challengeType,
    requireAlarmAck,
    silenceAlarm,
    triggerDebugAlarm,
    landmarks,
    poseLandmarks,
    isCalibrating,
    calibrationProgress,
    calibrationBaselines: baselines,
  };
}
