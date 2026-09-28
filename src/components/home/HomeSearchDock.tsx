import {
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { PiArrowLeft } from "react-icons/pi";
import { useCreateKeyboardInset } from "../../hooks/useCreateKeyboardInset";
import {
  isAndroid,
  isIOS,
  isNativeApp,
} from "../../lib/storage/utils/capacitorDetection";

/** Shared height of the back circle and the posts/users switcher. */
const SEARCH_DOCK_CONTROL_PX = 40;
/** Outer frosted wrap (~50px) + gap above results. */
const SEARCH_DOCK_STACK_PX = 64;
/** Gap between the dock and the keyboard top. Same on every platform. */
const SEARCH_DOCK_KEYBOARD_OPEN_GAP_PX = 12;

type HomeSearchDockProps = {
  searchMode: "posts" | "users";
  onSearchModeChange: (mode: "posts" | "users") => void;
  onBack: () => void;
  keyboardInsetPx: number;
  /** From `useCreateKeyboardInset`. Open seat is inset + gap, even when inset is ~0. */
  keyboardOpen?: boolean;
  /** One-shot hint on Search users when posts search settled empty. */
  hintUsersSearch?: boolean;
};

function closedDockBottomOffset(): string {
  if (isNativeApp() && isAndroid()) {
    return "max(14px, calc(var(--safe-area-bottom-layout, 0px) + 6px))";
  }
  if (isIOS()) {
    return "max(5px, min(22px, calc(var(--safe-area-bottom-layout, 0px) - 14px)))";
  }
  return "8px";
}

/**
 * Legacy lift kept only for the keyboard-closed path when a positive inset is
 * still reported. The keyboard-open seat does not use this.
 */
function keyboardOpenBottomCss(keyboardInsetRoundedPx: number): string {
  if (isIOS()) {
    return `max(0.375rem, calc(${keyboardInsetRoundedPx}px - min(24px, var(--safe-area-bottom-layout, 0px)) + 0.875rem))`;
  }
  return `calc(${keyboardInsetRoundedPx}px + 0.375rem)`;
}

function roundedKeyboardInsetPx(keyboardInsetPx: number): number {
  return Math.max(0, Math.round(keyboardInsetPx));
}

/** Open keyboard: inset plus a fixed gap. No safe-area subtraction, no platform branch. */
function keyboardOpenDockBottom(keyboardInsetPx: number): string {
  const kb = roundedKeyboardInsetPx(keyboardInsetPx);
  return `calc(${kb}px + ${SEARCH_DOCK_KEYBOARD_OPEN_GAP_PX}px)`;
}

export function getHomeSearchDockBottom(
  keyboardInsetPx: number,
  keyboardOpen = false,
): string {
  if (keyboardOpen) return keyboardOpenDockBottom(keyboardInsetPx);
  const kb = roundedKeyboardInsetPx(keyboardInsetPx);
  if (kb <= 0) return closedDockBottomOffset();
  return keyboardOpenBottomCss(kb);
}

export function getHomeSearchOverlayPaddingBottom(
  keyboardInsetPx: number,
  keyboardOpen = false,
): string {
  if (keyboardOpen) {
    return `calc(${SEARCH_DOCK_STACK_PX}px + ${keyboardOpenDockBottom(keyboardInsetPx)})`;
  }
  const kb = roundedKeyboardInsetPx(keyboardInsetPx);
  if (kb <= 0) {
    return `calc(${SEARCH_DOCK_STACK_PX}px + var(--safe-area-bottom-layout, 0px))`;
  }
  return `calc(${SEARCH_DOCK_STACK_PX}px + ${keyboardOpenBottomCss(kb)})`;
}

const tabClass = (active: boolean) =>
  [
    "relative flex h-full shrink-0 items-center justify-center whitespace-nowrap rounded-full",
    "px-4 text-[12px] font-semibold leading-none transition-colors",
    active
      ? "bg-[var(--brand)] text-[var(--brand-ink)] shadow-sm"
      : "text-[var(--text)]/70 hover:text-[var(--text)]",
  ].join(" ");

export default function HomeSearchDock({
  searchMode,
  onSearchModeChange,
  onBack,
  keyboardInsetPx,
  keyboardOpen = false,
  hintUsersSearch = false,
}: HomeSearchDockProps) {
  const bottom = getHomeSearchDockBottom(keyboardInsetPx, keyboardOpen);
  const [usersHintPlay, setUsersHintPlay] = useState(false);

  useEffect(() => {
    if (!hintUsersSearch) {
      setUsersHintPlay(false);
      return;
    }
    setUsersHintPlay(true);
  }, [hintUsersSearch]);

  const usersHintClass = usersHintPlay
    ? "home-search-users-hint home-search-users-hint--play"
    : hintUsersSearch
      ? "home-search-users-hint"
      : "";

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-40 flex justify-center px-[var(--gutter)]"
      style={{
        bottom,
        transition: "bottom 200ms ease-out",
      }}
    >
      <div
        className={[
          "pointer-events-auto flex w-fit max-w-[640px] items-center gap-1.5",
          "rounded-full p-[5px] isolate",
          "bg-[color-mix(in_oklab,var(--glass-bg)_82%,transparent)]",
          "backdrop-blur-[28px]",
          "[-webkit-backdrop-filter:blur(28px)]",
          "shadow-[0_4px_18px_rgba(0,0,0,0.18)]",
          "app-dark:shadow-[0_6px_22px_rgba(0,0,0,0.42)]",
        ].join(" ")}
      >
        <button
          type="button"
          aria-label="Back"
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          onClick={onBack}
          className={[
            "flex shrink-0 items-center justify-center rounded-full",
            "border border-[var(--border)] text-[var(--text)]",
            "bg-[var(--glass-bg)]",
            "hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)]",
            "active:scale-[0.96]",
          ].join(" ")}
          style={{
            height: SEARCH_DOCK_CONTROL_PX,
            width: SEARCH_DOCK_CONTROL_PX,
          }}
        >
          <PiArrowLeft className="h-[18px] w-[18px]" aria-hidden />
        </button>

        <div
          className={[
            "inline-flex w-fit max-w-full flex-nowrap items-stretch",
            "rounded-full p-[3px] gap-0.5",
            "border border-[var(--border)]",
            "bg-[color-mix(in_oklab,var(--surface)_38%,transparent)]",
          ].join(" ")}
          role="group"
          aria-label="Search type"
          style={{ height: SEARCH_DOCK_CONTROL_PX }}
        >
          <button
            type="button"
            aria-pressed={searchMode === "posts"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSearchModeChange("posts")}
            className={tabClass(searchMode === "posts")}
          >
            Search posts
          </button>
          <button
            type="button"
            aria-pressed={searchMode === "users"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSearchModeChange("users")}
            className={[tabClass(searchMode === "users"), usersHintClass]
              .filter(Boolean)
              .join(" ")}
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.animationName.includes("home-search-users-pulse")) {
                setUsersHintPlay(false);
              }
            }}
          >
            <span
              aria-hidden
              className="home-search-users-hint__wave home-search-users-hint__wave--a pointer-events-none"
            />
            <span
              aria-hidden
              className="home-search-users-hint__wave home-search-users-hint__wave--b pointer-events-none"
            />
            <span className="relative z-[1]">Search users</span>
          </button>
        </div>
      </div>
    </div>
  );
}

type HomeSearchLayerProps = {
  children: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollTop: string;
  searchMode: "posts" | "users";
  onSearchModeChange: (mode: "posts" | "users") => void;
  onBack: () => void;
  hintUsersSearch?: boolean;
};

/** Search overlay scroller + keyboard-following dock. Mount only while search is active. */
export function HomeSearchLayer({
  children,
  scrollRef,
  scrollTop,
  searchMode,
  onSearchModeChange,
  onBack,
  hintUsersSearch = false,
}: HomeSearchLayerProps) {
  const { keyboardInsetPx, keyboardOpen } = useCreateKeyboardInset();

  return (
    <>
      <div
        ref={scrollRef}
        className="fixed left-0 right-0 z-[25] overflow-y-auto overscroll-y-contain bg-[var(--bg)] [-webkit-overflow-scrolling:touch]"
        style={{
          top: scrollTop,
          bottom: 0,
          paddingBottom: getHomeSearchOverlayPaddingBottom(
            keyboardInsetPx,
            keyboardOpen,
          ),
        }}
      >
        <div className="overflow-x-clip">
          {children}
        </div>
      </div>
      <HomeSearchDock
        searchMode={searchMode}
        onSearchModeChange={onSearchModeChange}
        onBack={onBack}
        keyboardInsetPx={keyboardInsetPx}
        keyboardOpen={keyboardOpen}
        hintUsersSearch={hintUsersSearch}
      />
    </>
  );
}
