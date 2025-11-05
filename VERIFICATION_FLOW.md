# Two-Tier Verification System

## Overview

This extension uses a sophisticated two-tier approach to detect off-task behavior:

1. **Tier 1**: Network traffic analysis (fast, cheap)
2. **Tier 2**: Visual screenshot verification (accurate, expensive)

## Flow Diagram

```
Every 5 seconds:
├─ Poll active tab (URL, title, idle state)
├─ Get network activity (last 30s of requests)
├─ Run domain classification (Claude AI, throttled to 60s)
│  └─ Classify background domains as on/off-task
│
├─ IF suspicious activity detected:
│  ├─ Take screenshot of active tab
│  ├─ Send to Claude Vision API
│  ├─ Get visual verification result
│  └─ Make final decision based on visual evidence
│
└─ Send ScreenSnapshot to web page
```

## Decision Logic

### Tier 1: Network Analysis

```typescript
Input: ["youtube.com", "googlevideo.com", "fonts.googleapis.com"]
Active tab: "github.com/user/project"

Claude AI Analysis:
- youtube.com → OFF-TASK (video streaming)
- googlevideo.com → OFF-TASK (YouTube CDN)
- fonts.googleapis.com → NEUTRAL (fonts CDN)

Patterns detected:
- "Video streaming detected: youtube.com"

Decision: SUSPICIOUS → Trigger Tier 2
```

### Tier 2: Visual Verification

```typescript
Input: Screenshot (base64 JPEG)
Context: "Video streaming detected: youtube.com"

Claude Vision Analysis:
Option A (Tutorial):
  "I see a programming tutorial about React hooks.
   The video title mentions 'useEffect explained'.
   Code examples are visible in the video."
  → Result: ON-TASK (confidence: 0.85)

Option B (Gaming):
  "I see Minecraft gameplay. The player is building
   a house in creative mode. No educational content."
  → Result: OFF-TASK (confidence: 0.95)
  → Recommendation: "focus"
```

## Final ScreenSnapshot

```typescript
{
  t: 1234567890,
  state: "off_task", // Determined by vision verification
  confidence: 0.95,   // High because vision confirmed
  context: {
    activeUrl: "youtube.com/watch?v=xyz",
    activeTitle: "Minecraft Let's Play",
    appCategory: "video",
    idleMs: 0,

    // Tier 1 results
    backgroundDomains: ["youtube.com", "googlevideo.com"],
    requestCount: 47,
    suspiciousPatterns: ["Video streaming detected"],
    offTaskDomains: ["youtube.com", "googlevideo.com"],

    // Tier 2 results
    visualVerification: {
      verified: true,
      isOffTask: true,
      confidence: 0.95,
      detectedContent: "YouTube video player showing Minecraft gameplay",
      reasoning: "User is watching gaming content",
      recommendation: "focus"
    }
  }
}
```

## Cost Optimization

### Network Analysis (Tier 1)
- **Frequency**: Every ~60 seconds (throttled)
- **Cost**: ~$0.003 per call (Claude Sonnet)
- **Cost per hour**: ~$0.18/hour

### Visual Verification (Tier 2)
- **Frequency**: Only when suspicious activity detected
- **Cost**: ~$0.01 per screenshot (Claude Sonnet + vision)
- **Trigger rate**: ~5-10% of checks (assuming mostly on-task)
- **Cost per hour**: ~$0.06/hour

**Total**: ~$0.24/hour or **$5.76/day** for 24/7 monitoring

## False Positive Handling

**Problem**: Network says "YouTube" → Assumes off-task

**Solution**: Vision verifies the actual content

Examples where vision saves the day:
1. YouTube tutorial → Network flags, vision approves ✅
2. GitHub with Twitter sidebar → Network flags, vision approves ✅
3. Stack Overflow with ads → Network flags, vision approves ✅

Examples where vision confirms:
1. YouTube gaming → Network flags, vision confirms ❌
2. Reddit browsing → Network flags, vision confirms ❌
3. Online shopping → Network flags, vision confirms ❌

## Integration with Web App

Your React app receives the complete snapshot:

```javascript
window.addEventListener("message", (event) => {
  if (event.data.type === "SCREEN_SNAPSHOT") {
    const snapshot = event.data.payload;

    // Check if visual verification was performed
    if (snapshot.context?.visualVerification?.verified) {
      const vision = snapshot.context.visualVerification;

      if (vision.recommendation === "focus") {
        // Show alert: "You're watching gaming content. Time to focus!"
        showFocusAlert(vision.detectedContent);
      }
    }

    // Combine with your webcam AttentionSnapshot
    fusionLayer.consume(snapshot);
  }
});
```

## Future Enhancements

1. **Throttle screenshots**: Only verify once per domain per session
2. **Cache results**: Remember "YouTube = tutorial" for this session
3. **User feedback**: Let user correct false positives to train better
4. **Local vision models**: Use smaller on-device models for cheaper verification
