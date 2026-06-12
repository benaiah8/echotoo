import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import html2canvas from "html2canvas";
import toast from "react-hot-toast";
import { formatInstagramStoryEventLine } from "../../lib/instagramStoryEventLine";
import { shareOrDownloadStoryImage } from "../../lib/instagramStoryExport";
import {
  STORY_EXPORT_BACKGROUND_HEX,
  validateStoryExportCanvas,
} from "../../lib/instagramStoryCanvasValidation";
import { renderInstagramStoryToCanvas } from "../../lib/renderInstagramStoryToCanvas";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";
import StoryExportCard from "./StoryExportCard";

/**
 * Export pipeline: primary = manual Canvas 2D (`renderInstagramStoryToCanvas`); fallback = DOM capture
 * via html2canvas on the off-screen `StoryExportCard`. When `true`, manual runs first; set `false` only
 * for emergency rollback to html2canvas-only.
 */
const USE_MANUAL_STORY_CANVAS_EXPORT = true;

/**
 * html2canvas fallback only: strip `class` on the cloned capture subtree so global Tailwind (e.g.
 * `oklab()`) cannot break html2canvas.
 */
function stripClassesOnStoryClone(_doc: Document, cloned: HTMLElement) {
  const strip = (node: Element) => {
    node.removeAttribute("class");
    Array.from(node.children).forEach((c) => strip(c));
  };
  strip(cloned);
}

/**
 * html2canvas fallback: capture the off-screen export subtree. Prefer foreignObject rendering; retry with
 * the legacy renderer if it throws, or if validation detects a blank/near-background canvas.
 */
async function captureStoryToCanvas(
  el: HTMLElement
): Promise<HTMLCanvasElement> {
  const base = {
    useCORS: true,
    allowTaint: false,
    backgroundColor: STORY_EXPORT_BACKGROUND_HEX,
    scale: 2,
    logging: false,
    onclone: stripClassesOnStoryClone,
  } satisfies Parameters<typeof html2canvas>[1];

  const logCapture = (
    attempt: number,
    renderer: "foreignObject" | "legacy",
    canvas: HTMLCanvasElement,
    validation: ReturnType<typeof validateStoryExportCanvas>
  ) => {
    console.info("[InstagramStoryGenerator]", {
      attempt,
      renderer,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      validationOk: validation.ok,
      nearBackgroundRatio: validation.stats.nearBackgroundRatio,
      maxLuminance: validation.stats.maxLuminance,
      luminanceVariance: validation.stats.luminanceVariance,
    });
  };

  let foCanvas: HTMLCanvasElement;
  try {
    foCanvas = await html2canvas(el, {
      ...base,
      foreignObjectRendering: true,
    });
  } catch (foErr) {
    console.warn(
      "[InstagramStoryGenerator] foreignObject capture failed; retrying with legacy renderer",
      foErr
    );
    const legacyCanvas = await html2canvas(el, {
      ...base,
      foreignObjectRendering: false,
    });
    const vLegacy = validateStoryExportCanvas(legacyCanvas);
    logCapture(2, "legacy", legacyCanvas, vLegacy);
    if (!vLegacy.ok) {
      console.error("[InstagramStoryGenerator]", {
        outcome: "capture_failed",
        message: "invalid canvas after legacy rendering (foreignObject threw)",
      });
      throw new Error(
        "Story export produced an invalid canvas after legacy rendering."
      );
    }
    return legacyCanvas;
  }

  const vFo = validateStoryExportCanvas(foCanvas);
  logCapture(1, "foreignObject", foCanvas, vFo);
  if (vFo.ok) return foCanvas;

  console.info("[InstagramStoryGenerator]", {
    reason: "invalid_canvas",
    retryingWith: "legacy",
  });

  const legacyCanvas = await html2canvas(el, {
    ...base,
    foreignObjectRendering: false,
  });
  const vLegacy = validateStoryExportCanvas(legacyCanvas);
  logCapture(2, "legacy", legacyCanvas, vLegacy);
  if (!vLegacy.ok) {
    console.error("[InstagramStoryGenerator]", {
      outcome: "capture_failed",
      message: "invalid canvas after foreignObject and legacy rendering",
    });
    throw new Error(
      "Story export produced an invalid canvas after foreignObject and legacy rendering."
    );
  }
  return legacyCanvas;
}

function subscribeTheme(cb: () => void) {
  const el = document.documentElement;
  const mo = new MutationObserver(cb);
  mo.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}

function getThemeIsDarkSnapshot() {
  return !document.documentElement.classList.contains("theme-light");
}

function useIsDarkTheme() {
  return useSyncExternalStore(
    subscribeTheme,
    getThemeIsDarkSnapshot,
    () => true
  );
}

interface InstagramStoryGeneratorProps {
  caption: string;
  postImageUrl?: string | null;
  postId: string;
  postType: "experience" | "hangout";
  onImageGenerated?: (blob: Blob) => void;
  onClose?: () => void;

  creatorName?: string;
  creatorHandle?: string;
  creatorAvatarUrl?: string | null;
  activities?: string[];

  selectedDates?: string[] | null;
  isRecurring?: boolean | null;
  recurrenceDays?: string[] | null;
}

export default function InstagramStoryGenerator({
  caption,
  postImageUrl: _postImageUrl,
  postId,
  postType,
  onImageGenerated,
  onClose,
  creatorName,
  creatorHandle,
  creatorAvatarUrl: _creatorAvatarUrl,
  activities: _activities,
  selectedDates,
  isRecurring,
  recurrenceDays,
}: InstagramStoryGeneratorProps) {
  /** Off-screen subtree (`StoryExportCard`) used by the html2canvas fallback path only. */
  const exportCaptureRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const [captionTruncated, setCaptionTruncated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  /** Story card no longer loads a template PNG — export is always ready. */
  const bgReady = true;
  const useBgImage = false;
  const storyBgSrc = "";
  const isDark = useIsDarkTheme();

  const rawCaption =
    caption?.trim() ||
    (postType === "hangout"
      ? "Check out this event!"
      : "Check out this experience!");

  const safeCreatorName = creatorName || "";
  const safeCreatorHandle = creatorHandle || "";

  const eventLine = formatInstagramStoryEventLine({
    postType,
    selectedDates,
    isRecurring,
    recurrenceDays,
  });

  useLayoutEffect(() => {
    const measure = () => {
      const el = captionRef.current;
      if (!el) return;
      setCaptionTruncated(el.scrollHeight > el.clientHeight + 1.5);
    };
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(measure);
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
    };
  }, [rawCaption]);

  useEffect(() => {
    const el = captionRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setCaptionTruncated(el.scrollHeight > el.clientHeight + 1.5);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [rawCaption]);

  const previewFrameStyle: CSSProperties = isDark
    ? {
        border: "2px solid rgba(255,255,255,0.9)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.55), 0 2px 12px rgba(0,0,0,0.35)",
      }
    : {
        border: "2px solid rgba(20,20,24,0.4)",
        boxShadow: "0 12px 36px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)",
      };

  const generateImage = async () => {
    if (!exportCaptureRef.current) return;

    setIsGenerating(true);
    toast.loading("Creating your Instagram Story...", { id: "generating" });

    try {
      await new Promise((resolve) => setTimeout(resolve, 200));

      let canvas: HTMLCanvasElement;

      if (USE_MANUAL_STORY_CANVAS_EXPORT) {
        try {
          canvas = await renderInstagramStoryToCanvas({
            storyBgSrc,
            useBgImage,
            safeCreatorHandle,
            safeCreatorName,
            rawCaption,
            captionShowSeeMore: captionTruncated,
            eventLine,
          });
          const vManual = validateStoryExportCanvas(canvas);
          if (!vManual.ok) {
            console.warn(
              "[InstagramStoryGenerator] manual canvas failed validation; falling back to html2canvas",
              vManual.stats
            );
            canvas = await captureStoryToCanvas(exportCaptureRef.current);
          }
        } catch (manualErr) {
          console.warn(
            "[InstagramStoryGenerator] manual canvas render failed; falling back to html2canvas",
            manualErr
          );
          canvas = await captureStoryToCanvas(exportCaptureRef.current);
        }
      } else {
        canvas = await captureStoryToCanvas(exportCaptureRef.current);
      }

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            toast.error("Failed to generate image", { id: "generating" });
            setIsGenerating(false);
            return;
          }

          try {
            const outcome = await shareOrDownloadStoryImage(
              blob,
              `echotoo-story-${postId}`
            );

            if (outcome === "cancelled") {
              toast.dismiss("generating");
              setIsGenerating(false);
              return;
            }

            onImageGenerated?.(blob);

            toast.success(
              outcome === "download"
                ? "Image downloaded — check your files folder"
                : "Story image ready!",
              { id: "generating" }
            );
            onClose?.();
          } catch (err) {
            console.error("Error sharing story image:", err);
            toast.error("Failed to share image", { id: "generating" });
          } finally {
            setIsGenerating(false);
          }
        },
        "image/jpeg",
        0.92
      );
    } catch (error) {
      console.error("Error generating image:", error);
      toast.error("Failed to generate image", { id: "generating" });
      setIsGenerating(false);
    }
  };

  return (
    <FrostedCenterModal
      open
      onBackdropClick={isGenerating || !onClose ? undefined : () => onClose()}
      zTier="aboveDialog"
      containerClassName="overflow-y-auto py-4"
      aria-labelledby="instagram-story-title"
    >
      <div
        className={frostedModalPanelClassName}
        style={{
          ...frostedModalPanelStyle,
          maxWidth: "min(420px, 92vw)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="instagram-story-title"
          className="mb-4 w-full text-center text-xl font-bold text-[var(--text)]"
        >
          Create Instagram Story
        </h2>

        <div className="mb-4 flex w-full justify-center">
          <div
            className="overflow-hidden rounded-xl bg-black"
            style={{
              width: "100%",
              maxWidth: 400,
              position: "relative",
              ...previewFrameStyle,
            }}
          >
            <StoryExportCard
              captionRef={captionRef}
              storyBgSrc={storyBgSrc}
              useBgImage={useBgImage}
              safeCreatorHandle={safeCreatorHandle}
              safeCreatorName={safeCreatorName}
              rawCaption={rawCaption}
              captionShowSeeMore={captionTruncated}
              eventLine={eventLine}
            />
          </div>
        </div>

        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="rounded-xl border-2 border-[var(--border)] bg-transparent px-6 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={generateImage}
            disabled={isGenerating || !bgReady}
            className="rounded-xl bg-yellow-400 px-6 py-2 text-sm font-bold text-black transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? "Creating..." : "Create Story"}
          </button>
        </div>
      </div>

      {/* Off-screen DOM for html2canvas fallback (FO-safe). Primary export uses manual canvas; preview above is unchanged. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: 400,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        <div
          ref={exportCaptureRef}
          style={{
            position: "relative",
            boxSizing: "border-box",
            width: 400,
            overflow: "visible",
            WebkitFontSmoothing: "antialiased",
            fontFamily:
              'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <StoryExportCard
            storyBgSrc={storyBgSrc}
            useBgImage={useBgImage}
            safeCreatorHandle={safeCreatorHandle}
            safeCreatorName={safeCreatorName}
            rawCaption={rawCaption}
            captionShowSeeMore={captionTruncated}
            eventLine={eventLine}
          />
        </div>
      </div>
    </FrostedCenterModal>
  );
}
