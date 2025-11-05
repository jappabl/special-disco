/**
 * AI-powered URL classification using Claude API
 */

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export type DomainClassification = {
  domain: string;
  isOffTask: boolean;
  category: string;
  confidence: number;
  reasoning: string;
};

export type VisualVerification = {
  isOffTask: boolean;
  confidence: number;
  reasoning: string;
  detectedContent: string; // What the AI saw on screen
  recommendation: "focus" | "warning" | "ok";
};

/**
 * Classifies a batch of domains using Claude AI
 */
export async function classifyDomainsWithAI(
  domains: string[],
  activeTabUrl: string
): Promise<DomainClassification[]> {
  if (domains.length === 0) {
    return [];
  }

  const prompt = `You are analyzing browser network activity for productivity tracking.

Active tab URL: ${activeTabUrl}

Background domains being accessed:
${domains.map((d, i) => `${i + 1}. ${d}`).join("\n")}

For each domain, determine:
1. Is it off-task (distracting/unproductive)?
2. What category does it belong to?
3. Confidence level (0-1)
4. Brief reasoning

Consider:
- Context matters: YouTube embeds in coding tutorials = on-task, but youtube.com main page = off-task
- CDNs, analytics, ads are neutral (not off-task)
- Social media is usually off-task
- Shopping is usually off-task
- Gaming is off-task
- Developer tools, docs, GitHub, Stack Overflow = on-task

Return ONLY a JSON array (no markdown, no extra text), one object per domain:
[
  {
    "domain": "example.com",
    "isOffTask": false,
    "category": "cdn",
    "confidence": 0.9,
    "reasoning": "Content delivery network"
  }
]`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[AI Classifier] API error:", response.status);
      return [];
    }

    const data = await response.json();
    const content = data.content[0].text;

    // Parse JSON response
    const classifications = JSON.parse(content) as DomainClassification[];

    console.log("[AI Classifier] Classifications:", classifications);
    return classifications;
  } catch (error) {
    console.error("[AI Classifier] Error:", error);
    return [];
  }
}

/**
 * Analyzes patterns across domains to detect suspicious activity
 */
export function detectSuspiciousPatterns(
  classifications: DomainClassification[],
  activeTabUrl: string
): string[] {
  const patterns: string[] = [];
  const offTaskDomains = classifications.filter((c) => c.isOffTask);

  if (offTaskDomains.length === 0) {
    return patterns;
  }

  // Pattern: Multiple off-task domains while supposedly working
  if (offTaskDomains.length >= 3) {
    patterns.push(`${offTaskDomains.length} off-task domains active in background`);
  }

  // Pattern: Social media while on work site
  const socialDomains = offTaskDomains.filter(
    (c) => c.category === "social" || c.domain.includes("twitter") || c.domain.includes("facebook")
  );
  if (socialDomains.length > 0 && activeTabUrl.includes("github")) {
    patterns.push(
      `Social media (${socialDomains.map((d) => d.domain).join(", ")}) detected while on GitHub`
    );
  }

  // Pattern: Video streaming in background
  const videoDomains = offTaskDomains.filter(
    (c) => c.category === "video" || c.domain.includes("youtube") || c.domain.includes("twitch")
  );
  if (videoDomains.length > 0) {
    patterns.push(`Video streaming detected: ${videoDomains.map((d) => d.domain).join(", ")}`);
  }

  // Pattern: Shopping while working
  const shoppingDomains = offTaskDomains.filter((c) => c.category === "shopping");
  if (shoppingDomains.length > 0) {
    patterns.push(`Shopping activity detected: ${shoppingDomains.map((d) => d.domain).join(", ")}`);
  }

  return patterns;
}

/**
 * Verifies if screen content is on-task using Gemini Vision API (Flash model)
 * This is the secondary verification after network analysis flags suspicious activity
 * Uses Gemini Flash for 500x cheaper cost than Claude Vision
 */
export async function verifyScreenWithVision(
  screenshotBase64: string,
  activeTabUrl: string,
  suspiciousReason: string,
  userWorkTask?: string
): Promise<VisualVerification> {
  const workTaskContext = userWorkTask
    ? `\n- User's declared work task: "${userWorkTask}"\n- IMPORTANT: Judge content based on alignment with this specific task`
    : `\n- User has NOT declared a specific work task\n- Use default context: coding, documentation, research, writing = ON-TASK; social media, games, shopping, videos = OFF-TASK`;

  const prompt = `You are verifying if a user is on-task or distracted based on their screen content.

Context:
- Active tab URL: ${activeTabUrl}
- Why this was flagged: ${suspiciousReason}${workTaskContext}

Analyze the screenshot and determine:
1. What content is actually visible on screen?
2. Is this content on-task (work/study related) or off-task (distraction)?
3. Confidence level (0-1)
4. Should the user be warned to refocus?

Consider:
- If a SPECIFIC work task is declared, judge based on that context:
  - "Shopping for furniture" → furniture shopping sites = ON-TASK
  - "Researching NBA analytics" → sports sites = ON-TASK
  - "Learning video editing" → YouTube tutorials = ON-TASK
- If NO specific task is declared, use general productivity rules:
  - Coding, documentation, research, writing, learning = ON-TASK
  - Social media feeds, games, sports for entertainment, random shopping, entertainment videos = OFF-TASK

Return ONLY a JSON object (no markdown, no extra text):
{
  "isOffTask": true,
  "confidence": 0.95,
  "reasoning": "User is watching gaming content on YouTube",
  "detectedContent": "YouTube video player showing Minecraft gameplay",
  "recommendation": "focus"
}

Recommendation values:
- "focus": User is clearly off-task, needs to refocus
- "warning": Borderline off-task, mild warning
- "ok": Actually on-task despite network flags`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: screenshotBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      console.error("[AI Vision] Gemini API error:", response.status);
      const errorText = await response.text();
      console.error("[AI Vision] Error details:", errorText);
      // Fallback: assume network analysis was correct
      return {
        isOffTask: true,
        confidence: 0.5,
        reasoning: "Vision API unavailable, relying on network analysis",
        detectedContent: "Unable to analyze",
        recommendation: "warning",
      };
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error("[AI Vision] No content in Gemini response:", data);
      return {
        isOffTask: true,
        confidence: 0.5,
        reasoning: "Vision analysis failed - no content",
        detectedContent: "Unable to analyze",
        recommendation: "warning",
      };
    }

    // Gemini sometimes wraps JSON in markdown code blocks, clean it up
    const cleanedContent = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // Parse JSON response
    const verification = JSON.parse(cleanedContent) as VisualVerification;

    console.log("[AI Vision] Gemini verification result:", verification);
    return verification;
  } catch (error) {
    console.error("[AI Vision] Error:", error);
    // Fallback
    return {
      isOffTask: true,
      confidence: 0.5,
      reasoning: "Vision analysis failed",
      detectedContent: "Unable to analyze",
      recommendation: "warning",
    };
  }
}
