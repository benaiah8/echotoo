/**
 * Export-only story card DOM for the html2canvas fallback (and shared layout tokens for manual canvas).
 * Inline styles only; no class names; FO-safe CSS (no max/min on layout; inline SVG for calendar).
 * Primary export uses `renderInstagramStoryToCanvas`; keep visual parity with the modal preview when changing layout.
 */

import type { CSSProperties } from "react";

/** Same stack as the preview card + capture root — set on export content so FO doesn’t rely on inheritance. */
export const STORY_EXPORT_FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Shared with `InstagramStoryGenerator` (preview) and `renderInstagramStoryToCanvas` (export). */
export const STORY_EXPORT_COLORS = {
  text: "#ffffff",
  textMuted: "rgba(255,255,255,0.92)",
  textSoft: "rgba(255,255,255,0.88)",
  borderLight: "rgba(255,255,255,0.9)",
  borderRule: "rgba(255,255,255,0.35)",
  initialsBg: "rgba(0,0,0,0.28)",
  pillBg: "#ffffff",
  pillFg: "#000000",
  captionLine: "rgba(255,255,255,0.12)",
} as const;

const S = STORY_EXPORT_COLORS;

export const CAPTION_MAX_LINES = 8;
export const SEE_MORE_LABEL = "See more on Echotoo.com";

/** 13px × ~1.38 ≈ 18px — explicit px for export card + manual canvas line metrics. */
export const CAPTION_LINE_HEIGHT_PX = 18;

const captionClampStyle: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: CAPTION_MAX_LINES,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  whiteSpace: "pre-line",
  lineHeight: `${CAPTION_LINE_HEIGHT_PX}px`,
  paddingTop: 0,
  paddingBottom: 4,
};

function ExportCalendarIcon({ color }: { color: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{
        flexShrink: 0,
        display: "block",
        color,
      }}
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="17"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 2v4M16 2v4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type StoryExportCardProps = {
  storyBgSrc: string;
  useBgImage: boolean;
  hasAvatar: boolean;
  processedAvatarUrl: string | null;
  storyFallbackInitial: string;
  safeCreatorHandle: string;
  safeCreatorName: string;
  rawCaption: string;
  captionShowSeeMore: boolean;
  eventLine: string | null;
};

/**
 * Full-bleed story card content (no outer aspect wrapper — parent supplies size).
 */
export default function StoryExportCard({
  storyBgSrc,
  useBgImage,
  hasAvatar,
  processedAvatarUrl,
  storyFallbackInitial,
  safeCreatorHandle,
  safeCreatorName,
  rawCaption,
  captionShowSeeMore,
  eventLine,
}: StoryExportCardProps) {
  return (
    <>
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

      <div
        style={{
          position: "relative",
          zIndex: 10,
          height: "100%",
          boxSizing: "border-box",
          color: S.text,
          fontFamily: STORY_EXPORT_FONT_FAMILY,
          WebkitFontSmoothing: "antialiased",
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
                    fontFamily: STORY_EXPORT_FONT_FAMILY,
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
                  fontFamily: STORY_EXPORT_FONT_FAMILY,
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: "20px",
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
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(${CAPTION_LINE_HEIGHT_PX}px - 1px), ${S.captionLine} ${CAPTION_LINE_HEIGHT_PX}px, ${S.captionLine} calc(${CAPTION_LINE_HEIGHT_PX}px + 1px))`,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: STORY_EXPORT_FONT_FAMILY,
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
              {captionShowSeeMore ? (
                <p
                  style={{
                    margin: "8px 0 0 0",
                    fontFamily: STORY_EXPORT_FONT_FAMILY,
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: "15px",
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
                  flexDirection: "row",
                  alignItems: "baseline",
                  justifyContent: "flex-start",
                  fontFamily: STORY_EXPORT_FONT_FAMILY,
                  fontSize: 12,
                  fontWeight: 500,
                  color: S.textSoft,
                }}
              >
                <span
                  style={{ marginRight: 8, display: "flex", flexShrink: 0 }}
                >
                  <ExportCalendarIcon color={S.textSoft} />
                </span>
                <span
                  style={{
                    fontFamily: STORY_EXPORT_FONT_FAMILY,
                    fontSize: 12,
                    fontWeight: 500,
                    lineHeight: "16px",
                    color: S.textSoft,
                  }}
                >
                  {eventLine}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: "8%",
            bottom: "2.5%",
            maxWidth: "200px",
            width: "48%",
            zIndex: 12,
            textAlign: "left",
            pointerEvents: "none",
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: STORY_EXPORT_FONT_FAMILY,
              fontSize: 15,
              fontWeight: 700,
              lineHeight: "20px",
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
              fontFamily: STORY_EXPORT_FONT_FAMILY,
              fontSize: 10,
              fontWeight: 500,
              lineHeight: "13px",
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
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9999,
                background: S.pillBg,
                color: S.pillFg,
                padding: "5px 11px",
                marginRight: 6,
                marginBottom: 4,
                fontFamily: STORY_EXPORT_FONT_FAMILY,
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
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9999,
                background: S.pillBg,
                color: S.pillFg,
                padding: "5px 11px",
                fontFamily: STORY_EXPORT_FONT_FAMILY,
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
    </>
  );
}
