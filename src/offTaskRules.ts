import { AppCategory, ScreenState, ScreenSnapshot } from "./shared/types";

// Domain to category mapping - edit this to customize categorization
const DOMAIN_MAP: Record<string, AppCategory> = {
  // Code
  "github.com": "code",
  "stackoverflow.com": "code",
  "gitlab.com": "code",
  "replit.com": "code",
  "codepen.io": "code",
  "codesandbox.io": "code",

  // Docs
  "developer.mozilla.org": "docs",
  "docs.microsoft.com": "docs",
  "docs.python.org": "docs",
  "docs.rs": "docs",
  "doc.rust-lang.org": "docs",
  "reactjs.org": "docs",
  "nodejs.org": "docs",

  // Video
  "youtube.com": "video",
  "twitch.tv": "video",
  "netflix.com": "video",
  "hulu.com": "video",
  "vimeo.com": "video",

  // Social
  "twitter.com": "social",
  "x.com": "social",
  "facebook.com": "social",
  "instagram.com": "social",
  "reddit.com": "social",
  "linkedin.com": "social",
  "discord.com": "social",
  "slack.com": "social",

  // Games
  "chess.com": "games",
  "lichess.org": "games",
  "miniclip.com": "games",
  "pogo.com": "games",

  // Shopping
  "amazon.com": "shopping",
  "ebay.com": "shopping",
  "etsy.com": "shopping",
  "shopify.com": "shopping",

  // Sports (BASKETBALL IS NOT WORK BRO)
  "espn.com": "sports",
  "nba.com": "sports",
  "nfl.com": "sports",
  "mlb.com": "sports",
  "nhl.com": "sports",
  "sports.yahoo.com": "sports",
  "bleacherreport.com": "sports",
  "cbssports.com": "sports",
  "si.com": "sports",
  "foxsports.com": "sports",

  // News
  "cnn.com": "news",
  "bbc.com": "news",
  "nytimes.com": "news",
  "washingtonpost.com": "news",
  "theguardian.com": "news",
  "reuters.com": "news",
};

// Rules for idle threshold
const IDLE_THRESHOLD_MS = 60_000; // 60 seconds

// Categories considered off-task by default
const OFF_TASK_CATEGORIES: Set<AppCategory> = new Set([
  "video",
  "social",
  "games",
  "shopping",
  "sports", // STOP WATCHING BASKETBALL
  "news", // News is distraction too
]);

/**
 * Extracts domain from a URL
 */
function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Categorizes a URL into an AppCategory
 */
export function categorizeUrl(url: string): AppCategory {
  const domain = extractDomain(url);
  if (!domain) return "other";

  // Check exact match first
  if (domain in DOMAIN_MAP) {
    return DOMAIN_MAP[domain];
  }

  // Check if any mapped domain is a suffix of current domain
  // e.g., "www.youtube.com" matches "youtube.com"
  for (const [mappedDomain, category] of Object.entries(DOMAIN_MAP)) {
    if (domain.endsWith(`.${mappedDomain}`) || domain === mappedDomain) {
      return category;
    }
  }

  return "other";
}

/**
 * Determines if the user is on-task or off-task based on:
 * - App category
 * - Idle time
 */
export function determineScreenState(
  category: AppCategory,
  idleMs: number
): { state: ScreenState; confidence: number } {
  // High confidence off-task if user is idle
  if (idleMs >= IDLE_THRESHOLD_MS) {
    return { state: "off_task", confidence: 0.9 };
  }

  // Off-task if in a known distraction category
  if (OFF_TASK_CATEGORIES.has(category)) {
    return { state: "off_task", confidence: 0.8 };
  }

  // Default to on-task for code/docs/other
  return { state: "on_task", confidence: 0.7 };
}

/**
 * Builds a complete ScreenSnapshot from active tab info and idle state
 */
export function buildScreenSnapshot(url: string, title: string, idleMs: number): ScreenSnapshot {
  const category = categorizeUrl(url);
  const { state, confidence } = determineScreenState(category, idleMs);

  return {
    t: Date.now(),
    state,
    confidence,
    context: {
      activeUrl: url,
      activeTitle: title,
      appCategory: category,
      idleMs,
    },
  };
}
