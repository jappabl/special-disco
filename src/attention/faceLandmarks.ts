import {
  FaceLandmarker,
  FilesetResolver,
  FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

export type Landmark = { x: number; y: number; z?: number };

export type FaceLandmarks = {
  leftEye: Landmark[];       // Full contour (16 points) - for visualization
  rightEye: Landmark[];      // Full contour (16 points) - for visualization
  leftEyeEAR: Landmark[];    // 6 points for EAR calculation
  rightEyeEAR: Landmark[];   // 6 points for EAR calculation
  allPoints: Landmark[];
};

// MediaPipe face mesh indices for eyes
// Full eye contour for better accuracy (16 points per eye)
// Left eye (upper + lower contour)
const LEFT_EYE_INDICES = [
  // Upper contour
  362, 398, 384, 385, 386, 387, 388, 466,
  // Lower contour
  263, 249, 390, 373, 374, 380, 381, 382
];
// Right eye (upper + lower contour)
const RIGHT_EYE_INDICES = [
  // Upper contour
  33, 246, 161, 160, 159, 158, 157, 173,
  // Lower contour
  133, 155, 154, 153, 145, 144, 163, 7
];

// 6-point indices for EAR calculation (keep these for the algorithm)
const LEFT_EYE_EAR_INDICES = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE_EAR_INDICES = [33, 160, 158, 133, 153, 144];

let faceLandmarker: FaceLandmarker | null = null;

async function initializeFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarker) {
    return faceLandmarker;
  }

  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return faceLandmarker;
}

function extractLandmarks(result: FaceLandmarkerResult): FaceLandmarks | null {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return null;
  }

  const landmarks = result.faceLandmarks[0];

  // Extract full eye contours (for visualization)
  const leftEye = LEFT_EYE_INDICES.map((idx) => ({
    x: landmarks[idx].x,
    y: landmarks[idx].y,
    z: landmarks[idx].z,
  }));

  const rightEye = RIGHT_EYE_INDICES.map((idx) => ({
    x: landmarks[idx].x,
    y: landmarks[idx].y,
    z: landmarks[idx].z,
  }));

  // Extract 6-point eye landmarks (for EAR calculation)
  const leftEyeEAR = LEFT_EYE_EAR_INDICES.map((idx) => ({
    x: landmarks[idx].x,
    y: landmarks[idx].y,
    z: landmarks[idx].z,
  }));

  const rightEyeEAR = RIGHT_EYE_EAR_INDICES.map((idx) => ({
    x: landmarks[idx].x,
    y: landmarks[idx].y,
    z: landmarks[idx].z,
  }));

  const allPoints = landmarks.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
  }));

  return {
    leftEye,
    rightEye,
    leftEyeEAR,
    rightEyeEAR,
    allPoints,
  };
}

/**
 * Start face tracking on a video element
 * @param video - HTMLVideoElement from webcam
 * @param onResult - Callback with face landmarks or null if no face detected
 * @param fps - Detection frequency (default: 15)
 * @returns Stop function to cleanup
 */
export function startFaceTracking(
  video: HTMLVideoElement,
  onResult: (landmarks: FaceLandmarks | null) => void,
  _fps: number = 30
): () => void {
  let rafId: number | null = null;
  let isRunning = true;
  const frameIntervalMs = 1000 / Math.max(_fps, 1);
  let lastTimestamp = 0;

  initializeFaceLandmarker()
    .then((landmarker) => {
      const detect = (timestamp: number) => {
        if (!isRunning) return;

        // Check if video is ready (has valid dimensions and is playing)
        if (
          video.videoWidth === 0 ||
          video.videoHeight === 0 ||
          video.readyState < 2
        ) {
          rafId = requestAnimationFrame(detect);
          return;
        }

        // Throttle detection to target FPS to reduce compute load
        if (timestamp - lastTimestamp < frameIntervalMs) {
          rafId = requestAnimationFrame(detect);
          return;
        }
        lastTimestamp = timestamp;

        try {
          const result = landmarker.detectForVideo(video, timestamp);
          const landmarks = extractLandmarks(result);
          onResult(landmarks);
        } catch {
          // Silently ignore errors during initialization
          onResult(null);
        }

        rafId = requestAnimationFrame(detect);
      };

      rafId = requestAnimationFrame(detect);
    })
    .catch((_err) => {
      console.error("Failed to initialize face landmarker:", _err);
      onResult(null);
    });

  // Return stop function
  return () => {
    isRunning = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  };
}
