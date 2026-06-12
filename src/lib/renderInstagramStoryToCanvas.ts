/**
 * Manual Canvas 2D composition for Instagram story export (parity with StoryExportCard layout).
 * No DOM layout for the bitmap — avoids html2canvas text drift.
 * Canvas height matches the dynamic black card (width fixed at `STORY_EXPORT_LOGICAL_WIDTH`).
 */

import {
  CAPTION_LINE_HEIGHT_PX,
  CAPTION_MAX_LINES,
  EVENT_ROW_H,
  SEE_MORE_LABEL,
  STORY_EXPORT_BRAND_COLOR,
  STORY_EXPORT_BRAND_FONT_PX,
  STORY_EXPORT_BRAND_LABEL,
  STORY_EXPORT_CALENDAR_ICON_PX,
  STORY_EXPORT_CAPTION_FONT_PX,
  STORY_EXPORT_COLORS,
  STORY_EXPORT_EVENT_FONT_PX,
  STORY_EXPORT_FONT_FAMILY,
  STORY_EXPORT_GAP_PX,
  STORY_EXPORT_INSET_PAD_Y_PX,
  STORY_EXPORT_OWL_SIZE_PX,
  STORY_EXPORT_SEE_MORE_FONT_PX,
  STORY_EXPORT_USERNAME_FONT_PX,
  USER_BLOCK_H,
} from "../components/ui/StoryExportCard";
import { getOwlLogoPath } from "./assets";

/** Matches export / off-screen capture width. Card height is computed from content. */
export const STORY_EXPORT_LOGICAL_WIDTH = 400;

/** Match html2canvas scale for sharper JPEG output. */
export const STORY_EXPORT_CANVAS_SCALE = 2;

const S = STORY_EXPORT_COLORS;

export type RenderInstagramStoryToCanvasInput = {
  storyBgSrc: string;
  useBgImage: boolean;
  safeCreatorHandle: string;
  safeCreatorName: string;
  rawCaption: string;
  captionShowSeeMore: boolean;
  eventLine: string | null;
};

function drawSolidBlackBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function wrapCaptionLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\n/);

  for (const para of paragraphs) {
    if (lines.length >= maxLines) break;
    const words = para.split(/(\s+)/);
    let line = "";

    for (const w of words) {
      if (!w) continue;
      if (/^\s+$/.test(w)) {
        line += w;
        continue;
      }
      const test = line + w;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
        continue;
      }
      if (line.trim()) {
        lines.push(line.trimEnd());
        line = w;
        if (lines.length >= maxLines) return lines;
        continue;
      }
      if (ctx.measureText(w).width > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          const t2 = chunk + ch;
          if (ctx.measureText(t2).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
            if (lines.length >= maxLines) return lines;
          } else {
            chunk = t2;
          }
        }
        line = chunk;
      } else {
        line = w;
      }
    }
    if (lines.length < maxLines && line.trim()) {
      lines.push(line.trimEnd());
    }
  }

  return lines.slice(0, maxLines);
}

function setTextShadow(
  ctx: CanvasRenderingContext2D,
  blur: number,
  dy: number,
  alpha: number,
) {
  ctx.shadowColor = `rgba(0,0,0,${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = dy;
}

function clearTextShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function drawCalendarIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const s = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.roundRect(3, 4, 18, 17, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3, 10);
  ctx.lineTo(21, 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, 2);
  ctx.lineTo(8, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(16, 2);
  ctx.lineTo(16, 6);
  ctx.stroke();
  ctx.restore();
}

const CAPTION_PAD_TOP = 6;
const CAPTION_PAD_BOTTOM = 8;
/** “See more” block: margin-top 8px + 16px line (12px font). */
const SEE_MORE_BLOCK_H = 8 + 16;

/**
 * Creates a JPEG-ready canvas: full bitmap is the black story card (dynamic height).
 */
export async function renderInstagramStoryToCanvas(
  input: RenderInstagramStoryToCanvasInput,
): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }

  const LW = STORY_EXPORT_LOGICAL_WIDTH;
  const scale = STORY_EXPORT_CANVAS_SCALE;

  const padInsetY = STORY_EXPORT_INSET_PAD_Y_PX;
  const padL = 0.08 * LW;
  const padR = 0.08 * LW;
  const colW = LW - padL - padR;
  const maxInnerW = Math.min(340, colW);
  const columnLeft = padL + (colW - maxInnerW) / 2;

  const handleOrName = input.safeCreatorHandle || input.safeCreatorName || "";
  const rawEventLine = (input.eventLine ?? "").trim();
  const hasEventLine = rawEventLine.length > 0;

  const captionBoxX = columnLeft;
  const captionBoxW = maxInnerW;
  const captionPadX = 4;
  const captionInnerW = captionBoxW - captionPadX * 2;

  const W = Math.round(LW * scale);
  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = W;
  measureCanvas.height = Math.round(120 * scale);
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("Could not get 2d context");
  mctx.setTransform(scale, 0, 0, scale, 0, 0);
  mctx.font = `500 ${STORY_EXPORT_CAPTION_FONT_PX}px ${STORY_EXPORT_FONT_FAMILY}`;
  const captionLines = wrapCaptionLines(
    mctx,
    input.rawCaption,
    captionInnerW,
    CAPTION_MAX_LINES,
  );

  const captionBlockH =
    CAPTION_PAD_TOP +
    captionLines.length * CAPTION_LINE_HEIGHT_PX +
    CAPTION_PAD_BOTTOM +
    (input.captionShowSeeMore ? SEE_MORE_BLOCK_H : 0);

  const userH = handleOrName ? USER_BLOCK_H : 0;
  const gapBeforeCaption = handleOrName ? STORY_EXPORT_GAP_PX : 0;
  const gapBeforeEvent = hasEventLine ? STORY_EXPORT_GAP_PX : 0;
  const eventH = hasEventLine ? EVENT_ROW_H : 0;

  const contentH =
    userH + gapBeforeCaption + captionBlockH + gapBeforeEvent + eventH;

  const LH = padInsetY + contentH + padInsetY;
  const H = Math.round(LH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context");

  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  drawSolidBlackBackground(ctx, LW, LH);

  let cursorY = padInsetY;

  if (handleOrName) {
    ctx.font = `600 ${STORY_EXPORT_USERNAME_FONT_PX}px ${STORY_EXPORT_FONT_FAMILY}`;
    ctx.fillStyle = S.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    setTextShadow(ctx, 2, 1, 0.45);
    ctx.font = `500 ${STORY_EXPORT_BRAND_FONT_PX}px ${STORY_EXPORT_FONT_FAMILY}`;
    const brandW = ctx.measureText(STORY_EXPORT_BRAND_LABEL).width;
    ctx.font = `600 ${STORY_EXPORT_USERNAME_FONT_PX}px ${STORY_EXPORT_FONT_FAMILY}`;
    const maxUserW = Math.max(40, LW - padR - columnLeft - 8 - brandW);
    let drawUser = handleOrName;
    if (ctx.measureText(drawUser).width > maxUserW) {
      const ell = "…";
      while (
        drawUser.length > 1 &&
        ctx.measureText(drawUser + ell).width > maxUserW
      ) {
        drawUser = drawUser.slice(0, -1);
      }
      drawUser += ell;
    }
    ctx.fillText(drawUser, columnLeft, cursorY);
    clearTextShadow(ctx);
    ctx.font = `500 ${STORY_EXPORT_BRAND_FONT_PX}px ${STORY_EXPORT_FONT_FAMILY}`;
    ctx.fillStyle = STORY_EXPORT_BRAND_COLOR;
    ctx.textAlign = "right";
    setTextShadow(ctx, 2, 1, 0.35);
    ctx.fillText(STORY_EXPORT_BRAND_LABEL, LW - padR, cursorY);
    clearTextShadow(ctx);
    ctx.textAlign = "left";
    cursorY += USER_BLOCK_H + STORY_EXPORT_GAP_PX;
  }

  const innerTop = cursorY + CAPTION_PAD_TOP;

  ctx.font = `500 ${STORY_EXPORT_CAPTION_FONT_PX}px ${STORY_EXPORT_FONT_FAMILY}`;
  ctx.fillStyle = S.textMuted;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  setTextShadow(ctx, 2, 1, 0.4);
  captionLines.forEach((ln, i) => {
    ctx.fillText(
      ln,
      captionBoxX + captionPadX,
      innerTop + i * CAPTION_LINE_HEIGHT_PX,
    );
  });
  clearTextShadow(ctx);

  if (input.captionShowSeeMore) {
    ctx.font = `600 ${STORY_EXPORT_SEE_MORE_FONT_PX}px ${STORY_EXPORT_FONT_FAMILY}`;
    ctx.fillStyle = S.text;
    setTextShadow(ctx, 2, 1, 0.45);
    ctx.fillText(
      SEE_MORE_LABEL,
      captionBoxX + captionPadX,
      innerTop + captionLines.length * CAPTION_LINE_HEIGHT_PX + 8,
    );
    clearTextShadow(ctx);
  }

  cursorY += captionBlockH;

  if (hasEventLine) {
    cursorY += STORY_EXPORT_GAP_PX;
    const calY = cursorY;
    const rowMidY = calY + EVENT_ROW_H / 2;
    const iconPx = STORY_EXPORT_CALENDAR_ICON_PX;
    drawCalendarIcon(ctx, captionBoxX, calY, iconPx, S.textSoft);
    ctx.font = `500 ${STORY_EXPORT_EVENT_FONT_PX}px ${STORY_EXPORT_FONT_FAMILY}`;
    ctx.fillStyle = S.textSoft;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(rawEventLine, captionBoxX + iconPx + 8, rowMidY);
  }

  const owlSz = STORY_EXPORT_OWL_SIZE_PX;
  try {
    const owlPath = getOwlLogoPath();
    const owlUrl =
      typeof window !== "undefined"
        ? new URL(owlPath, window.location.href).href
        : owlPath;
    const owlImg = await loadImage(owlUrl);
    ctx.drawImage(owlImg, LW - owlSz, LH - owlSz, owlSz, owlSz);
  } catch {
    /* Owl is decorative; omit if asset fails (offline, bad path, etc.). */
  }

  return canvas;
}
