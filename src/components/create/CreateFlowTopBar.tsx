import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  PiArrowLeft,
  PiArrowRight,
  PiCheck,
  PiImages,
  PiInfo,
  PiPlusBold,
  PiX,
  PiXBold,
} from "react-icons/pi";
import {
  CREATE_FLOW_TOP_GAP_BELOW_SAFE_AREA_PX,
  FINALIZE_COMPOSER_COLUMN_CLASS,
  readCreateFlowComposerWidthPx,
  lastCreateFlowBottomTabWidthPx,
} from "../../lib/createFlowChrome";
import { Paths } from "../../router/Paths";
import { postTypeCompactLabel } from "../../lib/postTypeLabels";
import ChooserPillAvatar from "./ChooserPillAvatar";

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
  | "info"
  | "images";

export type CreateFlowTopBarAction = {
  onClick: () => void;
  /** Accessible name */
  label: string;
  icon: CreateFlowTopBarActionIcon;
  disabled?: boolean;
};

export type CreateFlowTopBarPrimaryCta = {
  label: string;
  busyLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Internal post type for Event green / Place orange identity. */
  postType: "hangout" | "experience";
  /** Chooser-style pill avatar inside the CTA. Omit when no sync avatar (e.g. admin edit). */
  avatar?: {
    url?: string | null;
    name?: string | null;
    userId?: string | null;
  } | null;
};

export type CreateFlowTopBarProps = {
  leftAction?: CreateFlowTopBarAction;
  rightAction?: CreateFlowTopBarAction;
  /** Solid white-ish border (Activities + Create post only; other create steps keep default chrome). */
  emphasizeWhiteBorder?: boolean;
  /**
   * V4 finalize: X | Media | Publish Event/Place or Save.
   * Other create steps keep the phase-label + type-pill bar.
   */
  variant?: "wizard" | "v4Composer";
  /**
   * `overlay` (default): document-fixed, used by other create steps.
   * `flow`: in-flow in a viewport-sized parent.
   * `anchor`: absolute to the Finalize composer root (not document-fixed).
   */
  layout?: "overlay" | "flow" | "anchor";
  mediaAction?: CreateFlowTopBarAction;
  primaryCta?: CreateFlowTopBarPrimaryCta;
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
    case "images":
      return <PiImages className={cls} aria-hidden />;
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
      disabled={action.disabled}
      aria-label={action.label}
      className={[
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        "border border-[var(--create-border-top-circle)] bg-neutral-950 text-white",
        "shadow-[0_2px_10px_rgba(0,0,0,0.22),0_1px_3px_rgba(0,0,0,0.14)]",
        "transition hover:brightness-110 active:scale-[0.96]",
        "app-dark:bg-white app-dark:text-neutral-950",
        "app-dark:shadow-[0_4px_16px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)]",
        "app-dark:hover:brightness-95",
        "disabled:pointer-events-none disabled:opacity-45",
      ].join(" ")}
    >
      <ActionIcon icon={action.icon} />
    </button>
  );
}

/** Shared selected/light surface: same tokens as chooser Create-event CTA. */
const V4_SELECTED_SURFACE = [
  "bg-[var(--create-chooser-cta-selected-surface)]",
  "text-[var(--create-chooser-cta-selected-label)]",
].join(" ");

function V4CloseCircle({ action }: { action: CreateFlowTopBarAction }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        action.onClick();
      }}
      disabled={action.disabled}
      aria-label={action.label}
      className={[
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
        V4_SELECTED_SURFACE,
        "border border-[var(--bottom-tab-border)]",
        "shadow-[0_2px_10px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)]",
        "app-dark:shadow-[0_4px_16px_rgba(0,0,0,0.28)]",
        "transition hover:brightness-110 active:scale-[0.96]",
        "disabled:pointer-events-none disabled:opacity-45",
      ].join(" ")}
    >
      <PiXBold className="h-5 w-5 shrink-0" aria-hidden />
    </button>
  );
}

function V4MediaPill({ action }: { action: CreateFlowTopBarAction }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        action.onClick();
      }}
      disabled={action.disabled}
      aria-label={action.label}
      className={[
        "relative ml-2.5 inline-flex h-10 min-w-[7rem] shrink-0 items-center rounded-full",
        "pl-[3.25rem] pr-3.5",
        "text-[13px] font-bold leading-none tracking-tight text-[#1d6fa8]",
        "bg-white/92",
        "border border-[#3aa0d8]/45",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_0_12px_rgba(58,160,216,0.22),0_2px_8px_rgba(0,0,0,0.08)]",
        "app-dark:bg-white/92 app-dark:text-[#1d6fa8] app-dark:border-[#3aa0d8]/55",
        "app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_0_14px_rgba(58,160,216,0.28),0_3px_10px_rgba(0,0,0,0.25)]",
        "transition hover:brightness-110 active:scale-[0.96]",
        "disabled:pointer-events-none disabled:opacity-45",
      ].join(" ")}
    >
      {/* Media disc: left of label, slight bottom overhang so outline reads outside the pill */}
      <span
        className={[
          "pointer-events-none absolute bottom-[-0.35rem] left-[0.3rem] z-[1]",
          "flex h-[2.35rem] w-[2.35rem] items-center justify-center",
          "rounded-full",
          "border-[1.5px] border-[#3aa0d8]/65 bg-white text-[#1d6fa8]",
          "shadow-[0_0_8px_rgba(58,160,216,0.35),0_2px_6px_rgba(0,0,0,0.1)]",
          "app-dark:border-[#7ec8ef]/80 app-dark:bg-[#0f3f5c] app-dark:text-[#7ec8ef]",
          "app-dark:shadow-[0_0_10px_rgba(126,200,239,0.35),0_2px_8px_rgba(0,0,0,0.4)]",
        ].join(" ")}
        aria-hidden
      >
        <PiImages className="h-[1.15rem] w-[1.15rem] shrink-0" />
        <span
          className={[
            "absolute -right-0.5 -top-0.5 flex h-[1.05rem] w-[1.05rem]",
            "items-center justify-center rounded-full",
            "border border-black/10 bg-[var(--brand)] text-[var(--brand-ink)]",
            "shadow-[0_0_6px_rgba(237,189,0,0.45),0_1px_2px_rgba(0,0,0,0.18)]",
            "app-dark:border-white/25",
            "app-dark:shadow-[0_0_8px_rgba(237,189,0,0.5),0_1px_2px_rgba(0,0,0,0.3)]",
          ].join(" ")}
        >
          <PiPlusBold className="h-[0.62rem] w-[0.62rem] shrink-0" />
        </span>
      </span>
      <span className="relative z-0">Media</span>
    </button>
  );
}

function V4PrimaryCtaButton({ cta }: { cta: CreateFlowTopBarPrimaryCta }) {
  const isHangout = cta.postType === "hangout";
  const label = cta.loading && cta.busyLabel ? cta.busyLabel : cta.label;
  const avatar = cta.avatar;
  const showAvatar = avatar != null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (cta.disabled || cta.loading) return;
        cta.onClick();
      }}
      disabled={cta.disabled || cta.loading}
      aria-label={label}
      className={[
        "inline-flex h-10 min-h-10 w-fit max-w-full shrink-0 items-center rounded-full",
        showAvatar ? "gap-1.5 py-1 pl-2.5 pr-1 sm:gap-2 sm:pl-3" : "px-3",
        "text-[13px] font-bold leading-none tracking-tight",
        V4_SELECTED_SURFACE,
        "transition hover:brightness-110 active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-55",
        isHangout
          ? [
              "border border-green-500/50",
              "shadow-[0_4px_22px_rgba(34,197,94,0.26)]",
            ].join(" ")
          : [
              "border border-orange-500/34",
              "shadow-[0_4px_18px_rgba(249,115,22,0.14)]",
            ].join(" "),
      ].join(" ")}
    >
      <span className="max-w-full whitespace-nowrap">{label}</span>
      {showAvatar && avatar ? (
        <ChooserPillAvatar
          url={avatar.url}
          name={avatar.name}
          userId={avatar.userId}
          className="h-8 w-10"
        />
      ) : null}
    </button>
  );
}

export default function CreateFlowTopBar({
  leftAction,
  rightAction,
  emphasizeWhiteBorder = false,
  variant = "wizard",
  layout = "overlay",
  mediaAction,
  primaryCta,
}: CreateFlowTopBarProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const [composerWidth, setComposerWidth] = useState(
    readCreateFlowComposerWidthPx,
  );

  const postTypeRaw = (searchParams.get("type") || "experience").toLowerCase();
  const isHangout = postTypeRaw === "hangout";
  const typeLabel = postTypeCompactLabel(postTypeRaw);
  const isV4 = variant === "v4Composer";

  const hasSideActions = Boolean(leftAction || rightAction);

  useLayoutEffect(() => {
    const w = readCreateFlowComposerWidthPx();
    if (w > 0) setComposerWidth(w);
  }, [location.pathname]);

  useEffect(() => {
    const el = document.getElementById("bottom-tab");
    const measure = () => {
      const w = readCreateFlowComposerWidthPx();
      setComposerWidth(w > 0 ? w : lastCreateFlowBottomTabWidthPx);
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
      `${h}px`,
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
        "--create-flow-top-bar-total",
      );
    };
  }, [composerWidth, hasSideActions, emphasizeWhiteBorder, isV4, layout]);

  const widthPx =
    composerWidth > 0 ? composerWidth : lastCreateFlowBottomTabWidthPx;

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
      className={
        layout === "anchor"
          ? "absolute inset-x-0 top-0 z-40 flex w-full justify-center pointer-events-none"
          : layout === "flow"
            ? "relative z-40 flex w-full shrink-0 justify-center pointer-events-none"
            : "fixed inset-x-0 top-0 z-40 flex justify-center pointer-events-none"
      }
      style={{
        paddingTop:
          layout === "anchor"
            ? `calc(var(--safe-area-top-layout) + ${CREATE_FLOW_TOP_GAP_BELOW_SAFE_AREA_PX}px)`
            : `calc(env(safe-area-inset-top, 0px) + ${CREATE_FLOW_TOP_GAP_BELOW_SAFE_AREA_PX}px)`,
      }}
    >
      {isV4 ? (
        <div
          className={`pointer-events-auto flex items-center justify-between gap-1.5 sm:gap-2 ${
            layout === "anchor"
              ? FINALIZE_COMPOSER_COLUMN_CLASS
              : "w-full max-w-[min(640px,calc(100vw-12px))] px-2"
          }`}
        >
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
            {leftAction ? (
              <V4CloseCircle action={leftAction} />
            ) : (
              <span className="inline-block h-10 w-10 shrink-0" aria-hidden />
            )}
            {mediaAction ? (
              <V4MediaPill action={mediaAction} />
            ) : (
              <span className="inline-block h-10 w-10 shrink-0" aria-hidden />
            )}
          </div>
          {primaryCta ? (
            <V4PrimaryCtaButton cta={primaryCta} />
          ) : (
            <span className="inline-block h-10 w-16 shrink-0" aria-hidden />
          )}
        </div>
      ) : hasSideActions ? (
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
