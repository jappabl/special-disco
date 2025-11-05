export type ScreenState = "on_task" | "off_task";

export type AppCategory =
  | "code"
  | "docs"
  | "video"
  | "social"
  | "games"
  | "shopping"
  | "sports"
  | "news"
  | "other";

export type SessionContext = {
  workTask: string; // User's declared task (e.g., "working on Python project", "shopping for furniture")
  timestamp: number;
  declared: boolean;
};

export type ScreenSnapshot = {
  t: number;
  state: ScreenState;
  confidence: number;
  context?: {
    activeUrl?: string;
    activeTitle?: string;
    appCategory?: AppCategory;
    idleMs?: number;
    // Session context - what user is working on
    sessionContext?: SessionContext;
    // Network tracking
    backgroundDomains?: string[]; // domains loaded in background
    requestCount?: number; // total requests in time window
    suspiciousPatterns?: string[]; // AI-detected off-task patterns
    offTaskDomains?: string[]; // domains classified as off-task
    // Visual verification (when screenshot was taken)
    visualVerification?: {
      verified: boolean; // was visual verification performed?
      isOffTask: boolean;
      confidence: number;
      detectedContent: string; // what AI saw on screen
      reasoning: string;
      recommendation: "focus" | "warning" | "ok";
    };
  };
};
