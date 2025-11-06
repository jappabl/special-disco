import { ScreenSnapshot, SessionContext } from "./shared/types";
import { generatePuzzle, type Puzzle } from "./puzzles";

// Get DOM elements
const statusIndicator = document.getElementById("status-indicator")!;
const statusText = document.getElementById("status-text")!;
const currentState = document.getElementById("current-state")!;
const confidence = document.getElementById("confidence")!;
const activeUrl = document.getElementById("active-url")!;
const bgDomains = document.getElementById("bg-domains")!;
const requestCount = document.getElementById("request-count")!;
const alertSection = document.getElementById("alert-section")!;
const alertMessage = document.getElementById("alert-message")!;
const lastUpdate = document.getElementById("last-update")!;
const refreshBtn = document.getElementById("refresh-btn")!;
const disableBtn = document.getElementById("disable-btn")!;
const enableBtn = document.getElementById("enable-btn")!;
const analyticsBtn = document.getElementById("analytics-btn")!;

// Session context elements
const currentTaskDisplay = document.getElementById("current-task")!;
const setTaskBtn = document.getElementById("set-task-btn")!;
const taskModal = document.getElementById("task-modal")!;
const taskInput = document.getElementById("task-input") as HTMLInputElement;
const submitTaskBtn = document.getElementById("submit-task")!;
const cancelTaskBtn = document.getElementById("cancel-task")!;

// Puzzle modal elements
const puzzleModal = document.getElementById("puzzle-modal")!;
const puzzleType = document.getElementById("puzzle-type")!;
const puzzleQuestion = document.getElementById("puzzle-question")!;
const puzzleAnswer = document.getElementById("puzzle-answer") as HTMLInputElement;
const puzzleFeedback = document.getElementById("puzzle-feedback")!;
const puzzlesRemaining = document.getElementById("puzzles-remaining")!;
const submitPuzzleBtn = document.getElementById("submit-puzzle")!;
const cancelPuzzlesBtn = document.getElementById("cancel-puzzles")!;

/**
 * Formats a URL to be more readable (truncates long URLs)
 */
function formatUrl(url: string): string {
  if (url.length > 50) {
    return url.substring(0, 47) + "...";
  }
  return url;
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay = 150) {
  let timeoutId: number | undefined;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Updates the UI with the latest snapshot
 */
function updateUI(snapshot: ScreenSnapshot) {
  // Update status indicator
  statusIndicator.className = `status-indicator ${snapshot.state.replace("_", "-")}`;

  if (snapshot.state === "on_task") {
    statusText.textContent = "On Task";
  } else {
    statusText.textContent = "Off Task";
  }

  // Update stats
  currentState.textContent = snapshot.state === "on_task" ? "Focused" : "Distracted";
  confidence.textContent = `${Math.round(snapshot.confidence * 100)}%`;

  // Update details
  activeUrl.textContent = formatUrl(snapshot.context?.activeUrl || "Unknown");
  bgDomains.textContent = snapshot.context?.backgroundDomains?.length
    ? `${snapshot.context.backgroundDomains.length} domains`
    : "None";
  requestCount.textContent = String(snapshot.context?.requestCount || 0);

  // Update alert section
  if (
    snapshot.context?.visualVerification?.recommendation === "focus" ||
    snapshot.context?.suspiciousPatterns?.length
  ) {
    alertSection.classList.remove("hidden");

    if (snapshot.context.visualVerification?.recommendation === "focus") {
      alertMessage.textContent = `Focus Alert: ${snapshot.context.visualVerification.detectedContent}`;
    } else if (snapshot.context.suspiciousPatterns?.length) {
      alertMessage.textContent = snapshot.context.suspiciousPatterns.join(", ");
    }
  } else {
    alertSection.classList.add("hidden");
  }

  // Update last update time
  const now = new Date(snapshot.t);
  lastUpdate.textContent = `Last update: ${now.toLocaleTimeString()}`;
}

/**
 * Loads the latest snapshot from storage
 */
async function loadSnapshot() {
  try {
    const result = await chrome.storage.local.get(["lastSnapshot", "extensionDisabled"]);
    const snapshot = result.lastSnapshot as ScreenSnapshot | undefined;
    const isDisabled = result.extensionDisabled as boolean | undefined;

    // Show/hide enable/disable buttons based on state
    if (isDisabled) {
      disableBtn.classList.add("hidden");
      enableBtn.classList.remove("hidden");
      statusText.textContent = "Extension Disabled";
      statusIndicator.className = "status-indicator unknown";
    } else {
      disableBtn.classList.remove("hidden");
      enableBtn.classList.add("hidden");
    }

    if (snapshot) {
      updateUI(snapshot);
    } else {
      if (!isDisabled) {
        statusText.textContent = "No data yet";
      }
    }
  } catch (error) {
    console.error("[Popup] Error loading snapshot:", error);
    statusText.textContent = "Error loading data";
  }
}

// Session Context Management
async function loadSessionContext() {
  try {
    const result = await chrome.storage.local.get("sessionContext");
    const context = result.sessionContext as SessionContext | undefined;

    if (context && context.declared) {
      currentTaskDisplay.textContent = context.workTask;
    } else {
      currentTaskDisplay.textContent = "Not set";
    }
  } catch (error) {
    console.error("[Popup] Error loading session context:", error);
  }
}

function showTaskModal() {
  taskModal.classList.remove("hidden");

  // Load existing task if any
  chrome.storage.local.get("sessionContext", (result) => {
    const context = result.sessionContext as SessionContext | undefined;
    if (context && context.declared) {
      taskInput.value = context.workTask;
    }
  });

  taskInput.focus();
}

function hideTaskModal() {
  taskModal.classList.add("hidden");
  taskInput.value = "";
}

async function saveSessionContext() {
  const workTask = taskInput.value.trim();

  if (!workTask) {
    // Allow blank task - clear the context
    await chrome.storage.local.remove("sessionContext");
    currentTaskDisplay.textContent = "Not set";
    hideTaskModal();
    console.log("[Popup] Session context cleared - using default productivity context");
    return;
  }

  const context: SessionContext = {
    workTask,
    timestamp: Date.now(),
    declared: true,
  };

  await chrome.storage.local.set({ sessionContext: context });
  currentTaskDisplay.textContent = workTask;
  hideTaskModal();

  console.log("[Popup] Session context saved:", context);
}

// Load snapshot on popup open
loadSnapshot();

// Load and display current session context
loadSessionContext();

// Refresh button handler
refreshBtn.addEventListener("click", loadSnapshot);

// Listen for storage changes (real-time updates)
const debouncedSnapshotUpdate = debounce((snapshot: ScreenSnapshot) => {
  updateUI(snapshot);
}, 120);

chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
  if (areaName === "local" && changes.lastSnapshot?.newValue) {
    debouncedSnapshotUpdate(changes.lastSnapshot.newValue as ScreenSnapshot);
  }
});

// Puzzle Challenge System for Disbling Extension
let currentPuzzle: Puzzle | null = null;
let puzzlesSolved = 0;
const REQUIRED_PUZZLES = 10;

function showPuzzleModal() {
  puzzleModal.classList.remove("hidden");
  puzzlesSolved = 0;
  void loadNextPuzzle();
  puzzleAnswer.focus();
}

function hidePuzzleModal() {
  puzzleModal.classList.add("hidden");
  currentPuzzle = null;
  puzzleAnswer.value = "";
  puzzleFeedback.textContent = "";
  puzzleFeedback.className = "puzzle-feedback";
}

async function loadNextPuzzle() {
  currentPuzzle = null;
  puzzleAnswer.value = "";
  puzzleFeedback.textContent = "";
  puzzleFeedback.className = "puzzle-feedback";
  puzzlesRemaining.textContent = String(REQUIRED_PUZZLES - puzzlesSolved);
  puzzleType.textContent = "LOADING";
  puzzleQuestion.textContent = "Generating challenge...";
  submitPuzzleBtn.setAttribute("disabled", "true");

  try {
    const puzzle = await generatePuzzle();
    currentPuzzle = puzzle;
    puzzleType.textContent = puzzle.type.toUpperCase();
    puzzleQuestion.textContent = puzzle.question;
    submitPuzzleBtn.removeAttribute("disabled");
    puzzleAnswer.focus();
  } catch (error) {
    console.error("[Popup] Failed to load puzzle:", error);
    currentPuzzle = {
      question: "25 - 9 = ?",
      answer: "16",
      type: "math",
    };
    puzzleType.textContent = "MATH";
    puzzleQuestion.textContent = currentPuzzle.question;
    puzzleFeedback.textContent = "Using fallback puzzle. Continue solving to proceed.";
    puzzleFeedback.className = "puzzle-feedback incorrect";
    submitPuzzleBtn.removeAttribute("disabled");
    puzzleAnswer.focus();
  }
}

function checkPuzzleAnswer() {
  if (!currentPuzzle) return;

  const userAnswer = puzzleAnswer.value.trim().toLowerCase();
  const correctAnswer = currentPuzzle.answer.toLowerCase();

  if (userAnswer === correctAnswer) {
    // CORRECT!
    puzzlesSolved++;
    puzzleFeedback.textContent = "Correct!";
    puzzleFeedback.className = "puzzle-feedback correct";

    if (puzzlesSolved >= REQUIRED_PUZZLES) {
      // All puzzles solved - disable extension
      setTimeout(() => {
        chrome.storage.local.set({ extensionDisabled: true }, () => {
          alert("Extension disabled. Reload to re-enable.");
          hidePuzzleModal();
        });
      }, 500);
    } else {
      // Load next puzzle
      setTimeout(() => {
        void loadNextPuzzle();
      }, 800);
    }
  } else {
    // WRONG!
    puzzleFeedback.textContent = "Wrong! Try again.";
    puzzleFeedback.className = "puzzle-feedback incorrect";
    puzzleAnswer.value = "";
    puzzleAnswer.focus();
  }
}

// Disable button handler
disableBtn.addEventListener("click", () => {
  showPuzzleModal();
});

// Submit puzzle button handler
submitPuzzleBtn.addEventListener("click", () => {
  checkPuzzleAnswer();
});

// Enter key handler for puzzle input
puzzleAnswer.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    checkPuzzleAnswer();
  }
});

// Cancel button handler
cancelPuzzlesBtn.addEventListener("click", () => {
  hidePuzzleModal();
});

// Re-enable button handler
enableBtn.addEventListener("click", () => {
  chrome.storage.local.remove("extensionDisabled", () => {
    alert("Extension re-enabled! Refresh any open tabs to activate.");
    loadSnapshot(); // Refresh UI to show disable button again
  });
});

// Set task button handler
setTaskBtn.addEventListener("click", () => {
  showTaskModal();
});

// Submit task button handler
submitTaskBtn.addEventListener("click", () => {
  saveSessionContext();
});

// Cancel task button handler
cancelTaskBtn.addEventListener("click", () => {
  hideTaskModal();
});

// Enter key handler for task input
taskInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    saveSessionContext();
  }
});

// Analytics button handler - open analytics dashboard in new tab
analyticsBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/analytics.html") });
});

// Load tracking settings and add toggle handlers
import { getTrackingSettings, saveTrackingSettings } from "./trackingSettings";
import { TrackingSettings } from "./shared/types";

// Check if we have tracking toggle elements (newer UI)
const webTrackingToggle = document.getElementById("web-tracking-toggle") as HTMLInputElement | null;

if (webTrackingToggle) {
  // Initialize tracking settings
  getTrackingSettings().then(settings => {
    if (webTrackingToggle) {
      webTrackingToggle.checked = settings.webTrackingEnabled;
    }
  });

  // Save settings when changed
  async function saveTrackingToggles() {
    if (!webTrackingToggle) return;

    const settings: TrackingSettings = {
      webTrackingEnabled: webTrackingToggle.checked,
    };

    await saveTrackingSettings(settings);

    chrome.runtime.sendMessage({
      type: "TRACKING_SETTINGS_UPDATED",
      payload: settings,
    });

    console.log("[Popup] Tracking settings saved:", settings);
  }

  webTrackingToggle.addEventListener("change", saveTrackingToggles);
}
