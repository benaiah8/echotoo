import { isNativeApp } from "./storage/utils/capacitorDetection";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onloadend = () => {
      const s = fr.result as string;
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function triggerObjectUrlDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type StoryShareOutcome =
  | "web_share"
  | "native_share"
  | "download"
  | "cancelled";

/**
 * 1) Native (Capacitor): write JPEG to cache + system share sheet (Save / Instagram / …).
 *    — Runs before `navigator.share` so WebViews don't open a useless "Copy"-only sheet.
 * 2) iOS Safari (in-browser): Web Share with file when downloads are blocked.
 * 3) Everyone else: `<a download>` object-URL save.
 */
export async function shareOrDownloadStoryImage(
  blob: Blob,
  baseFileName: string
): Promise<StoryShareOutcome> {
  const safe = baseFileName.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 80);
  const name = `${safe || "echotoo-story"}.jpg`;
  const file = new File([blob], name, { type: "image/jpeg" });

  if (isNativeApp()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const b64 = await blobToBase64(blob);
      const path = `echotoo-story-${Date.now()}.jpg`;
      await Filesystem.writeFile({
        path,
        data: b64,
        directory: Directory.Cache,
      });
      const { uri } = await Filesystem.getUri({
        directory: Directory.Cache,
        path,
      });
      await Share.share({
        title: "Instagram Story",
        text: "Save image and add to your story",
        url: uri,
      });
      return "native_share";
    } catch (e) {
      console.error("[instagramStoryExport] native share failed", e);
      triggerObjectUrlDownload(blob, name);
      return "download";
    }
  }

  const isIOSWeb =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (
    isIOSWeb &&
    typeof navigator !== "undefined" &&
    navigator.share &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: "Instagram Story",
      });
      return "web_share";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
    }
  }

  triggerObjectUrlDownload(blob, name);
  return "download";
}
