import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLocation } from "react-router-dom";
import { Paths } from "../../router/Paths";
import { CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID } from "../../lib/createFlowNoticeIds";
import {
  readCreateFlowBottomTabWidthPx,
  lastCreateFlowBottomTabWidthPx,
} from "../../lib/createFlowChrome";
import {
  useCreateFlowNotices,
  type CreateFlowNotice,
} from "./CreateFlowNoticeContext";

function publishNoticeStackHeight(px: number) {
  if (px <= 0) {
    document.documentElement.style.removeProperty(
      "--create-flow-notice-stack-height"
    );
  } else {
    document.documentElement.style.setProperty(
      "--create-flow-notice-stack-height",
      `${px}px`
    );
  }
}

/**
 * Thin frosted pills fixed under {@link CreateFlowTopBar} for inline errors,
 * caption validation, upload progress, etc. Height is published to
 * `--create-flow-notice-stack-height` for main column padding.
 */
export default function CreateFlowNoticeStack() {
  const { pathname } = useLocation();
  const { notices } = useCreateFlowNotices();
  const rootRef = useRef<HTMLDivElement>(null);
  const [btWidth, setBtWidth] = useState(readCreateFlowBottomTabWidthPx);

  const showAnchoredStack =
    pathname.startsWith(Paths.createActivities) ||
    pathname.startsWith(Paths.createCategories) ||
    pathname.startsWith(Paths.createFinalize);

  const onActivitiesStep = pathname.startsWith(Paths.createActivities);

  /** Caption warning: hide on activities so Prev doesn’t leave a dead pill; shown on categories + finalize. */
  const visibleNotices = useMemo(() => {
    if (!onActivitiesStep) return notices;
    return notices.filter(
      (n) => n.id !== CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID
    );
  }, [notices, onActivitiesStep]);

  useEffect(() => {
    const el = document.getElementById("bottom-tab");
    const measure = () => {
      const w = readCreateFlowBottomTabWidthPx();
      setBtWidth(w > 0 ? w : lastCreateFlowBottomTabWidthPx);
    };
    measure();
    window.addEventListener("resize", measure);
    const mo = el ? new MutationObserver(measure) : null;
    if (el && mo)
      mo.observe(el, { attributes: true, childList: true, subtree: true });
    el?.addEventListener("transitionend", measure);
    return () => {
      window.removeEventListener("resize", measure);
      mo?.disconnect();
      el?.removeEventListener("transitionend", measure);
    };
  }, []);

  const publishHeight = () => {
    const el = rootRef.current;
    if (!el || visibleNotices.length === 0) {
      publishNoticeStackHeight(0);
      return;
    }
    const h = Math.ceil(el.getBoundingClientRect().height);
    publishNoticeStackHeight(h);
  };

  useLayoutEffect(() => {
    if (!showAnchoredStack || visibleNotices.length === 0) {
      publishNoticeStackHeight(0);
      return;
    }
    publishHeight();
    const ro = new ResizeObserver(() => publishHeight());
    if (rootRef.current) ro.observe(rootRef.current);
    return () => {
      ro.disconnect();
      publishNoticeStackHeight(0);
    };
  }, [visibleNotices, btWidth, showAnchoredStack]);

  if (!showAnchoredStack || visibleNotices.length === 0) return null;

  const widthPx = btWidth > 0 ? btWidth : lastCreateFlowBottomTabWidthPx;
  const columnStyle: CSSProperties = {
    maxWidth: "calc(100vw - 24px)",
    minWidth: 0,
    width: widthPx > 0 ? widthPx : "min(min(640px, calc(100vw - 24px)), 100%)",
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 z-[38] flex flex-col items-center justify-start px-3 pt-2 pointer-events-none"
      style={{
        top: "var(--create-flow-top-bar-total, 0px)",
      }}
    >
      <div
        className="flex w-full flex-col items-stretch gap-1.5 pointer-events-none"
        style={columnStyle}
      >
        {visibleNotices.map((n) => (
          <NoticePill key={n.id} notice={n} />
        ))}
      </div>
    </div>
  );
}

function NoticePill({ notice }: { notice: CreateFlowNotice }) {
  const v = notice.variant ?? "default";
  const isWarning = v === "warning";
  const isProgress = v === "progress";
  const indeterminate = Boolean(isProgress && notice.indeterminate);
  const showDeterminateBar =
    isProgress && typeof notice.progress === "number" && !notice.indeterminate;

  const accentShell = isWarning || indeterminate;

  const shellClass = [
    "pointer-events-auto flex w-full flex-col rounded-full border px-3",
    indeterminate ? "py-1" : "py-1.5",
    "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
    "shadow-[0_2px_14px_rgba(0,0,0,0.1)]",
    accentShell
      ? "border-[var(--brand)]/50 shadow-[0_0_14px_rgba(247,208,71,0.22),0_2px_10px_rgba(0,0,0,0.1)]"
      : "border-[var(--bottom-tab-border)]",
  ].join(" ");

  const interactive = typeof notice.onAction === "function";

  return (
    <div
      className={shellClass}
      role={isWarning ? "alert" : indeterminate ? "status" : undefined}
      aria-live={isWarning || indeterminate ? "polite" : undefined}
      aria-busy={indeterminate ? true : undefined}
    >
      <button
        type="button"
        disabled={!interactive}
        onClick={() => notice.onAction?.()}
        className={[
          "flex w-full items-center gap-2 text-left min-w-0",
          interactive
            ? "cursor-pointer rounded-full -mx-1 px-1 py-0.5 hover:bg-[var(--surface)]/25 active:scale-[0.99] transition"
            : "cursor-default",
        ].join(" ")}
      >
        {indeterminate ? (
          <span
            className="inline-block size-3 shrink-0 rounded-full border-2 border-[var(--brand)]/35 border-t-[var(--brand)] animate-spin"
            aria-hidden
          />
        ) : null}
        <span
          className={[
            "text-[10px] sm:text-[11px] font-medium text-[var(--text)]/90 flex-1 min-w-0",
            indeterminate ? "leading-none" : "leading-snug",
          ].join(" ")}
        >
          {notice.message}
        </span>
        {interactive ? (
          <span className="text-[10px] font-semibold text-[var(--brand)] shrink-0 whitespace-nowrap">
            {notice.actionLabel ?? "Show"}
          </span>
        ) : null}
      </button>
      {showDeterminateBar ? (
        <div
          className="mt-1.5 h-[2px] w-full overflow-hidden rounded-full"
          style={{
            background: "color-mix(in oklab, var(--text) 10%, transparent)",
          }}
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-200 ease-out"
            style={{
              width: `${Math.min(1, Math.max(0, notice.progress!)) * 100}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
