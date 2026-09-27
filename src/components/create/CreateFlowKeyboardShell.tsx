import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useCreateKeyboardInset } from "../../hooks/useCreateKeyboardInset";
import { isCreateFinalizeComposerPath } from "../../lib/createFlowChrome";
import { scrollCreateFlowFieldIntoView } from "../../lib/createFlowScrollFieldIntoView";

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

/**
 * Finalize V4: PrimaryPageContainer already pads `--create-actions-total-bottom`
 * (metadata toolbar). Add keyboard inset, writing-toolbar height (0 when relocated), and scroll breathing room.
 */
export const createFlowFinalizeColumnStyle: CSSProperties = {
  paddingTop:
    "calc(var(--create-flow-top-bar-total, 0px) + var(--create-flow-notice-stack-height, 0px))",
  paddingBottom:
    "calc(var(--create-keyboard-inset, 0px) + var(--create-finalize-writing-toolbar-height, 28px) + 8px + 72px)",
  transition: "padding-top 0.28s ease-out, padding-bottom 0.28s ease-out",
};

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
 * Create-flow only: publishes --create-keyboard-inset on :root and nudges focused
 * inputs/textareas into view. Unmount clears the CSS variable.
 */
export default function CreateFlowKeyboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const { keyboardInsetPx } = useCreateKeyboardInset();
  const { pathname } = useLocation();
  const skipDocumentFieldScroll = isCreateFinalizeComposerPath(pathname);

  useEffect(() => {
    const root = document.documentElement;
    const v = `${Math.round(keyboardInsetPx)}px`;
    root.style.setProperty("--create-keyboard-inset", v);
    return () => {
      root.style.setProperty("--create-keyboard-inset", "0px");
    };
  }, [keyboardInsetPx]);

  useEffect(() => {
    if (skipDocumentFieldScroll) return;

    const onFocusIn = (e: FocusEvent) => {
      if (!shouldHandleFocusTarget(e.target)) return;
      const el = e.target as HTMLElement;
      if (el.closest("[data-create-finalize-composer-chrome]")) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollCreateFlowFieldIntoView(el));
      });
    };

    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, [skipDocumentFieldScroll]);

  return <>{children}</>;
}
