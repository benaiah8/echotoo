import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { PiArrowLeft, PiArrowRight, PiCheck, PiInfo, PiX } from "react-icons/pi";
import {
  CREATE_FLOW_TOP_GAP_BELOW_SAFE_AREA_PX,
  readCreateFlowBottomTabWidthPx,
  lastCreateFlowBottomTabWidthPx,
} from "../../lib/createFlowChrome";
import { Paths } from "../../router/Paths";

const LABELS = {
  hangout: "Event",
  experience: "Experience",
} as const;

function phaseLabel(pathname: string): string {
  if (pathname.startsWith(Paths.createFinalize)) return "Create post";
  if (pathname.startsWith(Paths.createCategories)) return "Caption";
  return "Activities";
}

export type CreateFlowTopBarActionIcon =
  | "close"
  | "arrow-right"
  | "arrow-left"
  | "check"
  | "info";

export type CreateFlowTopBarAction = {
  onClick: () => void;
  /** Accessible name */
  label: string;
  icon: CreateFlowTopBarActionIcon;
};

export type CreateFlowTopBarProps = {
  leftAction?: CreateFlowTopBarAction;
  rightAction?: CreateFlowTopBarAction;
  /** Solid white-ish border (Activities + Create post only; other create steps keep default chrome). */
  emphasizeWhiteBorder?: boolean;
};

function ActionIcon({ icon }: { icon: CreateFlowTopBarActionIcon }) {
  const cls = "h-[1.05rem] w-[1.05rem] shrink-0 text-current";
  switch (icon) {
    case "close":
      return <PiX className={cls} aria-hidden />;
    case "arrow-right":
      return <PiArrowRight className={cls} aria-hidden />;
    case "arrow-left":
      return <PiArrowLeft className={cls} aria-hidden />;
    case "check":
      return <PiCheck className={cls} aria-hidden />;
    case "info":
      return <PiInfo className={cls} aria-hidden />;
    default:
      return null;
  }
}

/** Standalone circles beside the frosted pill: light = dark fill + light icon; dark = white fill + dark icon */
function CircleAction({ action }: { action: CreateFlowTopBarAction }) {
  return (
    <button
      type="button"
      onClick={action.onClick}
      aria-label={action.label}
      className={[
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        "border border-[var(--create-border-top-circle)] bg-neutral-950 text-white",
        "shadow-[0_2px_10px_rgba(0,0,0,0.22),0_1px_3px_rgba(0,0,0,0.14)]",
        "transition hover:brightness-110 active:scale-[0.96]",
        "app-dark:bg-white app-dark:text-neutral-950",
        "app-dark:shadow-[0_4px_16px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)]",
        "app-dark:hover:brightness-95",
      ].join(" ")}
    >
      <ActionIcon icon={action.icon} />
    </button>
  );
}

export default function CreateFlowTopBar({
  leftAction,
  rightAction,
  emphasizeWhiteBorder = false,
}: CreateFlowTopBarProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const [btWidth, setBtWidth] = useState(readCreateFlowBottomTabWidthPx);

  const postTypeRaw = (searchParams.get("type") || "experience").toLowerCase();
  const isHangout = postTypeRaw === "hangout";
  const typeLabel = isHangout ? LABELS.hangout : LABELS.experience;

  const hasSideActions = Boolean(leftAction || rightAction);

  useLayoutEffect(() => {
    const w = readCreateFlowBottomTabWidthPx();
    if (w > 0) setBtWidth(w);
  }, [location.pathname]);

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

  const publishTopInset = () => {
    const el = rootRef.current;
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    document.documentElement.style.setProperty(
      "--create-flow-top-bar-total",
      `${h}px`
    );
  };

  useLayoutEffect(() => {
    publishTopInset();
    const ro = new ResizeObserver(() => publishTopInset());
    if (rootRef.current) ro.observe(rootRef.current);
    window.addEventListener("resize", publishTopInset);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publishTopInset);
      document.documentElement.style.removeProperty(
        "--create-flow-top-bar-total"
      );
    };
  }, [btWidth, hasSideActions, emphasizeWhiteBorder]);

  const widthPx = btWidth > 0 ? btWidth : lastCreateFlowBottomTabWidthPx;

  /** Full-width pill when no flanking circles (Caption step). */
  const fullPillStyle: CSSProperties = {
    maxWidth: "calc(100vw - 24px)",
    minWidth: 0,
    width: widthPx > 0 ? widthPx : "min(min(640px, calc(100vw - 24px)), 100%)",
  };

  /** Center pill only: cap width to tab width but shrink when circles flank. */
  const centerPillStyle: CSSProperties = {
    minWidth: 0,
    flex: "1 1 0%",
    maxWidth: widthPx > 0 ? `${widthPx}px` : "min(640px, calc(100vw - 96px))",
  };

  const chrome = emphasizeWhiteBorder
    ? [
        "pointer-events-auto shrink-0 border border-[var(--create-border-top-chrome)]",
        "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
        "shadow-[0_4px_24px_rgba(0,0,0,0.12)]",
        "app-dark:shadow-[0_4px_28px_rgba(0,0,0,0.35)]",
      ].join(" ")
    : [
        "pointer-events-auto shrink-0 border border-[var(--bottom-tab-border)]",
        "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
        "shadow-[0_4px_24px_rgba(0,0,0,0.12)]",
      ].join(" ");

  const phaseRow = (
    <>
      <span
        className={
          hasSideActions
            ? "min-w-0 flex-1 truncate text-left text-[11px] font-medium text-[var(--text)]/90 sm:text-[12px]"
            : "min-w-[10ch] shrink-0 text-left text-[11px] font-medium text-[var(--text)]/90 sm:min-w-[11ch] sm:text-[12px]"
        }
      >
        {phaseLabel(location.pathname)}
      </span>
      <span
        className={
          hasSideActions
            ? "inline-flex max-w-[min(50%,11rem)] shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/35 px-2 py-0.5"
            : "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/35 px-2 py-0.5"
        }
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background: isHangout ? "rgb(34, 197, 94)" : "rgb(249, 115, 22)",
            boxShadow: isHangout
              ? "0 0 6px 2px rgba(34, 197, 94, 0.55)"
              : "0 0 6px 2px rgba(249, 115, 22, 0.55)",
          }}
          aria-hidden
        />
        <span className="whitespace-nowrap text-[10px] font-medium text-[var(--text)]/85 sm:text-[11px]">
          {typeLabel}
        </span>
      </span>
    </>
  );

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 top-0 z-40 flex justify-center pointer-events-none"
      style={{
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${CREATE_FLOW_TOP_GAP_BELOW_SAFE_AREA_PX}px)`,
      }}
    >
      {hasSideActions ? (
        <div className="pointer-events-none flex w-full max-w-[min(640px,calc(100vw-12px))] items-center justify-center gap-2 px-2 sm:gap-2.5">
          <div className="pointer-events-auto flex shrink-0 items-center">
            {leftAction ? (
              <CircleAction action={leftAction} />
            ) : (
              <span className="inline-block h-8 w-8 shrink-0" aria-hidden />
            )}
          </div>

          <div
            className={[
              chrome,
              "flex min-h-0 items-center gap-1.5 rounded-full px-2 py-1.5 sm:gap-2 sm:px-2.5",
              "justify-between",
            ].join(" ")}
            style={centerPillStyle}
          >
            {phaseRow}
          </div>

          <div className="pointer-events-auto flex shrink-0 items-center">
            {rightAction ? (
              <CircleAction action={rightAction} />
            ) : (
              <span className="inline-block h-8 w-8 shrink-0" aria-hidden />
            )}
          </div>
        </div>
      ) : (
        <div
          className={[
            chrome,
            "flex min-h-0 shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 sm:gap-2 sm:px-2.5",
            "justify-between",
          ].join(" ")}
          style={fullPillStyle}
        >
          {phaseRow}
        </div>
      )}
    </div>
  );
}
