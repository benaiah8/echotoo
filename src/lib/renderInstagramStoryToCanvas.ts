/**
 * Manual Canvas 2D composition for Instagram story export (parity with StoryExportCard layout).
 * No DOM layout for the bitmap — avoids html2canvas text drift.
 */

import {
  CAPTION_LINE_HEIGHT_PX,
  CAPTION_MAX_LINES,
  SEE_MORE_LABEL,
  STORY_EXPORT_COLORS,
  STORY_EXPORT_FONT_FAMILY,
} from "../components/ui/StoryExportCard";

/** Matches off-screen export wrapper in InstagramStoryGenerator (3:4 portrait). */
export const STORY_EXPORT_LOGICAL_WIDTH = 400;
export const STORY_EXPORT_LOGICAL_HEIGHT = Math.round(
  (STORY_EXPORT_LOGICAL_WIDTH * 4) / 3
);

/** Match html2canvas scale for sharper JPEG output. */
export const STORY_EXPORT_CANVAS_SCALE = 2;

const S = STORY_EXPORT_COLORS;

export type RenderInstagramStoryToCanvasInput = {
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

function loadImage(
  url: string,
  crossOrigin: boolean
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return;
  const wr = dw / dh;
  const ir = iw / ih;
  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;
  if (ir > wr) {
    sh = ih;
    sw = ih * wr;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    sw = iw;
    sh = iw / wr;
    sx = 0;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawGradientBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#f5c800");
  g.addColorStop(0.55, "#1a0f0a");
  g.addColorStop(1, "#050308");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawNotebookGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const step = 24;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();
}

function wrapCaptionLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
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
  alpha: number
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
  color: string
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

function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  font: string
) {
  ctx.font = font;
  const padX = 11;
  const padY = 5;
  const tw = ctx.measureText(label).width;
  const w = tw + padX * 2;
  const h = 12 + padY * 2;
  ctx.save();
  setTextShadow(ctx, 4, 1, 0.35);
  ctx.fillStyle = S.pillBg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9999);
  ctx.fill();
  clearTextShadow(ctx);
  ctx.fillStyle = S.pillFg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  ctx.restore();
  return w;
}

/**
 * Creates and returns a canvas with the Instagram story bitmap (logical layout matches StoryExportCard).
 */
export async function renderInstagramStoryToCanvas(
  input: RenderInstagramStoryToCanvasInput
): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }

  const LW = STORY_EXPORT_LOGICAL_WIDTH;
  const LH = STORY_EXPORT_LOGICAL_HEIGHT;
  const scale = STORY_EXPORT_CANVAS_SCALE;
  const W = Math.round(LW * scale);
  const H = Math.round(LH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context");

  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  drawGradientBackground(ctx, LW, LH);
  drawNotebookGrid(ctx, LW, LH);

  if (input.useBgImage) {
    try {
      const bg = await loadImage(input.storyBgSrc, true);
      drawCoverImage(ctx, bg, 0, 0, LW, LH);
    } catch {
      /* gradient-only fallback */
    }
  }

  const padL = 0.08 * LW;
  const padR = 0.08 * LW;
  const padT = 0.05 * LH;
  const colW = LW - padL - padR;
  const maxInnerW = Math.min(340, colW);
  /** Centered column (matches StoryExportCard maxWidth + alignSelf center). */
  const columnLeft = padL + (colW - maxInnerW) / 2;

  let cursorY = padT;

  const avatarSize = 56;
  /** Avatar is left-aligned within the column (not centered in the card). */
  const avatarDrawX = columnLeft;

  cursorY = padT;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  if (input.hasAvatar && input.processedAvatarUrl) {
    try {
      const av = await loadImage(input.processedAvatarUrl, true);
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        avatarDrawX + avatarSize / 2,
        cursorY + avatarSize / 2,
        avatarSize / 2 - 1,
        0,
        Math.PI * 2
      );
      ctx.clip();
      drawCoverImage(
        ctx,
        av,
        avatarDrawX + 2,
        cursorY + 2,
        avatarSize - 4,
        avatarSize - 4
      );
      ctx.restore();
      ctx.strokeStyle = S.borderLight;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        avatarDrawX + avatarSize / 2,
        cursorY + avatarSize / 2,
        avatarSize / 2 - 1,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    } catch {
      ctx.fillStyle = S.initialsBg;
      ctx.beginPath();
      ctx.arc(
        avatarDrawX + avatarSize / 2,
        cursorY + avatarSize / 2,
        avatarSize / 2 - 1,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.strokeStyle = S.borderLight;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `700 20px ${STORY_EXPORT_FONT_FAMILY}`;
      ctx.fillStyle = S.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      setTextShadow(ctx, 2, 1, 0.45);
      ctx.fillText(
        input.storyFallbackInitial.slice(0, 1).toUpperCase(),
        avatarDrawX + avatarSize / 2,
        cursorY + avatarSize / 2
      );
      clearTextShadow(ctx);
    }
  } else {
    ctx.fillStyle = S.initialsBg;
    ctx.beginPath();
    ctx.arc(
      avatarDrawX + avatarSize / 2,
      cursorY + avatarSize / 2,
      avatarSize / 2 - 1,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.strokeStyle = S.borderLight;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `700 20px ${STORY_EXPORT_FONT_FAMILY}`;
    ctx.fillStyle = S.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setTextShadow(ctx, 2, 1, 0.45);
    ctx.fillText(
      input.storyFallbackInitial.slice(0, 1).toUpperCase(),
      avatarDrawX + avatarSize / 2,
      cursorY + avatarSize / 2
    );
    clearTextShadow(ctx);
  }

  ctx.restore();

  cursorY += avatarSize + 8;

  const handleOrName = input.safeCreatorHandle || input.safeCreatorName || "";
  if (handleOrName) {
    ctx.font = `600 14px ${STORY_EXPORT_FONT_FAMILY}`;
    ctx.fillStyle = S.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    setTextShadow(ctx, 2, 1, 0.45);
    ctx.fillText(handleOrName, columnLeft, cursorY);
    clearTextShadow(ctx);
    const lineH = 20;
    cursorY += lineH + 6;
    ctx.strokeStyle = S.borderRule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(columnLeft, cursorY);
    ctx.lineTo(columnLeft + maxInnerW, cursorY);
    ctx.stroke();
    cursorY += 1;
  }

  cursorY += 12;

  const captionBoxX = columnLeft;
  const captionBoxW = maxInnerW;
  const captionPadX = 4;
  const captionPadTop = 6;
  const captionPadBottom = 8;
  const captionInnerW = captionBoxW - captionPadX * 2;

  ctx.font = `500 13px ${STORY_EXPORT_FONT_FAMILY}`;
  const captionLines = wrapCaptionLines(
    ctx,
    input.rawCaption,
    captionInnerW,
    CAPTION_MAX_LINES
  );

  const captionBlockH =
    captionPadTop +
    captionLines.length * CAPTION_LINE_HEIGHT_PX +
    captionPadBottom +
    (input.captionShowSeeMore ? 8 + 15 : 0);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(captionBoxX, cursorY, captionBoxW, captionBlockH, 6);
  ctx.clip();

  const innerTop = cursorY + captionPadTop;
  for (let i = 0; i < captionLines.length; i++) {
    const lineY = innerTop + i * CAPTION_LINE_HEIGHT_PX;
    const lineBottom = lineY + CAPTION_LINE_HEIGHT_PX - 1;
    ctx.strokeStyle = S.captionLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(captionBoxX, lineBottom + 0.5);
    ctx.lineTo(captionBoxX + captionBoxW, lineBottom + 0.5);
    ctx.stroke();
  }
  ctx.restore();

  ctx.font = `500 13px ${STORY_EXPORT_FONT_FAMILY}`;
  ctx.fillStyle = S.textMuted;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  setTextShadow(ctx, 2, 1, 0.4);
  captionLines.forEach((ln, i) => {
    ctx.fillText(
      ln,
      captionBoxX + captionPadX,
      innerTop + i * CAPTION_LINE_HEIGHT_PX
    );
  });
  clearTextShadow(ctx);

  if (input.captionShowSeeMore) {
    ctx.font = `600 11px ${STORY_EXPORT_FONT_FAMILY}`;
    ctx.fillStyle = S.text;
    setTextShadow(ctx, 2, 1, 0.45);
    ctx.fillText(
      SEE_MORE_LABEL,
      captionBoxX + captionPadX,
      innerTop + captionLines.length * CAPTION_LINE_HEIGHT_PX + 8
    );
    clearTextShadow(ctx);
  }

  cursorY += captionBlockH;

  if (input.eventLine) {
    cursorY += 12;
    const calY = cursorY;
    drawCalendarIcon(ctx, captionBoxX, calY, 18, S.textSoft);
    ctx.font = `500 12px ${STORY_EXPORT_FONT_FAMILY}`;
    ctx.fillStyle = S.textSoft;
    ctx.textBaseline = "top";
    ctx.fillText(input.eventLine, captionBoxX + 18 + 8, calY + 1);
  }

  const footerLeft = 0.08 * LW;
  /** Bottom edge of footer block (`bottom: 2.5%` on StoryExportCard). */
  const bottomEdge = LH - 0.025 * LH;
  const pillFont = `600 10px ${STORY_EXPORT_FONT_FAMILY}`;
  const pillH = 12 + 5 * 2;
  const gapPills = 6;
  const pillTop = bottomEdge - pillH;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  let xPill = footerLeft;
  const w1 = drawPill(ctx, xPill, pillTop, "App Store", pillFont);
  xPill += w1 + gapPills;
  drawPill(ctx, xPill, pillTop, "Play Store", pillFont);

  const downloadOnTop = pillTop - 6 - 13;
  ctx.font = `500 10px ${STORY_EXPORT_FONT_FAMILY}`;
  ctx.fillStyle = S.textSoft;
  setTextShadow(ctx, 2, 1, 0.45);
  ctx.fillText("Download on", footerLeft, downloadOnTop);
  clearTextShadow(ctx);

  const echotooTop = downloadOnTop - 5 - 20;
  ctx.font = `700 15px ${STORY_EXPORT_FONT_FAMILY}`;
  ctx.fillStyle = S.text;
  setTextShadow(ctx, 2, 1, 0.5);
  ctx.fillText("Echotoo.com", footerLeft, echotooTop);
  clearTextShadow(ctx);

  return canvas;
}
