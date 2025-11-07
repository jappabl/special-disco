/**
 * Voice warning system using Web Speech API (text-to-speech)
 * Provides gentle voice prompts before escalating to loud alarms
 * Falls back to audio tones if speech synthesis fails
 */

let speechSynthesis: SpeechSynthesis | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let lastSpokenMessage: string | null = null;
let lastSpokenTime: number = 0;
let isSpeaking: boolean = false; // Prevent overlapping calls
const DEBOUNCE_DELAY = 500; // ms - prevent repeated speech of same message

let speechPrimed = false;
let audioContext: AudioContext | null = null;
let useFallbackAudio = false; // Use audio tones instead of speech
let speechFailureCount = 0; // Track consecutive failures

/**
 * Initialize speech synthesis
 */
function initSpeech(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;

  if (!speechSynthesis) {
    speechSynthesis = window.speechSynthesis;
  }

  return speechSynthesis;
}

/**
 * Prime speech synthesis - must be called from user interaction
 * This is required by browser autoplay policies
 */
export function primeSpeechSynthesis(): void {
  const speech = initSpeech();
  if (!speech || speechPrimed) return;

  console.log('[Voice Warning] Priming speech synthesis...');

  // Cancel any pending speech first
  if (speech.speaking) {
    speech.cancel();
  }

  // Speak a very short utterance to satisfy autoplay policy
  // Empty string doesn't work in all browsers, so use a single character
  const utterance = new SpeechSynthesisUtterance('.');
  utterance.volume = 0.01; // Very quiet but not silent
  utterance.rate = 10; // Very fast
  utterance.onstart = () => {
    speechPrimed = true;
    console.log('[Voice Warning] Speech synthesis primed');
  };
  utterance.onend = () => {
    console.log('[Voice Warning] Priming complete');
  };
  utterance.onerror = (event) => {
    console.warn('[Voice Warning] Failed to prime speech synthesis:', event.error);
  };

  speech.speak(utterance);
}

/**
 * Cancel any ongoing speech
 */
export function cancelVoiceWarning(): void {
  const speech = initSpeech();
  if (speech && speech.speaking) {
    speech.cancel();
  }
  currentUtterance = null;
  lastSpokenMessage = null;
  lastSpokenTime = 0;
}

/**
 * Speak a warning message with debouncing
 * Prevents speaking the same message within DEBOUNCE_DELAY ms
 */
export function speakWarning(message: string, priority: 'low' | 'medium' | 'high' = 'medium'): void {
  const now = Date.now();

  // Debounce: don't repeat the same message within 500ms
  if (lastSpokenMessage === message && now - lastSpokenTime < DEBOUNCE_DELAY) {
    console.log('[Voice Warning] Debounced:', message);
    return;
  }

  lastSpokenMessage = message;
  lastSpokenTime = now;

  // If speech has failed multiple times, use audio fallback
  if (useFallbackAudio || speechFailureCount >= 2) {
    if (!useFallbackAudio) {
      console.warn('[Voice Warning] Speech failed multiple times, switching to audio tones');
      useFallbackAudio = true;
    }
    playAudioTone(priority);
    return;
  }

  const speech = initSpeech();
  if (!speech) {
    console.log('[Voice Warning] Speech synthesis not available, using audio fallback');
    playAudioTone(priority);
    return;
  }

  // Prevent overlapping calls - if already processing, skip
  if (isSpeaking) {
    console.log('[Voice Warning] Already speaking, skipping:', message);
    return;
  }

  // Cancel previous speech if speaking different message
  if (speech.speaking && lastSpokenMessage !== message) {
    console.log('[Voice Warning] Canceling previous speech');
    speech.cancel();
    isSpeaking = false;
  }

  console.log('[Voice Warning] Preparing to speak:', message, 'Priority:', priority);
  const utterance = new SpeechSynthesisUtterance(message);

  // Set voice properties based on priority
  switch (priority) {
    case 'low':
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 0.7;
      break;
    case 'medium':
      utterance.rate = 1.1;
      utterance.pitch = 1.1;
      utterance.volume = 0.9;
      break;
    case 'high':
      utterance.rate = 1.2;
      utterance.pitch = 1.2;
      utterance.volume = 1.0;
      break;
  }

  // Set up callbacks BEFORE calling speak()
  utterance.onstart = () => {
    console.log('[Voice Warning] Speech started');
    isSpeaking = true; // Set flag when speech actually starts
    speechFailureCount = 0; // Reset failure count on success
  };

  utterance.onerror = (event) => {
    console.error('[Voice Warning] Speech error:', event);
    console.error('[Voice Warning] Error type:', event.error);
    isSpeaking = false; // Reset on error
    speechFailureCount++;
    console.warn('[Voice Warning] Speech failure count:', speechFailureCount);
  };

  utterance.onend = () => {
    console.log('[Voice Warning] Speech ended');
    isSpeaking = false; // Reset when done
  };

  utterance.onpause = () => {
    console.log('[Voice Warning] Speech paused');
  };

  utterance.onresume = () => {
    console.log('[Voice Warning] Speech resumed');
  };

  currentUtterance = utterance;

  // Failsafe: If no callbacks fire within 2 seconds, count as failure and use audio fallback
  const failsafeTimeout = setTimeout(() => {
    if (!isSpeaking) {
      console.warn('[Voice Warning] Speech failed to start within 2s');
      isSpeaking = false;
      speechFailureCount++;
      console.warn('[Voice Warning] Speech failure count:', speechFailureCount);
      // Play audio tone as immediate fallback
      playAudioTone(priority);
    }
  }, 2000);

  // Clear failsafe when speech actually starts
  const originalOnStart = utterance.onstart;
  utterance.onstart = (event) => {
    clearTimeout(failsafeTimeout);
    if (originalOnStart) originalOnStart.call(utterance, event);
  };

  // Also clear failsafe on error/end
  const originalOnError = utterance.onerror;
  utterance.onerror = (event) => {
    clearTimeout(failsafeTimeout);
    if (originalOnError) originalOnError.call(utterance, event);
  };

  const originalOnEnd = utterance.onend;
  utterance.onend = (event) => {
    clearTimeout(failsafeTimeout);
    if (originalOnEnd) originalOnEnd.call(utterance, event);
  };

  // Wait for voices to load (Chromium issue fix)
  const voices = speech.getVoices();
  if (voices.length === 0) {
    console.log('[Voice Warning] No voices loaded yet, waiting...');
    speech.addEventListener('voiceschanged', () => {
      console.log('[Voice Warning] Voices loaded:', speech.getVoices().length);
      const newVoices = speech.getVoices();
      if (newVoices.length > 0) {
        utterance.voice = newVoices[0]; // Use first available voice
        console.log('[Voice Warning] Using voice:', newVoices[0].name);
      }
      console.log('[Voice Warning] Calling speech.speak() [async]');
      try {
        speech.speak(utterance);
      } catch (err) {
        console.error('[Voice Warning] Exception calling speak():', err);
        isSpeaking = false;
        clearTimeout(failsafeTimeout);
      }
    }, { once: true });
  } else {
    utterance.voice = voices[0]; // Use first available voice
    console.log('[Voice Warning] Using voice:', voices[0].name, 'Total voices:', voices.length);
    console.log('[Voice Warning] Calling speech.speak()');
    try {
      speech.speak(utterance);
    } catch (err) {
      console.error('[Voice Warning] Exception calling speak():', err);
      isSpeaking = false;
      clearTimeout(failsafeTimeout);
    }
  }
}

/**
 * Initialize audio context for fallback tones
 */
function initAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch (err) {
      console.error('[Voice Warning] Failed to create AudioContext:', err);
      return null;
    }
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(err => {
      console.error('[Voice Warning] Failed to resume AudioContext:', err);
    });
  }

  return audioContext;
}

/**
 * Play audio tone pattern based on priority
 * Fallback when speech synthesis fails
 */
async function playAudioTone(priority: 'low' | 'medium' | 'high'): Promise<void> {
  const ctx = initAudioContext();
  if (!ctx) return;

  console.log('[Voice Warning] Playing audio tone, priority:', priority);

  // Define tone patterns for different priorities
  const patterns = {
    low: [{ freq: 400, duration: 0.15 }, { freq: 500, duration: 0.15 }], // Two gentle beeps
    medium: [{ freq: 600, duration: 0.2 }, { freq: 700, duration: 0.2 }, { freq: 800, duration: 0.2 }], // Three ascending beeps
    high: [{ freq: 900, duration: 0.15 }, { freq: 1000, duration: 0.15 }, { freq: 1100, duration: 0.15 }, { freq: 1200, duration: 0.15 }], // Four urgent beeps
  };

  const pattern = patterns[priority];
  let startTime = ctx.currentTime;

  for (const tone of pattern) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = tone.freq;
    oscillator.type = 'sine';

    // Envelope for smooth sound
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02); // Attack
    gainNode.gain.linearRampToValueAtTime(0.3, startTime + tone.duration - 0.02); // Sustain
    gainNode.gain.linearRampToValueAtTime(0, startTime + tone.duration); // Release

    oscillator.start(startTime);
    oscillator.stop(startTime + tone.duration);

    startTime += tone.duration + 0.05; // Small gap between beeps
  }
}

/**
 * Test if browser audio is working at all
 */
export function testAudioWorking(): void {
  console.log('[Voice Warning] Testing browser audio...');
  playAudioTone('medium');
}

/**
 * Warning messages for different issues
 */
export const WARNING_MESSAGES = {
  // Eyes closed warnings
  eyesClosing: "Your eyes are closing. Stay alert.",
  eyesClosed: "Please open your eyes.",

  // Head position warnings
  headNodding: "Please keep your head up.",
  headTiltingBack: "Sit up straight.",
  headTilted: "Straighten your head.",

  // Posture warnings
  slouching: "Please correct your posture.",
  slouchingForward: "You're slouching forward. Sit back.",
  leaningForward: "You're leaning too far forward.",
  leaningBackward: "Please sit upright.",

  // Absence warnings
  noFaceDetected: "Please return to your desk.",
  bodyNotPresent: "Stay in frame.",

  // Fatigue indicators
  yawning: "Take a deep breath and refocus.",
  frequentYawning: "You seem tired. Consider taking a break.",
  lookingAway: "Keep your focus on the screen.",

  // Final warnings before alarm
  finalWarning: "This is your final warning. Correct your posture now.",
  alarmIncoming: "Alarm will sound in 3 seconds.",
} as const;

/**
 * Determine which warning to speak based on attention state
 */
export function getWarningForState(metrics: {
  eyesClosedSec?: number;
  isHeadNodding?: boolean;
  isHeadTiltingBack?: boolean;
  isHeadTilted?: boolean;
  isSlouched?: boolean;
  leanDirection?: 'forward' | 'backward' | 'neutral';
  isLeaning?: boolean;
  isYawning?: boolean;
  yawnCount?: number;
  isLookingAway?: boolean;
  isPresent?: boolean;
  landmarks?: unknown;
}): { message: string; priority: 'low' | 'medium' | 'high' } | null {
  // Critical: No face detected
  if (metrics.landmarks === null && metrics.isPresent === false) {
    return { message: WARNING_MESSAGES.noFaceDetected, priority: 'high' };
  }

  // High priority: Eyes closing
  if (metrics.eyesClosedSec !== undefined && metrics.eyesClosedSec > 2) {
    return { message: WARNING_MESSAGES.eyesClosed, priority: 'high' };
  }

  if (metrics.eyesClosedSec !== undefined && metrics.eyesClosedSec > 1) {
    return { message: WARNING_MESSAGES.eyesClosing, priority: 'medium' };
  }

  // High priority: Head nodding (classic drowsiness)
  if (metrics.isHeadNodding) {
    return { message: WARNING_MESSAGES.headNodding, priority: 'high' };
  }

  // Medium priority: Posture issues
  if (metrics.isSlouched) {
    if (metrics.leanDirection === 'forward') {
      return { message: WARNING_MESSAGES.slouchingForward, priority: 'medium' };
    }
    return { message: WARNING_MESSAGES.slouching, priority: 'medium' };
  }

  if (metrics.isLeaning) {
    if (metrics.leanDirection === 'forward') {
      return { message: WARNING_MESSAGES.leaningForward, priority: 'medium' };
    } else if (metrics.leanDirection === 'backward') {
      return { message: WARNING_MESSAGES.leaningBackward, priority: 'medium' };
    }
  }

  if (metrics.isHeadTiltingBack) {
    return { message: WARNING_MESSAGES.headTiltingBack, priority: 'medium' };
  }

  if (metrics.isHeadTilted) {
    return { message: WARNING_MESSAGES.headTilted, priority: 'low' };
  }

  // Low priority: Fatigue indicators
  if (metrics.yawnCount !== undefined && metrics.yawnCount >= 3) {
    return { message: WARNING_MESSAGES.frequentYawning, priority: 'low' };
  }

  if (metrics.isYawning) {
    return { message: WARNING_MESSAGES.yawning, priority: 'low' };
  }

  if (metrics.isLookingAway) {
    return { message: WARNING_MESSAGES.lookingAway, priority: 'low' };
  }

  return null;
}

/**
 * Check if speech synthesis is available
 */
export function isSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
