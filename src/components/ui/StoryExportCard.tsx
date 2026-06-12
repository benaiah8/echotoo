/**
 * Export-only story card DOM for the html2canvas fallback (and shared layout tokens for manual canvas).
 * Inline styles only; no class names; FO-safe CSS (no max/min on layout; inline SVG for calendar).
 * Primary export uses `renderInstagramStoryToCanvas`; keep visual parity with the modal preview when changing layout.
 */

import type { CSSProperties, RefObject } from "react";
import { getOwlLogoPath } from "../../lib/assets";

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

/** Typography — keep in sync with `renderInstagramStoryToCanvas`. */
export const STORY_EXPORT_USERNAME_FONT_PX = 15;
export const STORY_EXPORT_CAPTION_FONT_PX = 14;
export const STORY_EXPORT_SEE_MORE_FONT_PX = 12;
export const STORY_EXPORT_EVENT_FONT_PX = 13;

/** Username: one line + padding under handle (matches canvas `USER_BLOCK_H`). */
export const USERNAME_LINE_HEIGHT_PX = 22;
export const USERNAME_PADDING_BOTTOM_PX = 6;
export const USER_BLOCK_H =
  USERNAME_LINE_HEIGHT_PX + USERNAME_PADDING_BOTTOM_PX;

/** Caption line box (14px × ~1.43). */
export const CAPTION_LINE_HEIGHT_PX = 20;

/** Vertical padding inside the black card (above username / below last line). */
export const STORY_EXPORT_INSET_PAD_Y_PX = 36;

/** Brand wordmark on the username row (right). */
export const STORY_EXPORT_BRAND_LABEL = "echotoo";
export const STORY_EXPORT_BRAND_FONT_PX = 12;
/** Matches `public/owlicon.svg` body fill (`#FFCC00`). */
export const STORY_EXPORT_BRAND_COLOR = "#FFCC00";

/** Corner owl graphic (fits within bottom inset to avoid overlapping body text). */
export const STORY_EXPORT_OWL_SIZE_PX = 32;

/** Gap between username / caption / date blocks. */
export const STORY_EXPORT_GAP_PX = 12;

/** Calendar glyph size; row height aligns with this. */
export const STORY_EXPORT_CALENDAR_ICON_PX = 20;

export const STORY_EXPORT_EVENT_LINE_HEIGHT_PX = 18;
export const EVENT_ROW_H = Math.max(
  STORY_EXPORT_CALENDAR_ICON_PX,
  STORY_EXPORT_EVENT_LINE_HEIGHT_PX,
);

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
  const s = STORY_EXPORT_CALENDAR_ICON_PX;
  return (
    <svg
      width={s}
      height={s}
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
  safeCreatorHandle: string;
  safeCreatorName: string;
  rawCaption: string;
  captionShowSeeMore: boolean;
  eventLine: string | null;
  /** Optional ref on the clamped caption paragraph (preview truncation measure). */
  captionRef?: RefObject<HTMLParagraphElement | null>;
};

/**
 * Dynamic-height black story card: width fills parent; height follows content.
 */
export default function StoryExportCard({
  storyBgSrc,
  useBgImage,
  safeCreatorHandle,
  safeCreatorName,
  rawCaption,
  captionShowSeeMore,
  eventLine,
  captionRef,
}: StoryExportCardProps) {
  const trimmedEventLine =
    typeof eventLine === "string" ? eventLine.trim() : "";
  const showEventLine = trimmedEventLine.length > 0;

  const bgFromPost =
    useBgImage && storyBgSrc.trim().length > 0
      ? {
          backgroundImage: `url(${storyBgSrc})`,
          backgroundSize: "cover" as const,
          backgroundPosition: "center" as const,
          backgroundRepeat: "no-repeat" as const,
        }
      : {};

  return (
    <div
      style={{
        position: "relative",
        boxSizing: "border-box",
        width: "100%",
        minHeight: 0,
        backgroundColor: "#000000",
        ...bgFromPost,
        color: S.text,
        fontFamily: STORY_EXPORT_FONT_FAMILY,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <img
        src={getOwlLogoPath()}
        alt=""
        aria-hidden
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: STORY_EXPORT_OWL_SIZE_PX,
          height: STORY_EXPORT_OWL_SIZE_PX,
          objectFit: "contain",
          objectPosition: "bottom right",
          display: "block",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          boxSizing: "border-box",
          paddingLeft: "8%",
          paddingRight: "8%",
          paddingTop: STORY_EXPORT_INSET_PAD_Y_PX,
          paddingBottom: STORY_EXPORT_INSET_PAD_Y_PX,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 340,
            marginLeft: "auto",
            marginRight: "auto",
            display: "flex",
            flexDirection: "column",
            gap: STORY_EXPORT_GAP_PX,
            alignItems: "stretch",
            minHeight: 0,
          }}
        >
          {(safeCreatorHandle || safeCreatorName) && (
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexShrink: 0,
                paddingBottom: USERNAME_PADDING_BOTTOM_PX,
              }}
            >
              <p
                style={{
                  margin: 0,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: STORY_EXPORT_FONT_FAMILY,
                  fontSize: STORY_EXPORT_USERNAME_FONT_PX,
                  fontWeight: 600,
                  lineHeight: `${USERNAME_LINE_HEIGHT_PX}px`,
                  letterSpacing: "-0.01em",
                  color: S.text,
                  textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                  textAlign: "left",
                }}
              >
                {safeCreatorHandle || safeCreatorName}
              </p>
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: STORY_EXPORT_FONT_FAMILY,
                  fontSize: STORY_EXPORT_BRAND_FONT_PX,
                  fontWeight: 500,
                  lineHeight: `${USERNAME_LINE_HEIGHT_PX}px`,
                  letterSpacing: "0.04em",
                  color: STORY_EXPORT_BRAND_COLOR,
                  textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                }}
              >
                {STORY_EXPORT_BRAND_LABEL}
              </span>
            </div>
          )}

          <div
            style={{
              width: "100%",
              borderRadius: 6,
              padding: "6px 4px 8px",
              flexShrink: 0,
              minHeight: 0,
            }}
          >
            <p
              ref={captionRef}
              style={{
                margin: 0,
                fontFamily: STORY_EXPORT_FONT_FAMILY,
                fontSize: STORY_EXPORT_CAPTION_FONT_PX,
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
                  fontSize: STORY_EXPORT_SEE_MORE_FONT_PX,
                  fontWeight: 600,
                  lineHeight: "16px",
                  color: S.text,
                  textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                }}
              >
                {SEE_MORE_LABEL}
              </p>
            ) : null}
          </div>

          {showEventLine ? (
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-start",
                flexShrink: 0,
                fontFamily: STORY_EXPORT_FONT_FAMILY,
                fontSize: STORY_EXPORT_EVENT_FONT_PX,
                fontWeight: 500,
                color: S.textSoft,
              }}
            >
              <span
                style={{
                  marginRight: 8,
                  display: "inline-flex",
                  flexShrink: 0,
                  alignItems: "center",
                }}
              >
                <ExportCalendarIcon color={S.textSoft} />
              </span>
              <span
                style={{
                  fontFamily: STORY_EXPORT_FONT_FAMILY,
                  fontSize: STORY_EXPORT_EVENT_FONT_PX,
                  fontWeight: 500,
                  lineHeight: `${STORY_EXPORT_EVENT_LINE_HEIGHT_PX}px`,
                  color: S.textSoft,
                }}
              >
                {trimmedEventLine}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
