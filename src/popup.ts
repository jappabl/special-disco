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

/**
 * Updates the UI with the latest snapshot
 */
function updateUI(snapshot: ScreenSnapshot) {
  // Update status indicator
  statusIndicator.className = `status-indicator ${snapshot.state.replace("_", "-")}`;

  if (snapshot.state === "on_task") {
    statusText.textContent = "On Task ✓";
  } else {
    statusText.textContent = "Off Task ⚠";
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
chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
  if (areaName === "local" && changes.lastSnapshot) {
    updateUI(changes.lastSnapshot.newValue);
  }
});

// Puzzle Challenge System for Disabling Extension
let currentPuzzle: Puzzle | null = null;
let puzzlesSolved = 0;
const REQUIRED_PUZZLES = 10;

function showPuzzleModal() {
  puzzleModal.classList.remove("hidden");
  puzzlesSolved = 0;
  loadNextPuzzle();
  puzzleAnswer.focus();
}

function hidePuzzleModal() {
  puzzleModal.classList.add("hidden");
  currentPuzzle = null;
  puzzleAnswer.value = "";
  puzzleFeedback.textContent = "";
  puzzleFeedback.className = "puzzle-feedback";
}

function loadNextPuzzle() {
  currentPuzzle = generatePuzzle();
  puzzleType.textContent = currentPuzzle.type.toUpperCase();
  puzzleQuestion.textContent = currentPuzzle.question;
  puzzleAnswer.value = "";
  puzzleFeedback.textContent = "";
  puzzleFeedback.className = "puzzle-feedback";
  puzzlesRemaining.textContent = String(REQUIRED_PUZZLES - puzzlesSolved);
  puzzleAnswer.focus();
}

function checkPuzzleAnswer() {
  if (!currentPuzzle) return;

  const userAnswer = puzzleAnswer.value.trim().toLowerCase();
  const correctAnswer = currentPuzzle.answer.toLowerCase();

  if (userAnswer === correctAnswer) {
    // CORRECT!
    puzzlesSolved++;
    puzzleFeedback.textContent = "✓ Correct!";
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
        loadNextPuzzle();
      }, 800);
    }
  } else {
    // WRONG!
    puzzleFeedback.textContent = "✗ Wrong! Try again.";
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
