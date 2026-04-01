import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useCreateKeyboardInset } from "../../hooks/useCreateKeyboardInset";

const BOTTOM_MARGIN_PX = 12;

/** Bottom padding for create steps that use CreateTabsSection (+24px breathing room). */
export const createFlowMainColumnStyle: CSSProperties = {
  paddingTop:
    "calc(var(--create-flow-top-bar-total, 0px) + var(--create-flow-notice-stack-height, 0px))",
  paddingBottom:
    "calc(var(--create-actions-total-bottom, 120px) + var(--create-keyboard-inset, 0px) + 24px)",
  transition: "padding-top 0.28s ease-out, padding-bottom 0.28s ease-out",
};

/** Create landing: no extra 24px strip beyond actions bar. */
export const createFlowLandingColumnStyle: CSSProperties = {
  paddingBottom:
    "calc(var(--create-actions-total-bottom, 96px) + var(--create-keyboard-inset, 0px))",
  transition: "padding-bottom 0.28s ease-out",
};

/** Preview: PrimaryPageContainer already reserves --create-actions-total-bottom. */
export const createFlowPreviewColumnStyle: CSSProperties = {
  paddingTop: 12,
  paddingBottom: "calc(20px + var(--create-keyboard-inset, 0px))",
  transition: "padding-bottom 0.28s ease-out",
};

function readCreateActionsBottomPx(): number {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--create-actions-total-bottom")
      .trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 96;
  } catch {
    return 96;
  }
}

function shouldHandleFocusTarget(el: EventTarget | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const input = el as HTMLInputElement;
  const skip = new Set([
    "hidden",
    "file",
    "button",
    "submit",
    "reset",
    "image",
    "checkbox",
    "radio",
    "range",
    "color",
  ]);
  return !skip.has(input.type);
}

/**
 * Scroll the focused control into the area above the keyboard and fixed bottom chrome.
 * Uses window scroll (create flow is document-scrolled).
 */
function scrollFocusedFieldIntoView(target: HTMLElement) {
  const vv = window.visualViewport;
  const chromeBottom = readCreateActionsBottomPx();

  if (!vv) {
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
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
    const delta = rect.bottom - safeBottom;
    window.scrollBy({ top: delta, behavior: "smooth" });
    return;
  }

  if (rect.top < marginTop) {
    const delta = rect.top - marginTop;
    window.scrollBy({ top: delta, behavior: "smooth" });
  }
}

/**
 * Create-flow only: publishes --create-keyboard-inset on :root and nudges focused
 * inputs/textareas into view. Unmount clears the CSS variable.
 */
export default function CreateFlowKeyboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const { keyboardInsetPx } = useCreateKeyboardInset();

  useEffect(() => {
    const root = document.documentElement;
    const v = `${Math.round(keyboardInsetPx)}px`;
    root.style.setProperty("--create-keyboard-inset", v);
    return () => {
      root.style.setProperty("--create-keyboard-inset", "0px");
    };
  }, [keyboardInsetPx]);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (!shouldHandleFocusTarget(e.target)) return;
      const el = e.target as HTMLElement;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollFocusedFieldIntoView(el));
      });
    };

    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, []);

  return <>{children}</>;
}
