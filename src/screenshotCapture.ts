/**
 * Captures screenshots of active tab for visual verification
 */

/**
 * Captures a screenshot of the currently active tab
 * Returns a base64-encoded data URL of the visible tab
 */
export async function captureActiveTab(): Promise<string | null> {
  try {
    // Get the active tab
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab?.id) {
      console.error("[Screenshot] No active tab found");
      return null;
    }

    // Skip chrome:// pages (can't capture)
    if (
      activeTab.url?.startsWith("chrome://") ||
      activeTab.url?.startsWith("chrome-extension://")
    ) {
      console.log("[Screenshot] Cannot capture chrome:// or extension pages");
      return null;
    }

    // Capture visible tab as image
    const dataUrl = await chrome.tabs.captureVisibleTab({
      format: "jpeg",
      quality: 80, // Balance between quality and size
    });

    console.log("[Screenshot] Captured successfully");
    return dataUrl;
  } catch (error) {
    console.error("[Screenshot] Failed to capture:", error);
    return null;
  }
}

/**
 * Converts a data URL to a base64 string (removes the data:image/jpeg;base64, prefix)
 */
export function dataUrlToBase64(dataUrl: string): string {
  const base64Prefix = "data:image/jpeg;base64,";
  if (dataUrl.startsWith(base64Prefix)) {
    return dataUrl.slice(base64Prefix.length);
  }
  return dataUrl;
}

/**
 * Resizes an image to reduce API payload size (optional optimization)
 * Returns a new data URL with the resized image
 */
export async function resizeImage(dataUrl: string, maxWidth: number = 1280): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      // Resize if too large
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } else {
        resolve(dataUrl); // Fallback
      }
    };
    img.src = dataUrl;
  });
}
