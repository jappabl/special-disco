import { ScreenSnapshot } from "./shared/types";
import { generatePuzzle } from "./puzzles";

console.log("[Content Script] Loaded");

let alarmTimeout: number | null = null;
let alertElement: HTMLDivElement | null = null;
let audioContext: AudioContext | null = null;

/**
 * Creates an EXTREMELY LOUD alarm sound using Web Audio API
 * Randomly varies patterns to prevent habituation
 * NOW WITH MAXIMUM PAIN
 */
function playAlarmSound() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  // MAXIMUM VOLUME ALARM - WAKE THE FUCK UP!
  gainNode.gain.value = 1.0; // MAX VOLUME

  // Random alarm pattern - pick one of 7 BRUTAL patterns
  const pattern = Math.floor(Math.random() * 7);

  switch (pattern) {
    case 0: // ULTRA HIGH PITCHED SIREN
      oscillator.type = "square";
      oscillator.frequency.value = 2000;
      oscillator.start();
      setTimeout(() => (oscillator.frequency.value = 800), 100);
      setTimeout(() => (oscillator.frequency.value = 2000), 200);
      setTimeout(() => (oscillator.frequency.value = 800), 300);
      setTimeout(() => (oscillator.frequency.value = 2000), 400);
      setTimeout(() => oscillator.stop(), 700);
      break;

    case 1: // AGGRESSIVE POLICE SIREN
      oscillator.type = "sawtooth";
      oscillator.frequency.value = 500;
      oscillator.start();
      setTimeout(() => (oscillator.frequency.value = 1200), 150);
      setTimeout(() => (oscillator.frequency.value = 500), 300);
      setTimeout(() => (oscillator.frequency.value = 1200), 450);
      setTimeout(() => oscillator.stop(), 700);
      break;

    case 2: // PIERCING ALARM BEEPS
      oscillator.type = "square";
      oscillator.frequency.value = 1800;
      oscillator.start();
      setTimeout(() => (gainNode.gain.value = 0), 60);
      setTimeout(() => (gainNode.gain.value = 1.0), 80);
      setTimeout(() => (gainNode.gain.value = 0), 140);
      setTimeout(() => (gainNode.gain.value = 1.0), 160);
      setTimeout(() => (gainNode.gain.value = 0), 220);
      setTimeout(() => (gainNode.gain.value = 1.0), 240);
      setTimeout(() => oscillator.stop(), 700);
      break;

    case 3: // DRAMATIC DESCENDING SCREAM
      oscillator.type = "sawtooth";
      oscillator.frequency.value = 2400;
      oscillator.start();
      setTimeout(() => (oscillator.frequency.value = 1800), 100);
      setTimeout(() => (oscillator.frequency.value = 1200), 200);
      setTimeout(() => (oscillator.frequency.value = 600), 300);
      setTimeout(() => (oscillator.frequency.value = 300), 400);
      setTimeout(() => oscillator.stop(), 700);
      break;

    case 4: // RAPID FIRE BEEPS
      oscillator.type = "square";
      oscillator.frequency.value = 1500;
      oscillator.start();
      setTimeout(() => (gainNode.gain.value = 0), 50);
      setTimeout(() => (gainNode.gain.value = 1.0), 70);
      setTimeout(() => (gainNode.gain.value = 0), 120);
      setTimeout(() => (gainNode.gain.value = 1.0), 140);
      setTimeout(() => (gainNode.gain.value = 0), 190);
      setTimeout(() => (gainNode.gain.value = 1.0), 210);
      setTimeout(() => (gainNode.gain.value = 0), 260);
      setTimeout(() => (gainNode.gain.value = 1.0), 280);
      setTimeout(() => oscillator.stop(), 700);
      break;

    case 5: // DUAL TONE HORROR
      oscillator.type = "square";
      oscillator.frequency.value = 1800;
      oscillator.start();
      setTimeout(() => (oscillator.frequency.value = 600), 120);
      setTimeout(() => (oscillator.frequency.value = 1800), 240);
      setTimeout(() => (oscillator.frequency.value = 600), 360);
      setTimeout(() => (oscillator.frequency.value = 1800), 480);
      setTimeout(() => oscillator.stop(), 700);
      break;

    case 6: // CHAOTIC WARBLE
      oscillator.type = "sawtooth";
      oscillator.frequency.value = 1000;
      oscillator.start();
      setTimeout(() => (oscillator.frequency.value = 1600), 80);
      setTimeout(() => (oscillator.frequency.value = 800), 160);
      setTimeout(() => (oscillator.frequency.value = 1800), 240);
      setTimeout(() => (oscillator.frequency.value = 600), 320);
      setTimeout(() => (oscillator.frequency.value = 2000), 400);
      setTimeout(() => (oscillator.frequency.value = 500), 480);
      setTimeout(() => oscillator.stop(), 700);
      break;
  }
}

/**
 * Shows fullscreen red alert overlay with BRUTAL wake-up mechanics
 */
function showOffTaskAlert(snapshot: ScreenSnapshot) {
  // Don't create duplicate alerts
  if (alertElement) return;

  // Generate random puzzle for verification
  const puzzle = generatePuzzle();
  let clickCount = 0;
  const requiredClicks = 10;

  alertElement = document.createElement("div");
  alertElement.id = "focus-tracker-alert";
  alertElement.innerHTML = `
    <div class="focus-alert-content">
      <div class="focus-alert-icon">🚨</div>
      <h1 class="focus-alert-title">OFF TASK DETECTED</h1>
      <p class="focus-alert-message">
        ${snapshot.context?.visualVerification?.detectedContent || "STOP SLACKING OFF!"}
      </p>
      <div class="focus-alert-details">
        ${snapshot.context?.visualVerification?.reasoning || "You are wasting time!"}
      </div>
      <div id="wake-up-challenge">
        <p class="challenge-text">Click "I'M AWAKE" ${requiredClicks} times to continue:</p>
        <p class="click-counter" id="click-counter">0 / ${requiredClicks}</p>
        <button id="focus-alert-click" class="focus-alert-btn pulse-btn">
          I'M AWAKE!
        </button>
      </div>
      <div id="captcha-challenge" style="display: none;">
        <p class="challenge-text">Solve this to prove you're conscious:</p>
        <p class="puzzle-type-badge">${puzzle.type.toUpperCase()}</p>
        <p class="math-problem">${puzzle.question}</p>
        <input type="text" id="captcha-input" class="captcha-input" placeholder="Answer">
        <button id="captcha-submit" class="focus-alert-btn">
          SUBMIT
        </button>
        <p id="captcha-error" class="captcha-error"></p>
      </div>
    </div>
  `;

  // Inject styles
  const style = document.createElement("style");
  style.textContent = `
    #focus-tracker-alert {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(255, 0, 0, 1);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: flashingRed 0.3s infinite, borderPulse 0.5s infinite;
      backdrop-filter: blur(10px);
      box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.8);
    }

    @keyframes flashingRed {
      0% {
        background: rgba(255, 0, 0, 1);
        box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.8), 0 0 50px rgba(255, 0, 0, 1);
      }
      25% {
        background: rgba(139, 0, 0, 1);
        box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.9), 0 0 30px rgba(139, 0, 0, 1);
      }
      50% {
        background: rgba(220, 38, 38, 1);
        box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.7), 0 0 60px rgba(220, 38, 38, 1);
      }
      75% {
        background: rgba(185, 28, 28, 1);
        box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.85), 0 0 40px rgba(185, 28, 28, 1);
      }
      100% {
        background: rgba(255, 0, 0, 1);
        box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.8), 0 0 50px rgba(255, 0, 0, 1);
      }
    }

    @keyframes borderPulse {
      0%, 100% {
        border: 20px solid rgba(255, 255, 255, 0.9);
      }
      50% {
        border: 20px solid rgba(255, 255, 0, 0.9);
      }
    }

    .focus-alert-content {
      text-align: center;
      color: white;
      max-width: 600px;
      padding: 40px;
      animation: shake 0.5s infinite;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }

    .focus-alert-icon {
      font-size: 120px;
      animation: bounce 1s infinite;
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }

    .focus-alert-title {
      font-size: 48px;
      font-weight: 900;
      margin: 20px 0;
      text-shadow: 0 0 20px rgba(0,0,0,0.5);
      letter-spacing: 4px;
    }

    .focus-alert-message {
      font-size: 24px;
      margin: 20px 0;
      font-weight: 600;
    }

    .focus-alert-details {
      font-size: 18px;
      margin: 20px 0;
      opacity: 0.9;
    }

    .focus-alert-btn {
      background: white;
      color: #dc2626;
      border: none;
      padding: 20px 40px;
      font-size: 20px;
      font-weight: 900;
      border-radius: 10px;
      cursor: pointer;
      margin-top: 30px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      transition: transform 0.1s;
    }

    .focus-alert-btn:hover {
      transform: scale(1.05);
    }

    .focus-alert-btn:active {
      transform: scale(0.95);
    }

    .pulse-btn {
      animation: pulse 0.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }

    .challenge-text {
      font-size: 20px;
      margin: 20px 0;
      font-weight: bold;
    }

    .click-counter {
      font-size: 36px;
      font-weight: 900;
      margin: 20px 0;
      color: #ffff00;
      text-shadow: 0 0 10px rgba(255,255,0,0.8);
    }

    .puzzle-type-badge {
      display: inline-block;
      background: rgba(255, 255, 255, 0.2);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 15px;
      letter-spacing: 2px;
    }

    .math-problem {
      font-size: 32px;
      font-weight: 900;
      margin: 30px 0;
      color: #ffff00;
      line-height: 1.5;
    }

    .captcha-input {
      font-size: 32px;
      padding: 15px;
      width: 200px;
      text-align: center;
      border: 3px solid white;
      border-radius: 10px;
      margin: 20px 0;
    }

    .captcha-error {
      color: #ffff00;
      font-size: 20px;
      font-weight: bold;
      margin-top: 10px;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(alertElement);

  // LOCK THE TAB - User cannot escape until puzzle is solved
  chrome.runtime.sendMessage({ type: "ALERT_TRIGGERED" });

  // Play BRUTAL alarm sound repeatedly - FAST AS HELL
  playAlarmSound();
  const alarmInterval = setInterval(playAlarmSound, 500); // SUPER FAST = MAXIMUM PAIN

  // Handle "I'M AWAKE" button clicks
  const clickBtn = document.getElementById("focus-alert-click");
  const clickCounter = document.getElementById("click-counter");
  const wakeUpChallenge = document.getElementById("wake-up-challenge");
  const captchaChallenge = document.getElementById("captcha-challenge");

  clickBtn?.addEventListener("click", () => {
    clickCount++;
    if (clickCounter) {
      clickCounter.textContent = `${clickCount} / ${requiredClicks}`;
    }

    if (clickCount >= requiredClicks) {
      // Move to captcha challenge
      if (wakeUpChallenge) wakeUpChallenge.style.display = "none";
      if (captchaChallenge) captchaChallenge.style.display = "block";
    }
  });

  // Handle captcha submission
  const captchaSubmit = document.getElementById("captcha-submit");
  const captchaInput = document.getElementById("captcha-input") as HTMLInputElement;
  const captchaError = document.getElementById("captcha-error");

  const checkCaptcha = () => {
    const userAnswer = (captchaInput?.value || "").trim().toLowerCase();
    const correctAnswer = puzzle.answer.toLowerCase();

    if (userAnswer === correctAnswer) {
      // SUCCESS! Close this tab and switch to last on-task tab
      clearInterval(alarmInterval);
      alertElement?.remove();
      alertElement = null;

      // Tell background to unlock tabs and close this one
      chrome.runtime.sendMessage({ type: "CLOSE_OFF_TASK_TAB" });
    } else {
      // WRONG! Try again
      if (captchaError) {
        captchaError.textContent = "WRONG! Try again and WAKE UP!";
      }
      if (captchaInput) {
        captchaInput.value = "";
        captchaInput.focus();
      }
    }
  };

  captchaSubmit?.addEventListener("click", checkCaptcha);
  captchaInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      checkCaptcha();
    }
  });

  // Focus the input when captcha appears
  const observer = new MutationObserver(() => {
    if (captchaChallenge && captchaChallenge.style.display !== "none") {
      captchaInput?.focus();
    }
  });

  if (captchaChallenge) {
    observer.observe(captchaChallenge, { attributes: true, attributeFilter: ["style"] });
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === "SCREEN_SNAPSHOT") {
    const snapshot = message.payload as ScreenSnapshot;

    // Forward to the actual web page via window.postMessage
    window.postMessage(
      {
        type: "SCREEN_SNAPSHOT",
        payload: snapshot,
      },
      "*"
    );
    console.log("[Content Script] Forwarded SCREEN_SNAPSHOT to page");

    // Check if user is off-task with high confidence
    console.log("[Content Script] Checking alert conditions:", {
      state: snapshot.state,
      confidence: snapshot.confidence,
      hasVision: !!snapshot.context?.visualVerification,
      recommendation: snapshot.context?.visualVerification?.recommendation,
      appCategory: snapshot.context?.appCategory,
    });

    // AGGRESSIVE MODE: Trigger alert for known off-task categories immediately
    // OR if vision AI says "focus"
    const shouldTriggerAlert =
      snapshot.state === "off_task" &&
      snapshot.confidence >= 0.8 &&
      // Trigger immediately for known distracting categories
      (snapshot.context?.appCategory === "social" ||
        snapshot.context?.appCategory === "sports" ||
        snapshot.context?.appCategory === "games" ||
        snapshot.context?.appCategory === "shopping" ||
        snapshot.context?.appCategory === "video" ||
        // OR if vision verification confirms off-task
        snapshot.context?.visualVerification?.recommendation === "focus");

    if (shouldTriggerAlert) {
      console.log("[Content Script] ⚠️⚠️⚠️ OFF-TASK DETECTED - TRIGGERING NUCLEAR ALERT ⚠️⚠️⚠️");

      // Clear any existing timeout
      if (alarmTimeout) {
        clearTimeout(alarmTimeout);
      }

      // Delay alert slightly to avoid spam
      alarmTimeout = setTimeout(() => {
        showOffTaskAlert(snapshot);
      }, 1000) as unknown as number;
    } else {
      console.log("[Content Script] Alert NOT triggered - conditions not met");
    }
  }
});

// Listen for requests from the web app to get the last snapshot
window.addEventListener("message", async (event) => {
  // Only accept messages from same origin
  if (event.source !== window) return;

  if (event.data.type === "GET_SCREEN_SNAPSHOT") {
    console.log("[Content Script] Received GET_SCREEN_SNAPSHOT request");

    // Read from chrome.storage.local
    const result = await chrome.storage.local.get("lastSnapshot");
    const snapshot = result.lastSnapshot as ScreenSnapshot | undefined;

    if (snapshot) {
      window.postMessage(
        {
          type: "SCREEN_SNAPSHOT",
          payload: snapshot,
        },
        "*"
      );
      console.log("[Content Script] Sent stored snapshot to page");
    } else {
      console.log("[Content Script] No snapshot available in storage");
    }
  }
});

// web app will listen for SCREEN_SNAPSHOT on window
// Example web app code:
// window.addEventListener("message", (event) => {
//   if (event.data.type === "SCREEN_SNAPSHOT") {
//     const snapshot = event.data.payload;
//     // consume snapshot here
//   }
// });

// To request the last snapshot from the web app:
// window.postMessage({ type: "GET_SCREEN_SNAPSHOT" }, "*");
