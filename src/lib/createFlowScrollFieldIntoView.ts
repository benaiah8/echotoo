const BOTTOM_MARGIN_PX = 16;
const WRITING_TOOLBAR_DOCK_GAP_PX = 8;
const SECTION_CLEARANCE_GAP_PX = 12;
const FINALIZE_EDITING_CANVAS_SELECTOR =
  "[data-create-finalize-editing-canvas]";

/** Max settle passes after section focus (rAF + short delays). */
const SECTION_SCROLL_MAX_ATTEMPTS = 6;
const SECTION_SCROLL_DELAY_MS = [0, 0, 80, 160, 280, 420] as const;

function readCssPxVar(name: string, fallback: number): number {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function readCreateActionsBottomPx(): number {
  return readCssPxVar("--create-actions-total-bottom", 96);
}

/** Metadata + writing toolbars + keyboard inset above the page bottom. */
function readFinalizeBottomChromePx(): number {
  const metadata = readCssPxVar("--create-finalize-toolbar-height", 50);
  const writing = readCssPxVar(
    "--create-finalize-writing-toolbar-height",
    28,
  );
  const keyboard = readCssPxVar("--create-keyboard-inset", 0);
  return (
    readCreateActionsBottomPx() +
    metadata +
    WRITING_TOOLBAR_DOCK_GAP_PX +
    writing +
    keyboard
  );
}

/**
 * Finalize section clearance: `--create-actions-total-bottom` already embeds
 * the closed toolbar footprint (pill top → window bottom). Add live keyboard
 * inset only — do not also add `--create-finalize-toolbar-height`.
 */
export function computeFinalizeSectionChromePx(args: {
  actionsTotalBottomPx: number;
  keyboardInsetPx: number;
  gapPx?: number;
}): number {
  const gap = args.gapPx ?? SECTION_CLEARANCE_GAP_PX;
  return Math.max(0, args.actionsTotalBottomPx) + Math.max(0, args.keyboardInsetPx) + gap;
}

/** Visible bottom Y (layout coords) the section editor must stay above. */
export function computeFinalizeSectionSafeBottomPx(args: {
  viewportTop: number;
  viewportHeight: number;
  actionsTotalBottomPx: number;
  keyboardInsetPx: number;
  gapPx?: number;
}): number {
  return (
    args.viewportTop +
    args.viewportHeight -
    computeFinalizeSectionChromePx(args)
  );
}

function readFinalizeSectionChromePx(): number {
  return computeFinalizeSectionChromePx({
    actionsTotalBottomPx: readCreateActionsBottomPx(),
    keyboardInsetPx: readCssPxVar("--create-keyboard-inset", 0),
  });
}

export function findFinalizeEditingCanvas(
  from: HTMLElement,
): HTMLElement | null {
  const marked = from.closest(FINALIZE_EDITING_CANVAS_SELECTOR);
  return marked instanceof HTMLElement ? marked : null;
}

const COMPOSE_CENTER_RATIO = 0.42;
const SCROLL_CENTER_THRESHOLD_PX = 8;

/** Scroll a focused create-flow field above keyboard + fixed bottom chrome (window scroll). */
export function scrollCreateFlowFieldIntoView(target: HTMLElement) {
  const vv = window.visualViewport;
  const chromeBottom = readFinalizeBottomChromePx();

  if (!vv) {
    target.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
    return;
  }

  const marginTop = Math.max(vv.offsetTop, 8) + 8;
  const safeBottom = vv.offsetTop + vv.height - chromeBottom - BOTTOM_MARGIN_PX;
  const rect = target.getBoundingClientRect();

  if (rect.bottom <= safeBottom && rect.top >= marginTop) {
    return;
  }

  if (rect.bottom > safeBottom) {
    window.scrollBy({ top: rect.bottom - safeBottom, behavior: "smooth" });
    return;
  }

  if (rect.top < marginTop) {
    window.scrollBy({ top: rect.top - marginTop, behavior: "smooth" });
  }
}

/**
 * Center a compose field in the safe band above metadata + writing toolbars + keyboard.
 * Used for Detail add mode when opened from far down the page.
 */
export function scrollComposeFieldCenteredInView(target: HTMLElement) {
  const vv = window.visualViewport;

  if (!vv) {
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
    return;
  }

  const safeTop = Math.max(vv.offsetTop, 8) + 8;
  const safeBottom =
    vv.offsetTop + vv.height - readFinalizeBottomChromePx() - BOTTOM_MARGIN_PX;
  const safeHeight = safeBottom - safeTop;
  if (safeHeight <= 0) return;

  const rect = target.getBoundingClientRect();
  const fieldCenter = rect.top + rect.height / 2;
  const desiredCenter = safeTop + safeHeight * COMPOSE_CENTER_RATIO;
  const delta = fieldCenter - desiredCenter;

  if (Math.abs(delta) <= SCROLL_CENTER_THRESHOLD_PX) return;
  window.scrollBy({ top: delta, behavior: "smooth" });
}

/**
 * Scroll a Finalize section editor inside the nested editing canvas.
 * Instant scrollTop — reliability over animation while the IME settles.
 */
function scrollFinalizeSectionInCanvas(
  target: HTMLElement,
  canvas: HTMLElement,
): void {
  const vv = window.visualViewport;
  const viewportTop = vv ? vv.offsetTop : 0;
  const viewportHeight = vv ? vv.height : window.innerHeight;
  const marginTop = Math.max(viewportTop, 8) + 8;
  const safeBottom = computeFinalizeSectionSafeBottomPx({
    viewportTop,
    viewportHeight,
    actionsTotalBottomPx: readCreateActionsBottomPx(),
    keyboardInsetPx: readCssPxVar("--create-keyboard-inset", 0),
  });

  const rect = target.getBoundingClientRect();

  if (rect.bottom <= safeBottom && rect.top >= marginTop) {
    return;
  }

  if (rect.bottom > safeBottom) {
    canvas.scrollTop += rect.bottom - safeBottom;
    return;
  }

  if (rect.top < marginTop) {
    canvas.scrollTop += rect.top - marginTop;
  }
}

/** Scroll a V4 section row so it sits above keyboard + Finalize footer chrome. */
export function scrollSectionComposeIntoView(sectionRoot: HTMLElement) {
  const canvas = findFinalizeEditingCanvas(sectionRoot);
  if (canvas) {
    scrollFinalizeSectionInCanvas(sectionRoot, canvas);
    return;
  }

  // Non-Finalize fallback (window scroll) — unused on current Finalize path.
  const vv = window.visualViewport;
  const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const safeBottom =
    viewportBottom - readFinalizeSectionChromePx() - BOTTOM_MARGIN_PX;
  const rect = sectionRoot.getBoundingClientRect();

  if (rect.bottom <= safeBottom && rect.top >= 8) {
    return;
  }

  if (rect.bottom > safeBottom) {
    window.scrollBy({ top: rect.bottom - safeBottom, behavior: "auto" });
    return;
  }

  if (rect.top < 8) {
    window.scrollBy({ top: rect.top - 8, behavior: "auto" });
  }
}

/**
 * After section autofocus (`preventScroll: true`), scroll the nested Finalize
 * canvas with a few settle retries while `--create-keyboard-inset` catches up.
 */
export function scheduleFinalizeSectionComposeScroll(
  sectionRoot: HTMLElement,
): () => void {
  let cancelled = false;
  let attempt = 0;
  let lastInset = Number.NaN;
  let timeoutId: number | undefined;

  const clearTimer = () => {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const run = () => {
    if (cancelled) return;
    if (!sectionRoot.isConnected) return;

    scrollSectionComposeIntoView(sectionRoot);

    const inset = readCssPxVar("--create-keyboard-inset", 0);
    const insetChanged =
      !Number.isFinite(lastInset) || Math.abs(inset - lastInset) >= 1;
    lastInset = inset;
    attempt += 1;

    if (attempt >= SECTION_SCROLL_MAX_ATTEMPTS) return;
    // Keep retrying while inset is still settling or for the first few frames.
    if (!insetChanged && attempt >= 3) return;

    const delay =
      SECTION_SCROLL_DELAY_MS[
        Math.min(attempt, SECTION_SCROLL_DELAY_MS.length - 1)
      ] ?? 0;

    if (delay <= 0) {
      requestAnimationFrame(run);
      return;
    }

    timeoutId = window.setTimeout(() => {
      timeoutId = undefined;
      requestAnimationFrame(run);
    }, delay);
  };

  requestAnimationFrame(() => {
    if (cancelled) return;
    requestAnimationFrame(run);
  });

  return () => {
    cancelled = true;
    clearTimer();
  };
}
