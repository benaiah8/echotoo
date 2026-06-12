import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  PiArrowCounterClockwise,
  PiBell,
  PiChatCircleText,
  PiFileText,
  PiFlag,
  PiList,
  PiMagnifyingGlass,
  PiMegaphone,
  PiPencilSimple,
  PiProhibit,
  PiShareFat,
  PiSignOut,
  PiCaretLeft,
  PiInfo,
  PiTrashSimple,
} from "react-icons/pi";
import { Capacitor } from "@capacitor/core";
import Logo from "../ui/Logo";
import ShareProfileModal from "./ShareProfileModal";
import HangoutNotificationExplainerModal from "../ui/HangoutNotificationExplainerModal";
import ThemeSwitch from "../ui/ThemeSwitch";
import { getPublicShareBaseUrl } from "../../lib/publicSiteUrl";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import { Paths } from "../../router/Paths";
import toast from "react-hot-toast";
import {
  getPushRegistrationUserFeedback,
  getNativePushReceiveState,
  getNativePushStatusLabel,
  requestNotificationPermissionAndRegister,
  type NativePushReceiveUiState,
} from "../../lib/explicitNativePushRegistration";
import { App } from "@capacitor/app";
import type { Profile } from "../../contexts/ProfileContext";
import { useOverlayEdgeSwipeDismiss } from "../../hooks/useOverlayEdgeSwipeDismiss";

/** Own-profile action sheet: wider-than-default edge band, strip stacked under sheet (CreateChooser lesson). */
const OWN_PROFILE_ACTION_SHEET_EDGE_MAX_WIDTH_VW = 0.32;
const OWN_PROFILE_ACTION_SHEET_EDGE_MAX_WIDTH_PX = 128;

/** Match PostMenu / header: frosted surface + blur (inline for WebKit). */
const glassMenuSurface: React.CSSProperties = {
  backgroundColor: "var(--glass-bg)",
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
};

/** Space below hamburger before first pill (px). */
const PROFILE_ACTION_MENU_TOP_OFFSET_PX = 16;
/** Vertical gap between Report / Block / Share pills (px). */
const PROFILE_ACTION_MENU_BETWEEN_PILLS_PX = 6;

/** Minimum width for the stacked action pills (all match widest); fits “Allow notifications” on one line. */
const PROFILE_ACTION_MENU_MIN_WIDTH_PX = 200;

const profileActionIconWrapClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-2)_55%,transparent)]";

export default function ProfileTopBar({
  onLogoClick,
  onSearch,
  profile,
  /** When provided, shows Report user button (Play Store compliance) */
  reportUserId,
  onRequestReport,
  onSearchFocusChange,
  /** Other profile: show Block / Unblock (auth user id of profile owner). */
  showBlockControls,
  isBlocked,
  onRequestBlock,
  onRequestUnblock,
  blockBusy,
  /** Minimal top bar: logo + block/unblock only (no search, report, or share). */
  blockedShellTopBar,
  showHangoutReminderSetupInMenu = false,
  /** Own profile: open full-screen profile editor (parent owns modal). */
  onRequestEditProfile,
  /** Own profile: show logout confirm (parent owns dialog + signOut). */
  onRequestLogout,
  /** Own profile: open full-screen editor scrolled to account deletion (parent owns flow). */
  onRequestDeleteAccount,
}: {
  onLogoClick?: () => void;
  onSearch?: (q: string) => void;
  profile?: Profile | null;
  reportUserId?: string;
  reportUsername?: string;
  /** In-app report (parent owns modal). */
  onRequestReport?: () => void;
  /** Search field focus — pin fixed header while keyboard is open. */
  onSearchFocusChange?: (focused: boolean) => void;
  showBlockControls?: boolean;
  isBlocked?: boolean;
  onRequestBlock?: () => void;
  onRequestUnblock?: () => void;
  blockBusy?: boolean;
  blockedShellTopBar?: boolean;
  /** Own profile only: notification explainer from overflow (always available; not tied to Never ask again). */
  showHangoutReminderSetupInMenu?: boolean;
  onRequestEditProfile?: () => void;
  onRequestLogout?: () => void;
  onRequestDeleteAccount?: () => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHangoutReminderModal, setShowHangoutReminderModal] =
    useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);
  const [nativePushUi, setNativePushUi] =
    useState<NativePushReceiveUiState | null>(null);
  const [nativePushRegisterBusy, setNativePushRegisterBusy] = useState(false);
  const profileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const profileMenuDropdownRef = useRef<HTMLDivElement>(null);
  /** Own-profile sheet portal root (backdrop + sheet + edge strip) — used for outside-dismiss hit-testing. */
  const ownProfileActionPortalRef = useRef<HTMLDivElement>(null);
  const playAnimatedDismissRef = useRef<() => void>(() => {});

  const showReport = Boolean(reportUserId && onRequestReport);
  const showBlock = Boolean(showBlockControls);
  const showShare = Boolean(profile);
  const showHangoutReminderMenuItem = Boolean(showHangoutReminderSetupInMenu);
  const showEditProfile = Boolean(onRequestEditProfile);
  const showLogout = Boolean(onRequestLogout);
  /** Own profile: full action sheet + scroll lock; other profiles keep compact pill menu. */
  const useOwnProfileActionSheet = showEditProfile && showLogout;
  const showProfileOverflowMenu =
    !blockedShellTopBar &&
    (showReport ||
      showBlock ||
      showShare ||
      showHangoutReminderMenuItem ||
      showEditProfile ||
      showLogout);

  const nativePushSubline =
    isNativeApp() && nativePushUi != null
      ? getNativePushStatusLabel(nativePushUi)
      : null;
  const shouldDirectlyRefreshIosPush =
    nativePushUi === "granted" && Capacitor.getPlatform() === "ios";
  const nativePushMenuLabel = shouldDirectlyRefreshIosPush
    ? "Refresh notifications"
    : "Allow notifications";

  const closeProfileMenu = useCallback(() => {
    setProfileMenuOpen(false);
    setMenuAnchorRect(null);
  }, []);

  const ownProfileActionSheetOpen = profileMenuOpen && useOwnProfileActionSheet;

  const { overlayMotionStyle, edgeStripProps, playAnimatedDismiss } =
    useOverlayEdgeSwipeDismiss({
      active: ownProfileActionSheetOpen,
      engageSwipe: ownProfileActionSheetOpen,
      edgeStripLeftInsetPx: isNativeApp() ? 8 : 12,
      edgeMaxWidthVw: OWN_PROFILE_ACTION_SHEET_EDGE_MAX_WIDTH_VW,
      edgeMaxWidthPx: OWN_PROFILE_ACTION_SHEET_EDGE_MAX_WIDTH_PX,
      edgeStripZClass: "z-[5]",
      onDismiss: closeProfileMenu,
    });

  playAnimatedDismissRef.current = playAnimatedDismiss;

  const refreshNativePushStatus = useCallback(async () => {
    if (!isNativeApp() || !showHangoutReminderSetupInMenu) {
      setNativePushUi(null);
      return;
    }
    const { ui } = await getNativePushReceiveState();
    setNativePushUi(ui);
  }, [showHangoutReminderSetupInMenu]);

  useEffect(() => {
    void refreshNativePushStatus();
  }, [refreshNativePushStatus]);

  useEffect(() => {
    if (profileMenuOpen && showHangoutReminderSetupInMenu) {
      void refreshNativePushStatus();
    }
  }, [profileMenuOpen, showHangoutReminderSetupInMenu, refreshNativePushStatus]);

  useEffect(() => {
    if (!isNativeApp() || !showHangoutReminderSetupInMenu) return;
    let handle: { remove: () => Promise<void> } | undefined;
    void App.addListener("resume", () => {
      void refreshNativePushStatus();
    }).then((h) => {
      handle = h;
    });
    return () => {
      void handle?.remove();
    };
  }, [showHangoutReminderSetupInMenu, refreshNativePushStatus]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (profileMenuTriggerRef.current?.contains(t)) return;
      if (useOwnProfileActionSheet) {
        if (ownProfileActionPortalRef.current?.contains(t)) return;
      } else if (profileMenuDropdownRef.current?.contains(t)) return;
      closeProfileMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ownProfileActionSheetOpen) {
        playAnimatedDismissRef.current();
        return;
      }
      closeProfileMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [
    profileMenuOpen,
    closeProfileMenu,
    useOwnProfileActionSheet,
    ownProfileActionSheetOpen,
  ]);

  /** Own-profile sheet: lock document scroll (same pattern as ReportModal). */
  useEffect(() => {
    if (!profileMenuOpen || !useOwnProfileActionSheet) return;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [profileMenuOpen, useOwnProfileActionSheet]);

  const notifyRegistrationOutcome = useCallback(
    (result: Awaited<
      ReturnType<typeof requestNotificationPermissionAndRegister>
    >) => {
      const fb = getPushRegistrationUserFeedback(result);
      if (fb.kind === "success") toast.success(fb.message);
      else if (fb.kind === "error") toast.error(fb.message);
    },
    []
  );

  const refreshNativePushRegistration = useCallback(async () => {
    if (nativePushRegisterBusy) return;
    setNativePushRegisterBusy(true);
    try {
      const result = await requestNotificationPermissionAndRegister();
      notifyRegistrationOutcome(result);
    } finally {
      await refreshNativePushStatus();
      setNativePushRegisterBusy(false);
    }
  }, [
    nativePushRegisterBusy,
    notifyRegistrationOutcome,
    refreshNativePushStatus,
  ]);

  // Pill menu only: close on scroll/resize so fixed position does not drift from trigger
  useEffect(() => {
    if (!profileMenuOpen || useOwnProfileActionSheet) return;
    const close = () => closeProfileMenu();
    window.addEventListener("scroll", close, { capture: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [profileMenuOpen, closeProfileMenu, useOwnProfileActionSheet]);

  // simple debounce so we don't query on every keystroke
  useEffect(() => {
    const id = setTimeout(() => onSearch?.(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q, onSearch]);

  // Generate profile URL
  const profileUrl = useMemo(() => {
    if (!profile) return "";
    const baseUrl = getPublicShareBaseUrl();
    if (profile.username) {
      return `${baseUrl}/u/${profile.username}`;
    }
    return `${baseUrl}/u/${profile.id}`;
  }, [profile]);

  const pillWidth = "80%";
  const pillMaxWidth = 640;

  const profileActionPillClass = [
    "flex w-full min-w-0 items-center justify-between gap-3",
    "rounded-full border border-[var(--bottom-tab-border)]",
    "py-1 pl-3 pr-1.5 text-[var(--text)]",
    "transition-[box-shadow,transform,background-color]",
    "shadow-[0_2px_10px_rgba(0,0,0,0.14),0_0_20px_color-mix(in_oklab,var(--brand)_18%,transparent)]",
    "hover:bg-[var(--glass-active-bg)] hover:shadow-[0_3px_12px_rgba(0,0,0,0.16),0_0_24px_color-mix(in_oklab,var(--brand)_26%,transparent)]",
    "active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40",
  ].join(" ");

  const ownSheetGlassPill =
    "rounded-full border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] shadow-[0_2px_10px_rgba(0,0,0,0.12),0_0_14px_color-mix(in_oklab,var(--brand)_12%,transparent)]";

  const ownSheetRowBase = [
    "flex w-full min-w-0 items-center justify-between gap-2 rounded-full",
    ownSheetGlassPill,
    "px-2.5 pl-3 pr-1.5 text-[var(--text)] text-[11px] font-medium leading-none",
    "transition-[box-shadow,transform,background-color]",
    "hover:bg-[var(--glass-active-bg)] active:scale-[0.99]",
    "disabled:pointer-events-none disabled:opacity-40",
  ].join(" ");

  const ownSheetRowClass = `${ownSheetRowBase} h-10`;
  const ownSheetRowMultilineClass = `${ownSheetRowBase} min-h-[40px] max-h-[52px] h-auto py-1.5`;

  const ownSheetSectionLabelClass =
    "w-full pt-4 pb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text)]/42 first:pt-0";

  const ownSheetIconWrapClass =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-2)_55%,transparent)]";

  return (
    <>
      <div
        className={[
          "flex items-center gap-2 mx-auto",
          "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
          "border border-[var(--bottom-tab-border)] rounded-full",
          "py-[7px] px-[9px]",
        ].join(" ")}
        style={{
          width: pillWidth,
          maxWidth: pillMaxWidth,
        }}
      >
        <Logo size={28} onClick={onLogoClick} className="shrink-0" />

        {blockedShellTopBar ? (
          showBlockControls && (
            isBlocked ? (
              <button
                type="button"
                disabled={blockBusy}
                onClick={() => onRequestUnblock?.()}
                className="shrink-0 ml-auto flex h-9 min-w-0 max-w-[min(200px,calc(100vw-120px))] items-center justify-center gap-1.5 rounded-full border border-emerald-500/45 bg-[color-mix(in_oklab,#22c55e_16%,var(--glass-bg))] px-3 text-[11px] font-semibold text-emerald-950 shadow-sm backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] transition hover:bg-[color-mix(in_oklab,#22c55e_24%,var(--glass-bg))] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 app-dark:border-emerald-400/35 app-dark:bg-[color-mix(in_oklab,#22c55e_22%,var(--glass-bg))] app-dark:text-emerald-50"
                aria-label="Unblock user"
              >
                <PiArrowCounterClockwise
                  size={14}
                  className="shrink-0 opacity-90"
                  aria-hidden
                />
                <span className="truncate">Unblock</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={blockBusy}
                onClick={() => onRequestBlock?.()}
                className="shrink-0 w-9 h-9 rounded-full border border-[var(--border)] flex items-center justify-center hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)] disabled:opacity-40 ml-auto"
                aria-label="Block user"
              >
                <PiProhibit size={16} aria-hidden />
              </button>
            )
          )
        ) : (
          <>
            {/* middle: search users */}
            <div className="relative flex items-center h-9 flex-1 rounded-full px-3 bg-transparent border border-[var(--border)] focus-within:border-[color-mix(in_oklab,var(--text)_40%,transparent)] min-w-0">
              <PiMagnifyingGlass size={18} className="shrink-0" />
              <input
                type="text"
                autoComplete="off"
                enterKeyHint="search"
                placeholder="Search users"
                className="w-full pl-2 pr-2 border-none text-[var(--text)] text-[10px] font-normal bg-transparent outline-none min-w-0"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => onSearchFocusChange?.(true)}
                onBlur={() => onSearchFocusChange?.(false)}
              />
            </div>

            {showProfileOverflowMenu && (
              <div className="relative shrink-0">
                <button
                  ref={profileMenuTriggerRef}
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen((prev) => {
                      const next = !prev;
                      if (next && useOwnProfileActionSheet) {
                        setMenuAnchorRect(null);
                      } else if (next && profileMenuTriggerRef.current) {
                        setMenuAnchorRect(
                          profileMenuTriggerRef.current.getBoundingClientRect(),
                        );
                      } else if (!next) {
                        setMenuAnchorRect(null);
                      }
                      return next;
                    });
                  }}
                  className="shrink-0 w-9 h-9 rounded-full border border-[var(--border)] flex items-center justify-center hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)]"
                  aria-label="Profile actions"
                  aria-expanded={profileMenuOpen}
                  aria-haspopup={useOwnProfileActionSheet ? "dialog" : "menu"}
                >
                  <PiList size={18} className="text-[var(--text)]" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {profileMenuOpen &&
        useOwnProfileActionSheet &&
        createPortal(
          <div
            ref={ownProfileActionPortalRef}
            className="fixed inset-0 z-[100] flex items-center justify-center overscroll-none p-6 pointer-events-none"
            style={overlayMotionStyle}
            role="presentation"
          >
            <button
              type="button"
              className="pointer-events-auto absolute inset-0 cursor-default border-0 bg-black/50 backdrop-blur-md transition-opacity [backdrop-filter:blur(12px)] [-webkit-backdrop-filter:blur(12px)]"
              aria-label="Dismiss profile menu"
              onClick={() => playAnimatedDismiss()}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="own-profile-actions-title"
              className="relative z-10 flex max-h-[min(85dvh,calc(100vh-48px))] w-[min(280px,calc(100vw-48px))] flex-col items-stretch gap-1.5 overflow-y-auto overscroll-contain py-0.5 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex w-full shrink-0 items-center justify-between gap-2">
                <span
                  id="own-profile-actions-title"
                  className={`${ownSheetGlassPill} inline-flex h-9 max-w-[min(200px,calc(100vw-120px))] items-center truncate px-3 text-[12px] font-semibold tracking-tight text-[var(--text)]`}
                >
                  Profile
                </span>
                <button
                  type="button"
                  className={`${ownSheetGlassPill} flex h-9 w-9 shrink-0 items-center justify-center p-0 text-[var(--text)] hover:bg-[var(--glass-active-bg)]`}
                  aria-label="Close"
                  onClick={() => playAnimatedDismiss()}
                >
                  <PiCaretLeft size={18} aria-hidden />
                </button>
              </div>

              <p className={ownSheetSectionLabelClass}>Account</p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  className={ownSheetRowClass}
                  onClick={() => {
                    onRequestEditProfile?.();
                    closeProfileMenu();
                  }}
                >
                  <span>Edit profile</span>
                  <span className={ownSheetIconWrapClass}>
                    <PiPencilSimple size={14} aria-hidden />
                  </span>
                </button>
                {showHangoutReminderMenuItem && (
                  <button
                    type="button"
                    className={ownSheetRowMultilineClass}
                    disabled={nativePushRegisterBusy}
                    onClick={() => {
                      closeProfileMenu();
                      if (shouldDirectlyRefreshIosPush) {
                        void refreshNativePushRegistration();
                        return;
                      }
                      setShowHangoutReminderModal(true);
                    }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                      <span>{nativePushMenuLabel}</span>
                      {nativePushSubline ? (
                        <span className="text-[9px] font-normal leading-tight text-[var(--text)]/50">
                          {nativePushSubline}
                        </span>
                      ) : null}
                    </span>
                    <span className={ownSheetIconWrapClass}>
                      <PiBell size={14} aria-hidden />
                    </span>
                  </button>
                )}
                <div
                  role="group"
                  aria-label="Theme"
                  className={`${ownSheetRowBase} min-h-[40px] h-auto py-1.5`}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span className="text-left text-[11px] font-medium">
                    Switch theme
                  </span>
                  <ThemeSwitch
                    className="shrink-0"
                    width={52}
                    knobW={20}
                    knobH={18}
                    padX={3}
                    padY={3}
                  />
                </div>
                {showShare && (
                  <button
                    type="button"
                    className={ownSheetRowClass}
                    onClick={() => {
                      setShowShareModal(true);
                      closeProfileMenu();
                    }}
                  >
                    <span>Share</span>
                    <span className={ownSheetIconWrapClass}>
                      <PiShareFat size={14} aria-hidden />
                    </span>
                  </button>
                )}
              </div>

              <p className={ownSheetSectionLabelClass}>Safety &amp; Legal</p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  className={ownSheetRowClass}
                  onClick={() => {
                    navigate(Paths.privacy);
                    closeProfileMenu();
                  }}
                >
                  <span className="text-left">Privacy policy</span>
                  <span className={ownSheetIconWrapClass}>
                    <PiFileText size={14} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  className={ownSheetRowClass}
                  onClick={() => {
                    navigate(Paths.terms);
                    closeProfileMenu();
                  }}
                >
                  <span className="text-left">Terms of service</span>
                  <span className={ownSheetIconWrapClass}>
                    <PiFileText size={14} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  className={ownSheetRowClass}
                  onClick={() => {
                    navigate(Paths.reporting);
                    closeProfileMenu();
                  }}
                >
                  <span className="text-left">Reporting</span>
                  <span className={ownSheetIconWrapClass}>
                    <PiMegaphone size={14} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  className={ownSheetRowClass}
                  onClick={() => {
                    navigate(Paths.support);
                    closeProfileMenu();
                  }}
                >
                  <span className="text-left">Support</span>
                  <span className={ownSheetIconWrapClass}>
                    <PiChatCircleText size={14} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  className={ownSheetRowClass}
                  onClick={() => {
                    navigate(Paths.deleteAccount);
                    closeProfileMenu();
                  }}
                >
                  <span className="text-left">Account deletion info</span>
                  <span className={ownSheetIconWrapClass}>
                    <PiInfo size={14} aria-hidden />
                  </span>
                </button>
              </div>

              <p className={`${ownSheetSectionLabelClass} pt-5`}>
                Account Controls
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className={[
                    ownSheetRowClass,
                    "border-red-500/35 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-[color-mix(in_oklab,var(--danger)_90%,var(--text))] hover:bg-[color-mix(in_oklab,var(--danger)_15%,transparent)]",
                  ].join(" ")}
                  onClick={() => {
                    onRequestDeleteAccount?.();
                    closeProfileMenu();
                  }}
                >
                  <span className="text-left font-semibold">Delete account</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-[color-mix(in_oklab,var(--danger)_14%,transparent)]">
                    <PiTrashSimple size={14} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  className={[
                    ownSheetRowClass,
                    "border-rose-400/28 text-[color-mix(in_oklab,#e11d48_55%,var(--text))] hover:bg-[color-mix(in_oklab,#fb7185_10%,transparent)] app-dark:border-rose-400/25 app-dark:text-rose-300/95",
                  ].join(" ")}
                  onClick={() => {
                    onRequestLogout?.();
                    closeProfileMenu();
                  }}
                >
                  <span className="font-medium">Log out</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-400/35 bg-[color-mix(in_oklab,#fb7185_10%,transparent)]">
                    <PiSignOut size={14} aria-hidden />
                  </span>
                </button>
              </div>
            </div>
            <div {...edgeStripProps} />
          </div>,
          document.body,
        )}

      {/* Other profile (etc.): compact pills aligned to trigger */}
      {profileMenuOpen &&
        !useOwnProfileActionSheet &&
        menuAnchorRect &&
        createPortal(
          <div
            ref={profileMenuDropdownRef}
            role="menu"
            className="fixed z-[100] grid w-max grid-cols-1"
            style={{
              minWidth: PROFILE_ACTION_MENU_MIN_WIDTH_PX,
              top: menuAnchorRect.bottom + PROFILE_ACTION_MENU_TOP_OFFSET_PX,
              right: window.innerWidth - menuAnchorRect.right,
              gap: PROFILE_ACTION_MENU_BETWEEN_PILLS_PX,
            }}
          >
            {showEditProfile && (
              <button
                type="button"
                role="menuitem"
                style={glassMenuSurface}
                className={profileActionPillClass}
                onClick={() => {
                  onRequestEditProfile?.();
                  closeProfileMenu();
                }}
              >
                <span className="whitespace-nowrap pl-0.5 text-[11px] font-medium leading-none tracking-tight">
                  Edit profile
                </span>
                <span className={profileActionIconWrapClass}>
                  <PiPencilSimple size={14} />
                </span>
              </button>
            )}
            {showHangoutReminderMenuItem && (
              <button
                type="button"
                role="menuitem"
                disabled={nativePushRegisterBusy}
                style={glassMenuSurface}
                className={`${profileActionPillClass} py-1.5`}
                onClick={() => {
                  closeProfileMenu();
                  if (shouldDirectlyRefreshIosPush) {
                    void refreshNativePushRegistration();
                    return;
                  }
                  setShowHangoutReminderModal(true);
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 pl-0.5 text-left">
                  <span className="whitespace-nowrap text-[11px] font-medium leading-none tracking-tight">
                    {nativePushMenuLabel}
                  </span>
                  {nativePushSubline ? (
                    <span
                      className="max-w-[10.5rem] text-[9px] font-normal leading-tight text-[var(--text)]/50"
                      aria-label={`Push status: ${nativePushSubline}`}
                    >
                      {nativePushSubline}
                    </span>
                  ) : null}
                </span>
                <span className={profileActionIconWrapClass}>
                  <PiBell size={14} />
                </span>
              </button>
            )}
            <div
              role="group"
              style={glassMenuSurface}
              className={`${profileActionPillClass} py-1.5`}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 pl-0.5 text-left">
                <span className="whitespace-nowrap text-[11px] font-medium leading-none tracking-tight">
                  Switch theme
                </span>
              </span>
              <ThemeSwitch
                className="shrink-0"
                width={56}
                knobW={22}
                knobH={20}
                padX={4}
                padY={4}
              />
            </div>
            {showReport && (
              <button
                type="button"
                role="menuitem"
                style={glassMenuSurface}
                className={profileActionPillClass}
                onClick={() => {
                  onRequestReport?.();
                  closeProfileMenu();
                }}
              >
                <span className="whitespace-nowrap pl-0.5 text-[11px] font-medium leading-none tracking-tight">
                  Report
                </span>
                <span className={profileActionIconWrapClass}>
                  <PiFlag size={14} />
                </span>
              </button>
            )}
            {showBlock && (
              <button
                type="button"
                role="menuitem"
                disabled={blockBusy}
                style={glassMenuSurface}
                className={profileActionPillClass}
                onClick={() => {
                  if (isBlocked) onRequestUnblock?.();
                  else onRequestBlock?.();
                  closeProfileMenu();
                }}
              >
                <span className="whitespace-nowrap pl-0.5 text-[11px] font-medium leading-none tracking-tight">
                  {isBlocked ? "Unblock" : "Block"}
                </span>
                <span className={profileActionIconWrapClass}>
                  {isBlocked ? (
                    <PiArrowCounterClockwise size={14} />
                  ) : (
                    <PiProhibit size={14} />
                  )}
                </span>
              </button>
            )}
            {showShare && (
              <button
                type="button"
                role="menuitem"
                style={glassMenuSurface}
                className={profileActionPillClass}
                onClick={() => {
                  setShowShareModal(true);
                  closeProfileMenu();
                }}
              >
                <span className="whitespace-nowrap pl-0.5 text-[11px] font-medium leading-none tracking-tight">
                  Share
                </span>
                <span className={profileActionIconWrapClass}>
                  <PiShareFat size={14} />
                </span>
              </button>
            )}
            {showEditProfile && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  style={glassMenuSurface}
                  className={profileActionPillClass}
                  onClick={() => {
                    navigate(Paths.privacy);
                    closeProfileMenu();
                  }}
                >
                  <span className="min-w-0 flex-1 pl-0.5 text-left text-[11px] font-medium leading-tight tracking-tight">
                    Privacy policy
                  </span>
                  <span className={profileActionIconWrapClass}>
                    <PiFileText size={14} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={glassMenuSurface}
                  className={profileActionPillClass}
                  onClick={() => {
                    navigate(Paths.terms);
                    closeProfileMenu();
                  }}
                >
                  <span className="min-w-0 flex-1 pl-0.5 text-left text-[11px] font-medium leading-tight tracking-tight">
                    Terms of service
                  </span>
                  <span className={profileActionIconWrapClass}>
                    <PiFileText size={14} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={glassMenuSurface}
                  className={profileActionPillClass}
                  onClick={() => {
                    navigate(Paths.reporting);
                    closeProfileMenu();
                  }}
                >
                  <span className="min-w-0 flex-1 pl-0.5 text-left text-[11px] font-medium leading-tight tracking-tight">
                    Reporting
                  </span>
                  <span className={profileActionIconWrapClass}>
                    <PiMegaphone size={14} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={glassMenuSurface}
                  className={profileActionPillClass}
                  onClick={() => {
                    navigate(Paths.support);
                    closeProfileMenu();
                  }}
                >
                  <span className="min-w-0 flex-1 pl-0.5 text-left text-[11px] font-medium leading-tight tracking-tight">
                    Support
                  </span>
                  <span className={profileActionIconWrapClass}>
                    <PiChatCircleText size={14} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={glassMenuSurface}
                  className={profileActionPillClass}
                  onClick={() => {
                    navigate(Paths.deleteAccount);
                    closeProfileMenu();
                  }}
                >
                  <span className="min-w-0 flex-1 pl-0.5 text-left text-[11px] font-medium leading-tight tracking-tight">
                    Account deletion info
                  </span>
                  <span className={profileActionIconWrapClass}>
                    <PiInfo size={14} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={glassMenuSurface}
                  className={profileActionPillClass}
                  onClick={() => {
                    onRequestDeleteAccount?.();
                    closeProfileMenu();
                  }}
                >
                  <span className="min-w-0 flex-1 pl-0.5 text-left text-[11px] font-medium leading-tight tracking-tight">
                    Delete account
                  </span>
                  <span className={profileActionIconWrapClass}>
                    <PiTrashSimple size={14} aria-hidden />
                  </span>
                </button>
              </>
            )}
            {showLogout && (
              <button
                type="button"
                role="menuitem"
                style={glassMenuSurface}
                className={profileActionPillClass}
                onClick={() => {
                  onRequestLogout?.();
                  closeProfileMenu();
                }}
              >
                <span className="whitespace-nowrap pl-0.5 text-[11px] font-medium leading-none tracking-tight">
                  Log out
                </span>
                <span className={profileActionIconWrapClass}>
                  <PiSignOut size={14} />
                </span>
              </button>
            )}
          </div>,
          document.body,
        )}

      {/* Share Profile Modal - rendered via portal to escape fixed header */}
      {profile &&
        createPortal(
          <ShareProfileModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            profileUrl={profileUrl}
            profileName={profile.display_name || profile.username}
          />,
          document.body,
        )}

      {showHangoutReminderSetupInMenu &&
        createPortal(
          <HangoutNotificationExplainerModal
            open={showHangoutReminderModal}
            onOpenChange={setShowHangoutReminderModal}
            mode="manual"
          />,
          document.body,
        )}
    </>
  );
}
