import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

export type PoseLandmarks = {
  leftShoulder: { x: number; y: number; z: number };
  rightShoulder: { x: number; y: number; z: number };
  leftHip: { x: number; y: number; z: number };
  rightHip: { x: number; y: number; z: number };
  nose: { x: number; y: number; z: number };
  allPoints: Array<{ x: number; y: number; z: number }>;
  visibility: {
    leftShoulder: number;
    rightShoulder: number;
    leftHip: number;
    rightHip: number;
  };
};

let poseLandmarker: PoseLandmarker | null = null;

/**
 * Initialize the MediaPipe Pose Landmarker model
 */
async function initPoseLandmarker(): Promise<PoseLandmarker> {
  if (poseLandmarker) {
    return poseLandmarker;
  }

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return poseLandmarker;
}

/**
 * Extract relevant pose landmarks from MediaPipe result
 */
function extractPoseLandmarks(
  result: PoseLandmarkerResult
): PoseLandmarks | null {
  if (!result.landmarks || result.landmarks.length === 0) {
    return null;
  }

  const landmarks = result.landmarks[0];

  // MediaPipe Pose landmark indices:
  // 0: nose
  // 11: left shoulder
  // 12: right shoulder
  // 23: left hip
  // 24: right hip

  if (landmarks.length < 25) {
    return null;
  }

  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  // Get visibility scores (0-1, higher = more visible)
  const worldLandmarks = result.worldLandmarks?.[0];
  const visibility = worldLandmarks
    ? {
        leftShoulder: worldLandmarks[11]?.visibility ?? 0,
        rightShoulder: worldLandmarks[12]?.visibility ?? 0,
        leftHip: worldLandmarks[23]?.visibility ?? 0,
        rightHip: worldLandmarks[24]?.visibility ?? 0,
      }
    : {
        leftShoulder: 0,
        rightShoulder: 0,
        leftHip: 0,
        rightHip: 0,
      };

  return {
    leftShoulder: { x: leftShoulder.x, y: leftShoulder.y, z: leftShoulder.z },
    rightShoulder: {
      x: rightShoulder.x,
      y: rightShoulder.y,
      z: rightShoulder.z,
    },
    leftHip: { x: leftHip.x, y: leftHip.y, z: leftHip.z },
    rightHip: { x: rightHip.x, y: rightHip.y, z: rightHip.z },
    nose: { x: nose.x, y: nose.y, z: nose.z },
    allPoints: landmarks.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z })),
    visibility,
  };
}

/**
 * Start pose tracking on a video element
 * @param video - The video element to track
 * @param onPose - Callback for each detected pose
 * @param fps - Frames per second to detect (lower = better performance)
 * @returns Function to stop tracking
 */
export async function startPoseTracking(
  video: HTMLVideoElement,
  onPose: (landmarks: PoseLandmarks | null) => void,
  fps: number = 10
): Promise<() => void> {
  const landmarker = await initPoseLandmarker();

  let lastTimestamp = 0;
  const frameInterval = 1000 / fps;
  let isRunning = true;

  const detect = () => {
    if (!isRunning) return;

    const now = performance.now();
    if (now - lastTimestamp >= frameInterval) {
      lastTimestamp = now;

      try {
        // Validate video is ready with valid dimensions
        if (
          !video ||
          video.readyState < 2 ||
          video.videoWidth === 0 ||
          video.videoHeight === 0
        ) {
          // Video not ready yet, skip this frame
          requestAnimationFrame(detect);
          return;
        }

        const result = landmarker.detectForVideo(video, now);
        const landmarks = extractPoseLandmarks(result);
        onPose(landmarks);
      } catch (error) {
        // Silently skip errors during video initialization
        if (video.readyState < 2) {
          onPose(null);
        } else {
          console.error("[Pose Tracking] Detection error:", error);
          onPose(null);
        }
      }
    }

    requestAnimationFrame(detect);
  };

  requestAnimationFrame(detect);

  return () => {
    isRunning = false;
  };
}
