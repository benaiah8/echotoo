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
import { PiCalendarBlank } from "react-icons/pi";
import { imgUrlPublic } from "../../lib/img";
import { getInstagramStoryBackgroundPath } from "../../lib/assets";
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
import StoryExportCard, {
  CAPTION_MAX_LINES,
  SEE_MORE_LABEL,
  STORY_EXPORT_COLORS as S,
} from "./StoryExportCard";

/** Shorter portrait card (not full 9:16 story); background art should match ~this frame. */
const STORY_CARD_ASPECT_RATIO = "3 / 4";

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
  creatorAvatarUrl,
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
  const [bgReady, setBgReady] = useState(false);
  const [useBgImage, setUseBgImage] = useState(true);
  const isDark = useIsDarkTheme();

  const rawCaption =
    caption?.trim() ||
    (postType === "hangout"
      ? "Check out this hangout!"
      : "Check out this experience!");

  const safeCreatorName = creatorName || "";
  const safeCreatorHandle = creatorHandle || "";
  const processedAvatarUrl = creatorAvatarUrl
    ? imgUrlPublic(creatorAvatarUrl) ?? null
    : null;
  const hasAvatar = !!processedAvatarUrl;

  const storyFallbackInitial = (() => {
    const fromName = safeCreatorName.trim().charAt(0);
    if (fromName) return fromName.toUpperCase();
    const fromHandle = safeCreatorHandle.replace(/^@/, "").trim().charAt(0);
    if (fromHandle) return fromHandle.toUpperCase();
    return "E";
  })();

  const eventLine = formatInstagramStoryEventLine({
    postType,
    selectedDates,
    isRecurring,
    recurrenceDays,
  });

  const storyBgSrc = getInstagramStoryBackgroundPath();

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setBgReady(true);
    img.onerror = () => {
      setUseBgImage(false);
      setBgReady(true);
    };
    img.src = storyBgSrc;
  }, [storyBgSrc]);

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
            hasAvatar,
            processedAvatarUrl,
            storyFallbackInitial,
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

  const captionClampStyle: CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: CAPTION_MAX_LINES,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    whiteSpace: "pre-line",
    lineHeight: 1.38,
    paddingTop: 0,
    paddingBottom: 4,
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

        <div
          className="mb-4 overflow-hidden rounded-xl bg-black"
          style={{
            aspectRatio: STORY_CARD_ASPECT_RATIO,
            width: "100%",
            position: "relative",
            ...previewFrameStyle,
          }}
        >
          <div
            style={{
              position: "relative",
              boxSizing: "border-box",
              height: "100%",
              width: "100%",
              overflow: "hidden",
              WebkitFontSmoothing: "antialiased",
              fontFamily:
                'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                background:
                  "linear-gradient(135deg, #f5c800 0%, #1a0f0a 55%, #050308 100%)",
                backgroundImage: `
                  linear-gradient(135deg, #f5c800 0%, #1a0f0a 55%, #050308 100%),
                  linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)
                `,
                backgroundSize: "100% 100%, 24px 24px, 24px 24px",
              }}
            />

            {useBgImage ? (
              <img
                src={storyBgSrc}
                alt=""
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 1,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                crossOrigin="anonymous"
                draggable={false}
              />
            ) : null}

            {/* Post block from top of safe area (not vertically centered — centering pushed content down and clipped captions). Brand pinned bottom-left. */}
            <div
              style={{
                position: "relative",
                zIndex: 10,
                height: "100%",
                boxSizing: "border-box",
                color: S.text,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  boxSizing: "border-box",
                  paddingLeft: "8%",
                  paddingRight: "8%",
                  paddingTop: "5%",
                  paddingBottom: "26%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-start",
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth: 340,
                    alignSelf: "center",
                  }}
                >
                  {hasAvatar ? (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 9999,
                        overflow: "hidden",
                        border: `2px solid ${S.borderLight}`,
                        marginBottom: 8,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                      }}
                    >
                      <img
                        src={processedAvatarUrl as string}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                        crossOrigin="anonymous"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 9999,
                        border: `2px solid ${S.borderLight}`,
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: S.initialsBg,
                        color: S.text,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                        lineHeight: 1,
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          lineHeight: "20px",
                          height: "20px",
                          margin: 0,
                          padding: 0,
                          fontSize: 20,
                          fontWeight: 700,
                          textAlign: "center",
                        }}
                      >
                        {storyFallbackInitial}
                      </span>
                    </div>
                  )}

                  {(safeCreatorHandle || safeCreatorName) && (
                    <p
                      style={{
                        margin: 0,
                        paddingBottom: 6,
                        borderBottom: `1px solid ${S.borderRule}`,
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: "-0.01em",
                        color: S.text,
                        textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                        textAlign: "left",
                      }}
                    >
                      {safeCreatorHandle || safeCreatorName}
                    </p>
                  )}

                  <div
                    style={{
                      marginTop: 12,
                      width: "100%",
                      borderRadius: 6,
                      padding: "6px 4px 8px",
                      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(1.38em - 1px), ${S.captionLine} 1.38em, ${S.captionLine} calc(1.38em + 1px))`,
                    }}
                  >
                    <p
                      ref={captionRef}
                      style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 500,
                        color: S.textMuted,
                        textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                        textAlign: "left",
                        ...captionClampStyle,
                      }}
                    >
                      {rawCaption}
                    </p>
                    {captionTruncated ? (
                      <p
                        style={{
                          margin: "8px 0 0 0",
                          fontSize: 11,
                          fontWeight: 600,
                          lineHeight: 1.35,
                          color: S.text,
                          textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                        }}
                      >
                        {SEE_MORE_LABEL}
                      </p>
                    ) : null}
                  </div>

                  {eventLine ? (
                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: 8,
                        fontSize: 12,
                        fontWeight: 500,
                        color: S.textSoft,
                      }}
                    >
                      <PiCalendarBlank
                        size={18}
                        style={{ color: S.textSoft, flexShrink: 0 }}
                        aria-hidden
                      />
                      <span>{eventLine}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                style={{
                  position: "absolute",
                  left: "8%",
                  bottom: "max(10px, 2.5%)",
                  maxWidth: "min(200px, 48%)",
                  zIndex: 12,
                  textAlign: "left",
                  pointerEvents: "none",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: S.text,
                    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                  }}
                >
                  Echotoo.com
                </p>
                <p
                  style={{
                    margin: "5px 0 0 0",
                    padding: 0,
                    fontSize: 10,
                    fontWeight: 500,
                    lineHeight: 1.25,
                    color: S.textSoft,
                    textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                  }}
                >
                  Download on
                </p>
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      borderRadius: 9999,
                      background: S.pillBg,
                      color: S.pillFg,
                      padding: "5px 11px",
                      fontWeight: 600,
                      fontSize: 10,
                      lineHeight: "12px",
                      verticalAlign: "middle",
                      boxSizing: "border-box",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
                    }}
                  >
                    App Store
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      borderRadius: 9999,
                      background: S.pillBg,
                      color: S.pillFg,
                      padding: "5px 11px",
                      fontWeight: 600,
                      fontSize: 10,
                      lineHeight: "12px",
                      verticalAlign: "middle",
                      boxSizing: "border-box",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
                    }}
                  >
                    Play Store
                  </span>
                </div>
              </div>
            </div>
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
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          ref={exportCaptureRef}
          style={{
            position: "relative",
            boxSizing: "border-box",
            width: 400,
            aspectRatio: STORY_CARD_ASPECT_RATIO,
            overflow: "hidden",
            WebkitFontSmoothing: "antialiased",
            fontFamily:
              'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <StoryExportCard
            storyBgSrc={storyBgSrc}
            useBgImage={useBgImage}
            hasAvatar={hasAvatar}
            processedAvatarUrl={processedAvatarUrl}
            storyFallbackInitial={storyFallbackInitial}
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
