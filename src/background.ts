import { buildScreenSnapshot } from "./offTaskRules";
import { initNetworkTracking, networkTracker } from "./networkTracker";
import { ScreenSnapshot, SessionContext } from "./shared/types";
import { captureActiveTab, dataUrlToBase64 } from "./screenshotCapture";
import { verifyScreenWithVision } from "./aiClassifier";
import { recordAnalytics, recordAlert, AnalyticsEntry } from "./analytics";

const POLL_INTERVAL_MS = 30000; // 30 seconds - reduces AI costs significantly
const IDLE_DETECTION_INTERVAL_SEC = 15; // chrome.idle uses seconds
const VISION_CHECK_INTERVAL = 2; // Run vision AI every 2nd check (60 seconds)

// Tab locking state - prevents user from switching tabs when alert is active
let lockedTabId: number | null = null;

// Analytics tracking - track page visit duration
let lastPageUrl: string | null = null;
let lastPageStartTime: number | null = null;
let lastPageTitle: string | null = null;

// Vision throttling - track check count
let checkCounter = 0;

// Set idle detection interval
chrome.idle.setDetectionInterval(IDLE_DETECTION_INTERVAL_SEC);

/**
 * Gets the current idle state in milliseconds
 */
async function getIdleMs(): Promise<number> {
  return new Promise((resolve) => {
    chrome.idle.queryState(IDLE_DETECTION_INTERVAL_SEC, (state) => {
      if (state === "idle" || state === "locked") {
        // If idle, we don't know exact time, so return threshold
        resolve(IDLE_DETECTION_INTERVAL_SEC * 1000);
      } else {
        // Active state
        resolve(0);
      }
    });
  });
}

/**
 * Captures a snapshot of the active tab and sends it to content script
 */
async function captureAndSendSnapshot() {
  try {
    // Check if extension is disabled
    const { extensionDisabled } = await chrome.storage.local.get("extensionDisabled");
    if (extensionDisabled) {
      console.log("[Background] Extension is disabled, skipping snapshot");
      return;
    }

    // Get active tab
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab?.id || !activeTab.url) {
      console.log("[Background] No active tab found");
      return;
    }

    // Skip chrome:// and extension pages
    if (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("chrome-extension://")) {
      console.log("[Background] Skipping chrome:// or extension page");
      return;
    }

    const idleMs = await getIdleMs();
    const snapshot = buildScreenSnapshot(activeTab.url, activeTab.title || "", idleMs);

    // Get network tracking data
    const networkSnapshot = networkTracker.getSnapshot();

    // Run AI classification on background domains (throttled to ~60s)
    const aiAnalysis = await networkTracker.classifyCurrentDomains(activeTab.url);

    // Load session context (user's declared work task)
    const { sessionContext } = await chrome.storage.local.get("sessionContext");
    const userWorkTask = (sessionContext as SessionContext | undefined)?.declared
      ? (sessionContext as SessionContext).workTask
      : undefined;

    // Enhance snapshot with network data and session context
    const enhancedSnapshot: ScreenSnapshot = {
      ...snapshot,
      context: {
        ...snapshot.context,
        sessionContext: sessionContext as SessionContext | undefined,
        backgroundDomains: networkSnapshot.domains,
        requestCount: networkSnapshot.requestCount,
        suspiciousPatterns: aiAnalysis.patterns,
        offTaskDomains: aiAnalysis.offTaskDomains,
      },
    };

    // AUTO-FLAGGED DOMAINS: Always off-task regardless of content
    const AUTO_FLAGGED_DOMAINS = [
      "youtube.com",
      "reddit.com",
      "twitter.com",
      "x.com",
      "facebook.com",
      "instagram.com",
      "tiktok.com",
      "twitch.tv",
      "netflix.com",
      "hulu.com",
      "espn.com",
      "cnn.com",
      "nytimes.com",
      "buzzfeed.com",
      "9gag.com",
    ];

    let currentDomain = "";
    try {
      currentDomain = new URL(activeTab.url).hostname.replace("www.", "");
    } catch (e) {
      console.error("[Background] Failed to parse URL for domain check:", e);
    }

    const isAutoFlagged = AUTO_FLAGGED_DOMAINS.some((domain) => currentDomain.includes(domain));

    // VISION THROTTLING: Only run expensive AI checks periodically
    // BUT always run vision on auto-flagged domains (to get content description)
    checkCounter++;
    const shouldRunVision = isAutoFlagged || checkCounter % VISION_CHECK_INTERVAL === 0;

    // WEIGHTED AVERAGE CONFIDENCE SCORING
    // Vision typically returns 90-95% confidence, NOT 100%, so adjust accordingly
    // Vision weight: 60%, Domain: 40%
    // Threshold: 0.50 (50% weighted confidence triggers alert)
    const VISION_WEIGHT = 0.6; // Vision AI is powerful but not absolute
    const DOMAIN_WEIGHT = 0.4; // Domain auto-flagging has significant weight
    const OFF_TASK_THRESHOLD = 0.5; // 50% threshold - auto-flagged domains will trigger even if vision says on-task

    if (userWorkTask) {
      console.log(`[Background] User is working on: "${userWorkTask}"`);
    } else {
      console.log("[Background] No work task declared, using default productivity context");
    }

    let screenshot = null;
    if (shouldRunVision) {
      console.log(
        `[Background] Running vision AI check (${isAutoFlagged ? "auto-flagged domain" : `periodic check ${checkCounter}`})`
      );
      screenshot = await captureActiveTab();
    } else {
      console.log(
        `[Background] Skipping vision check (${checkCounter}) - using domain analysis only`
      );
    }
    if (screenshot) {
      const base64Image = dataUrlToBase64(screenshot);

      // Build context for vision AI
      const suspiciousReason =
        aiAnalysis.patterns.length > 0 || aiAnalysis.offTaskDomains.length > 0
          ? aiAnalysis.patterns.join("; ") ||
            `Off-task domains detected: ${aiAnalysis.offTaskDomains.join(", ")}`
          : "Routine check for off-task content (sports, social media, games, shopping, videos)";

      const visionResult = await verifyScreenWithVision(
        base64Image,
        activeTab.url,
        suspiciousReason,
        userWorkTask
      );

      // Add vision verification to context
      enhancedSnapshot.context!.visualVerification = {
        verified: true,
        isOffTask: visionResult.isOffTask,
        confidence: visionResult.confidence,
        detectedContent: visionResult.detectedContent,
        reasoning: visionResult.reasoning,
        recommendation: visionResult.recommendation,
      };

      // DOMAIN CONFIDENCE CALCULATION
      // Confidence that this domain is typically used for off-task activities
      let domainConfidence = 0.0; // Neutral baseline for unknown domains

      if (isAutoFlagged) {
        domainConfidence = 1.0; // 100% - auto-flagged always-off-task domain
        console.log(
          `[Background] 🚩 AUTO-FLAGGED DOMAIN: ${currentDomain} - Always considered off-task`
        );
      } else if (aiAnalysis.offTaskDomains.length > 0) {
        domainConfidence = 1.0; // 100% - known off-task domain
      } else if (aiAnalysis.patterns.length > 0) {
        domainConfidence = 0.6; // 60% - suspicious patterns
      }

      // VISION CONFIDENCE CALCULATION
      // Vision AI's confidence that content is off-task
      const visionConfidence = visionResult.isOffTask
        ? visionResult.confidence // Use AI's confidence directly (0.0 - 1.0)
        : 0.0; // 0% confidence it's off-task if vision says on-task

      // AUTO-FLAGGED DOMAINS OVERRIDE: Skip weighted scoring entirely
      let weightedScore: number;
      let finalState: "on_task" | "off_task";

      if (isAutoFlagged) {
        // Auto-flagged domains are ALWAYS off-task, no matter what vision says
        weightedScore = 0.95; // Fixed 95% confidence
        finalState = "off_task";
        console.log(`[Background] 🚩 AUTO-FLAGGED DOMAIN OVERRIDE: ${currentDomain}
  Vision said: ${visionResult.isOffTask ? "Off-task" : "On-task"} (${(visionConfidence * 100).toFixed(1)}%)
  Override: AUTO-FLAGGED domains are always off-task
  Final: OFF-TASK (95% confidence)`);
      } else {
        // Normal weighted scoring for non-auto-flagged domains
        weightedScore = visionConfidence * VISION_WEIGHT + domainConfidence * DOMAIN_WEIGHT;

        const domainReason =
          aiAnalysis.offTaskDomains.length > 0
            ? "Known off-task domain"
            : aiAnalysis.patterns.length > 0
              ? "Suspicious patterns"
              : "Unknown domain";

        console.log(`[Background] Confidence Analysis:
  Domain: ${(domainConfidence * 100).toFixed(1)}% (${domainReason})
  Vision: ${(visionConfidence * 100).toFixed(1)}% (${visionResult.isOffTask ? `Off-task: ${visionResult.detectedContent}` : "On-task"})
  Weighted: (${(visionConfidence * 100).toFixed(1)}% × ${VISION_WEIGHT}) + (${(domainConfidence * 100).toFixed(1)}% × ${DOMAIN_WEIGHT}) = ${(weightedScore * 100).toFixed(1)}%
  Threshold: ${(OFF_TASK_THRESHOLD * 100).toFixed(0)}%`);

        finalState = weightedScore >= OFF_TASK_THRESHOLD ? "off_task" : "on_task";
      }

      // Determine final state based on weighted score or auto-flag override
      if (finalState === "off_task") {
        enhancedSnapshot.state = "off_task";
        enhancedSnapshot.confidence = weightedScore;
        console.log(
          `[Background] 🚨 OFF-TASK DETECTED! Weighted: ${(weightedScore * 100).toFixed(1)}% >= ${(OFF_TASK_THRESHOLD * 100).toFixed(0)}% - ${visionResult.detectedContent}`
        );
      } else {
        enhancedSnapshot.state = "on_task";
        enhancedSnapshot.confidence = 1.0 - weightedScore;
        console.log(
          `[Background] ✓ On-task. Weighted: ${(weightedScore * 100).toFixed(1)}% < ${(OFF_TASK_THRESHOLD * 100).toFixed(0)}%`
        );
      }
    } else {
      // No vision check - use domain analysis only
      if (isAutoFlagged) {
        enhancedSnapshot.state = "off_task";
        enhancedSnapshot.confidence = 0.95;
        console.log(`[Background] 🚩 AUTO-FLAGGED DOMAIN (no vision): ${currentDomain} - OFF-TASK`);
      } else if (aiAnalysis.offTaskDomains.length > 0) {
        enhancedSnapshot.state = "off_task";
        enhancedSnapshot.confidence = 0.9;
        console.log("[Background] Known off-task domain (no vision) - OFF-TASK");
      } else if (aiAnalysis.patterns.length > 0) {
        // 60% domain confidence × 0.40 weight = 24%, below 50% threshold
        enhancedSnapshot.state = "on_task";
        enhancedSnapshot.confidence = 0.76;
        console.log(
          "[Background] Suspicious patterns but no vision - ON-TASK (waiting for vision check)"
        );
      } else {
        // Unknown domain, no vision - assume on-task
        enhancedSnapshot.state = "on_task";
        enhancedSnapshot.confidence = 1.0;
        console.log("[Background] Unknown domain (no vision) - ON-TASK");
      }
    }

    // ANALYTICS: Record every snapshot to track focused time continuously
    const currentUrl = activeTab.url;
    const currentTitle = activeTab.title || "";
    const now = Date.now();

    // Record analytics for the previous period (if we have tracking data)
    if (lastPageUrl && lastPageStartTime) {
      const duration = now - lastPageStartTime;

      // Extract domain from URL
      let domain = "unknown";
      try {
        domain = new URL(lastPageUrl).hostname;
      } catch (e) {
        console.error("[Background] Failed to parse URL for domain:", e);
      }

      const analyticsEntry: AnalyticsEntry = {
        timestamp: lastPageStartTime,
        url: lastPageUrl,
        domain,
        title: lastPageTitle || "",
        state: enhancedSnapshot.state,
        confidence: enhancedSnapshot.confidence,
        duration,
        category: enhancedSnapshot.context?.visualVerification?.detectedContent
          ?.split(",")[0]
          ?.trim(),
        detectedContent: enhancedSnapshot.context?.visualVerification?.detectedContent,
        sessionContext: (sessionContext as SessionContext | undefined)?.workTask,
      };

      await recordAnalytics(analyticsEntry);
      console.log(`[Analytics] Recorded ${enhancedSnapshot.state} for ${duration}ms on ${domain}`);

      // Record alert if off-task
      if (enhancedSnapshot.state === "off_task") {
        const reason =
          enhancedSnapshot.context?.visualVerification?.detectedContent ||
          enhancedSnapshot.context?.suspiciousPatterns?.join(", ") ||
          "Off-task behavior detected";
        await recordAlert(lastPageUrl, reason);
      }
    }

    // Update tracking variables for next snapshot
    lastPageUrl = currentUrl;
    lastPageStartTime = now;
    lastPageTitle = currentTitle;

    // Store in local storage for GET_SCREEN_SNAPSHOT requests
    await chrome.storage.local.set({ lastSnapshot: enhancedSnapshot });

    // Send to content script
    await chrome.tabs.sendMessage(activeTab.id, {
      type: "SCREEN_SNAPSHOT",
      payload: enhancedSnapshot,
    });

    console.log("[Background] Enhanced snapshot sent:", enhancedSnapshot);
  } catch (error) {
    console.error("[Background] Error capturing snapshot:", error);
  }
}

// Poll every N seconds
setInterval(() => {
  captureAndSendSnapshot();
}, POLL_INTERVAL_MS);

// Also capture immediately when tab updates (page load completes)
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    console.log("[Background] Tab completed loading, sending snapshot");
    captureAndSendSnapshot();
  }
});

// Capture when switching tabs (and enforce tab locking if active)
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log("[Background] Tab activated, sending snapshot");

  // If a tab is locked and user tries to switch away, force them back
  if (lockedTabId !== null && activeInfo.tabId !== lockedTabId) {
    console.log(`[Background] TAB LOCKED! Forcing back to tab ${lockedTabId}`);
    chrome.tabs.update(lockedTabId, { active: true });
    return; // Don't capture snapshot for the brief switch
  }

  captureAndSendSnapshot();
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  // Lock the tab when alert is triggered
  if (message.type === "ALERT_TRIGGERED") {
    lockedTabId = sender.tab?.id || null;
    console.log(
      `[Background] TAB LOCKED: ${lockedTabId} - User cannot escape until puzzle is solved`
    );
  }

  // Unlock tabs and close off-task tab when puzzle is completed
  if (message.type === "CLOSE_OFF_TASK_TAB") {
    console.log("[Background] Puzzle solved! Unlocking tabs and closing off-task tab");

    // UNLOCK TABS FIRST
    lockedTabId = null;

    // Close the current tab
    if (sender.tab?.id) {
      chrome.tabs.remove(sender.tab.id);
    }

    // Find and switch to the most recent on-task tab (GitHub, Stack Overflow, docs, etc.)
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const onTaskDomains = [
        "github.com",
        "stackoverflow.com",
        "gitlab.com",
        "docs.",
        "developer.mozilla.org",
        "localhost",
        "127.0.0.1",
        ".edu",
      ];

      // Find most recent on-task tab
      for (let i = tabs.length - 1; i >= 0; i--) {
        const tab = tabs[i];
        if (tab.url && onTaskDomains.some((domain) => tab.url!.includes(domain))) {
          chrome.tabs.update(tab.id!, { active: true });
          console.log(`[Background] Switched to on-task tab: ${tab.url}`);
          return;
        }
      }

      // If no on-task tab found, open a new tab with blank page
      console.log("[Background] No on-task tab found, opening new tab");
      chrome.tabs.create({ url: "about:blank", active: true });
    });
  }
});

// Initialize network tracking
initNetworkTracking();

// Initial capture on startup
captureAndSendSnapshot();

console.log("[Background] Service worker started with network tracking");
