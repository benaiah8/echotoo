import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  PiArrowCounterClockwise,
  PiBell,
  PiFlag,
  PiList,
  PiMagnifyingGlass,
  PiPencilSimple,
  PiProhibit,
  PiShareFat,
  PiSignOut,
} from "react-icons/pi";
import Logo from "../ui/Logo";
import ShareProfileModal from "./ShareProfileModal";
import HangoutNotificationExplainerModal from "../ui/HangoutNotificationExplainerModal";
import { getPublicShareBaseUrl } from "../../lib/publicSiteUrl";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import {
  getNativePushReceiveState,
  getNativePushStatusLabel,
  type NativePushReceiveUiState,
} from "../../lib/explicitNativePushRegistration";
import { App } from "@capacitor/app";
import type { Profile } from "../../contexts/ProfileContext";

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
const PROFILE_ACTION_MENU_MIN_WIDTH_PX = 168;

const profileActionIconWrapClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-2)_55%,transparent)]";

export default function ProfileTopBar({
  onLogoClick,
  onSearch,
  profile,
  /** When provided, shows Report user button (Play Store compliance) */
  reportUserId,
  reportUsername: _reportUsername,
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
}) {
  const [q, setQ] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHangoutReminderModal, setShowHangoutReminderModal] =
    useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);
  const [nativePushUi, setNativePushUi] =
    useState<NativePushReceiveUiState | null>(null);
  const profileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const profileMenuDropdownRef = useRef<HTMLDivElement>(null);

  const showReport = Boolean(reportUserId && onRequestReport);
  const showBlock = Boolean(showBlockControls);
  const showShare = Boolean(profile);
  const showHangoutReminderMenuItem = Boolean(showHangoutReminderSetupInMenu);
  const showEditProfile = Boolean(onRequestEditProfile);
  const showLogout = Boolean(onRequestLogout);
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

  const closeProfileMenu = useCallback(() => {
    setProfileMenuOpen(false);
    setMenuAnchorRect(null);
  }, []);

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
      if (profileMenuDropdownRef.current?.contains(t)) return;
      closeProfileMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeProfileMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileMenuOpen, closeProfileMenu]);

  // Close on scroll/resize so fixed position does not drift from trigger
  useEffect(() => {
    if (!profileMenuOpen) return;
    const close = () => closeProfileMenu();
    window.addEventListener("scroll", close, { capture: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [profileMenuOpen, closeProfileMenu]);

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
            <button
              type="button"
              disabled={blockBusy}
              onClick={() =>
                isBlocked ? onRequestUnblock?.() : onRequestBlock?.()
              }
              className="shrink-0 w-9 h-9 rounded-full border border-[var(--border)] flex items-center justify-center hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)] disabled:opacity-40 ml-auto"
              aria-label={isBlocked ? "Unblock user" : "Block user"}
            >
              {isBlocked ? (
                <PiArrowCounterClockwise size={16} />
              ) : (
                <PiProhibit size={16} />
              )}
            </button>
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
                      if (next && profileMenuTriggerRef.current) {
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
                  aria-haspopup="menu"
                >
                  <PiList size={18} className="text-[var(--text)]" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Portaled stack: right-aligned with trigger so icon circles line up vertically */}
      {profileMenuOpen &&
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
                style={glassMenuSurface}
                className={`${profileActionPillClass} py-1.5`}
                onClick={() => {
                  setShowHangoutReminderModal(true);
                  closeProfileMenu();
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 pl-0.5 text-left">
                  <span className="whitespace-nowrap text-[11px] font-medium leading-none tracking-tight">
                    Allow notifications
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
