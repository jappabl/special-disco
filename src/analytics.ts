/**
 * Analytics tracking system for user behavior
 * Stores all data locally using chrome.storage.local
 */

export interface AnalyticsEntry {
  timestamp: number;
  url: string;
  domain: string;
  title: string;
  state: "on_task" | "off_task";
  confidence: number;
  duration: number; // milliseconds on this page
  category?: string;
  detectedContent?: string;
  sessionContext?: string; // what the user was supposed to be working on
}

export interface AnalyticsSummary {
  totalTimeTracked: number; // total milliseconds tracked
  onTaskTime: number;
  offTaskTime: number;
  onTaskPercentage: number;

  // Top off-task domains
  topOffTaskDomains: Array<{
    domain: string;
    visits: number;
    totalTime: number;
    averageTime: number;
  }>;

  // Most common distractions
  topDistractions: Array<{
    content: string;
    count: number;
  }>;

  // Hourly breakdown
  hourlyActivity: Array<{
    hour: number; // 0-23
    onTaskTime: number;
    offTaskTime: number;
  }>;

  // Daily stats
  dailyStats: Array<{
    date: string; // YYYY-MM-DD
    onTaskTime: number;
    offTaskTime: number;
    alertsTriggered: number;
  }>;

  // Category breakdown
  categoryBreakdown: Array<{
    category: string;
    time: number;
    visits: number;
  }>;

  // Alert history
  totalAlerts: number;
  alertsThisWeek: number;
  averageAlertsPerDay: number;

  // Productivity streaks
  longestOnTaskStreak: number; // minutes
  currentStreak: number;

  // Most productive hours
  mostProductiveHour: number;
  leastProductiveHour: number;
}

/**
 * Records an analytics entry
 */
export async function recordAnalytics(entry: AnalyticsEntry): Promise<void> {
  try {
    const { analytics = [] } = await chrome.storage.local.get("analytics");
    analytics.push(entry);

    // Keep last 10,000 entries (roughly 1-2 weeks of data)
    if (analytics.length > 10000) {
      analytics.shift();
    }

    await chrome.storage.local.set({ analytics });
    console.log("[Analytics] Entry recorded:", entry);
  } catch (error) {
    console.error("[Analytics] Error recording entry:", error);
  }
}

/**
 * Records an alert trigger
 */
export async function recordAlert(url: string, reason: string): Promise<void> {
  try {
    const { alertHistory = [] } = await chrome.storage.local.get("alertHistory");
    alertHistory.push({
      timestamp: Date.now(),
      url,
      reason,
    });

    // Keep last 1000 alerts
    if (alertHistory.length > 1000) {
      alertHistory.shift();
    }

    await chrome.storage.local.set({ alertHistory });
    console.log("[Analytics] Alert recorded");
  } catch (error) {
    console.error("[Analytics] Error recording alert:", error);
  }
}

/**
 * Generates analytics summary from stored data
 */
export async function generateAnalyticsSummary(daysBack: number = 7): Promise<AnalyticsSummary> {
  const { analytics = [], alertHistory = [] } = await chrome.storage.local.get([
    "analytics",
    "alertHistory",
  ]);

  const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const recentEntries = analytics.filter((e: AnalyticsEntry) => e.timestamp >= cutoffTime);
  const recentAlerts = alertHistory.filter((a: any) => a.timestamp >= cutoffTime);

  // Calculate totals
  const totalTimeTracked = recentEntries.reduce(
    (sum: number, e: AnalyticsEntry) => sum + e.duration,
    0
  );
  const onTaskTime = recentEntries
    .filter((e: AnalyticsEntry) => e.state === "on_task")
    .reduce((sum: number, e: AnalyticsEntry) => sum + e.duration, 0);
  const offTaskTime = recentEntries
    .filter((e: AnalyticsEntry) => e.state === "off_task")
    .reduce((sum: number, e: AnalyticsEntry) => sum + e.duration, 0);

  // Top off-task domains
  const domainMap = new Map<string, { visits: number; totalTime: number }>();
  recentEntries
    .filter((e: AnalyticsEntry) => e.state === "off_task")
    .forEach((e: AnalyticsEntry) => {
      const existing = domainMap.get(e.domain) || { visits: 0, totalTime: 0 };
      domainMap.set(e.domain, {
        visits: existing.visits + 1,
        totalTime: existing.totalTime + e.duration,
      });
    });

  const topOffTaskDomains = Array.from(domainMap.entries())
    .map(([domain, data]) => ({
      domain,
      visits: data.visits,
      totalTime: data.totalTime,
      averageTime: data.totalTime / data.visits,
    }))
    .sort((a, b) => b.totalTime - a.totalTime)
    .slice(0, 10);

  // Top distractions (by domain)
  const distractionMap = new Map<string, number>();
  recentEntries
    .filter((e: AnalyticsEntry) => e.state === "off_task")
    .forEach((e: AnalyticsEntry) => {
      const domain = e.domain;
      distractionMap.set(domain, (distractionMap.get(domain) || 0) + 1);
    });

  const topDistractions = Array.from(distractionMap.entries())
    .map(([content, count]) => ({ content, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Hourly breakdown
  const hourlyMap = new Map<number, { onTask: number; offTask: number }>();
  recentEntries.forEach((e: AnalyticsEntry) => {
    const hour = new Date(e.timestamp).getHours();
    const existing = hourlyMap.get(hour) || { onTask: 0, offTask: 0 };
    if (e.state === "on_task") {
      existing.onTask += e.duration;
    } else {
      existing.offTask += e.duration;
    }
    hourlyMap.set(hour, existing);
  });

  const hourlyActivity = Array.from({ length: 24 }, (_, hour) => {
    const data = hourlyMap.get(hour) || { onTask: 0, offTask: 0 };
    return {
      hour,
      onTaskTime: data.onTask,
      offTaskTime: data.offTask,
    };
  });

  // Daily stats
  const dailyMap = new Map<string, { onTask: number; offTask: number; alerts: number }>();
  recentEntries.forEach((e: AnalyticsEntry) => {
    const date = new Date(e.timestamp).toISOString().split("T")[0];
    const existing = dailyMap.get(date) || { onTask: 0, offTask: 0, alerts: 0 };
    if (e.state === "on_task") {
      existing.onTask += e.duration;
    } else {
      existing.offTask += e.duration;
    }
    dailyMap.set(date, existing);
  });

  recentAlerts.forEach((a: any) => {
    const date = new Date(a.timestamp).toISOString().split("T")[0];
    const existing = dailyMap.get(date) || { onTask: 0, offTask: 0, alerts: 0 };
    existing.alerts++;
    dailyMap.set(date, existing);
  });

  const dailyStats = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      onTaskTime: data.onTask,
      offTaskTime: data.offTask,
      alertsTriggered: data.alerts,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Category breakdown (by domain)
  const categoryMap = new Map<string, { time: number; visits: number }>();
  recentEntries.forEach((e: AnalyticsEntry) => {
    const domain = e.domain;
    const existing = categoryMap.get(domain) || { time: 0, visits: 0 };
    categoryMap.set(domain, {
      time: existing.time + e.duration,
      visits: existing.visits + 1,
    });
  });

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      time: data.time,
      visits: data.visits,
    }))
    .sort((a, b) => b.time - a.time);

  // Find most/least productive hours
  let mostProductiveHour = 0;
  let leastProductiveHour = 0;
  let maxOnTaskTime = 0;
  let minOnTaskTime = Infinity;

  hourlyActivity.forEach((data) => {
    if (data.onTaskTime > maxOnTaskTime) {
      maxOnTaskTime = data.onTaskTime;
      mostProductiveHour = data.hour;
    }
    if (data.onTaskTime < minOnTaskTime && (data.onTaskTime > 0 || data.offTaskTime > 0)) {
      minOnTaskTime = data.onTaskTime;
      leastProductiveHour = data.hour;
    }
  });

  return {
    totalTimeTracked,
    onTaskTime,
    offTaskTime,
    onTaskPercentage: totalTimeTracked > 0 ? (onTaskTime / totalTimeTracked) * 100 : 0,
    topOffTaskDomains,
    topDistractions,
    hourlyActivity,
    dailyStats,
    categoryBreakdown,
    totalAlerts: alertHistory.length,
    alertsThisWeek: recentAlerts.length,
    averageAlertsPerDay: dailyStats.length > 0 ? recentAlerts.length / dailyStats.length : 0,
    longestOnTaskStreak: 0, // TODO: Calculate
    currentStreak: 0, // TODO: Calculate
    mostProductiveHour,
    leastProductiveHour,
  };
}

/**
 * Clears all analytics data
 */
export async function clearAnalytics(): Promise<void> {
  await chrome.storage.local.remove(["analytics", "alertHistory"]);
  console.log("[Analytics] All data cleared");
}
