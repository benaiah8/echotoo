import { isNativeApp } from "./storage/utils/capacitorDetection";

export type ShareUrlOutcome = "shared" | "clipboard" | "dismissed";

function isUserCancelledShareError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /cancel|dismiss|abort/i.test(msg);
}

/**
 * Share a URL: native uses `@capacitor/share`; web keeps `navigator.share` + clipboard fallback.
 */
export async function shareUrl(opts: {
  title: string;
  text?: string;
  url: string;
}): Promise<ShareUrlOutcome> {
  const { title, text, url } = opts;

  if (isNativeApp()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title,
        ...(text ? { text } : {}),
        url,
      });
      return "shared";
    } catch (e) {
      if (isUserCancelledShareError(e)) return "dismissed";
      try {
        await navigator.clipboard.writeText(url);
        return "clipboard";
      } catch {
        return "dismissed";
      }
    }
  }

  const shareData: ShareData = { title, url };
  try {
    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare(shareData)
    ) {
      await navigator.share(shareData);
      return "shared";
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return "dismissed";
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "clipboard";
  } catch {
    return "dismissed";
  }
}
