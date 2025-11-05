"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export type UseWebcamStreamResult = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isReady: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
};

export function useWebcamStream(): UseWebcamStreamResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    try {
      setError(null);
      setIsReady(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error("Video element not available"));
            return;
          }

          videoRef.current.onloadedmetadata = () => {
            videoRef.current
              ?.play()
              .then(() => {
                setIsReady(true);
                resolve();
              })
              .catch(reject);
          };

          videoRef.current.onerror = () => {
            reject(new Error("Failed to load video"));
          };
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to access webcam";
      setError(message);
      console.error("Webcam error:", err);
    }
  }, []);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsReady(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    videoRef,
    isReady,
    error,
    start,
    stop,
  };
}
