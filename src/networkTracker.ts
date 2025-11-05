/**
 * Tracks network requests and aggregates domain activity
 */

import {
  classifyDomainsWithAI,
  detectSuspiciousPatterns,
  DomainClassification,
} from "./aiClassifier";

// Time window for aggregating requests (30 seconds)
const TRACKING_WINDOW_MS = 30_000;

// How often to run AI classification (60 seconds)
const AI_CLASSIFICATION_INTERVAL_MS = 60_000;

type DomainActivity = {
  domain: string;
  count: number;
  lastSeen: number;
};

class NetworkTracker {
  private domainActivity: Map<string, DomainActivity> = new Map();
  private totalRequests = 0;
  private lastCleanup = Date.now();
  private lastAIClassification = 0;
  private cachedClassifications: DomainClassification[] = [];

  /**
   * Records a network request
   */
  recordRequest(url: string) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Skip Chrome internals and extensions
      if (domain.startsWith("chrome") || url.startsWith("chrome-extension://")) {
        return;
      }

      const now = Date.now();
      const existing = this.domainActivity.get(domain);

      if (existing) {
        existing.count++;
        existing.lastSeen = now;
      } else {
        this.domainActivity.set(domain, {
          domain,
          count: 1,
          lastSeen: now,
        });
      }

      this.totalRequests++;

      // Cleanup old entries periodically
      if (now - this.lastCleanup > TRACKING_WINDOW_MS) {
        this.cleanup();
      }
    } catch (_error) {
      // Invalid URL, ignore
    }
  }

  /**
   * Removes old domain activity outside the tracking window
   */
  private cleanup() {
    const now = Date.now();
    const cutoff = now - TRACKING_WINDOW_MS;

    for (const [domain, activity] of this.domainActivity.entries()) {
      if (activity.lastSeen < cutoff) {
        this.domainActivity.delete(domain);
      }
    }

    this.lastCleanup = now;
  }

  /**
   * Gets current domain activity snapshot
   */
  getSnapshot() {
    this.cleanup();
    return {
      domains: Array.from(this.domainActivity.keys()),
      requestCount: this.totalRequests,
      domainDetails: Array.from(this.domainActivity.values()),
    };
  }

  /**
   * Runs AI classification on current domains (throttled)
   */
  async classifyCurrentDomains(activeTabUrl: string): Promise<{
    classifications: DomainClassification[];
    patterns: string[];
    offTaskDomains: string[];
  }> {
    const now = Date.now();
    const snapshot = this.getSnapshot();

    // Skip if not enough activity
    if (snapshot.domains.length < 3) {
      return {
        classifications: [],
        patterns: [],
        offTaskDomains: [],
      };
    }

    // Throttle AI calls (only every 60s)
    if (now - this.lastAIClassification < AI_CLASSIFICATION_INTERVAL_MS) {
      // Return cached results
      const patterns = detectSuspiciousPatterns(this.cachedClassifications, activeTabUrl);
      const offTaskDomains = this.cachedClassifications
        .filter((c) => c.isOffTask)
        .map((c) => c.domain);

      return {
        classifications: this.cachedClassifications,
        patterns,
        offTaskDomains,
      };
    }

    // Run AI classification
    try {
      // Filter out the active tab domain (we already know about it)
      const activeTabDomain = new URL(activeTabUrl).hostname;
      const domainsToClassify = snapshot.domains.filter((d) => d !== activeTabDomain);

      if (domainsToClassify.length === 0) {
        return {
          classifications: [],
          patterns: [],
          offTaskDomains: [],
        };
      }

      console.log(`[Network Tracker] Classifying ${domainsToClassify.length} domains with AI`);

      const classifications = await classifyDomainsWithAI(domainsToClassify, activeTabUrl);

      this.cachedClassifications = classifications;
      this.lastAIClassification = now;

      const patterns = detectSuspiciousPatterns(classifications, activeTabUrl);
      const offTaskDomains = classifications.filter((c) => c.isOffTask).map((c) => c.domain);

      return {
        classifications,
        patterns,
        offTaskDomains,
      };
    } catch (error) {
      console.error("[Network Tracker] AI classification error:", error);
      return {
        classifications: [],
        patterns: [],
        offTaskDomains: [],
      };
    }
  }

  /**
   * Resets tracking state
   */
  reset() {
    this.domainActivity.clear();
    this.totalRequests = 0;
    this.cachedClassifications = [];
  }
}

// Singleton instance
export const networkTracker = new NetworkTracker();

/**
 * Initializes network request listener
 */
export function initNetworkTracking() {
  // Listen to all web requests
  chrome.webRequest.onBeforeRequest.addListener(
    (details): chrome.webRequest.BlockingResponse | undefined => {
      // Only track main_frame, sub_frame, xmlhttprequest, and other document requests
      if (
        details.type === "main_frame" ||
        details.type === "sub_frame" ||
        details.type === "xmlhttprequest" ||
        details.type === "script" ||
        details.type === "image" ||
        details.type === "media"
      ) {
        networkTracker.recordRequest(details.url);
      }
      return undefined;
    },
    { urls: ["<all_urls>"] }
  );

  console.log("[Network Tracker] Initialized");
}
