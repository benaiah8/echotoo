import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { PiFlag, PiMagnifyingGlass, PiShareFat } from "react-icons/pi";
import { useNavigate, useLocation } from "react-router-dom";
import Logo from "../ui/Logo";
import ShareProfileModal from "./ShareProfileModal";
import { getReportUserMailto } from "../../lib/supportConfig";
import type { Profile } from "../../contexts/ProfileContext";

export default function ProfileTopBar({
  onLogoClick,
  onSearch,
  profile,
  /** When provided, shows Report user button (Play Store compliance) */
  reportUserId,
  reportUsername,
}: {
  onLogoClick?: () => void;
  onSearch?: (q: string) => void;
  profile?: Profile | null;
  reportUserId?: string;
  reportUsername?: string;
}) {
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const loc = useLocation();
  const [showShareModal, setShowShareModal] = useState(false);

  // simple debounce so we don't query on every keystroke
  useEffect(() => {
    const id = setTimeout(() => onSearch?.(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  // Generate profile URL
  const profileUrl = useMemo(() => {
    if (!profile) return "";
    const baseUrl = window.location.origin;
    if (profile.username) {
      return `${baseUrl}/u/${profile.username}`;
    }
    return `${baseUrl}/u/${profile.id}`;
  }, [profile]);

  const pillWidth = "80%";
  const pillMaxWidth = 640;

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
        {/* left: logo */}
        <Logo size={28} onClick={onLogoClick} className="shrink-0" />

        {/* middle: search users */}
        <div className="relative flex items-center h-9 flex-1 rounded-full px-3 bg-transparent border border-[var(--border)] focus-within:border-[color-mix(in_oklab,var(--text)_40%,transparent)] min-w-0">
          <PiMagnifyingGlass size={18} className="shrink-0" />
          <input
            type="text"
            placeholder="Search users"
            className="w-full pl-2 pr-2 border-none text-[var(--text)] text-[10px] font-normal bg-transparent outline-none min-w-0"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* right: Report (when viewing other user) + Share */}
        {reportUserId && (
          <a
            href={getReportUserMailto(reportUserId, reportUsername)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 w-9 h-9 rounded-full border border-[var(--border)] flex items-center justify-center hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)]"
            aria-label="Report user"
          >
            <PiFlag size={16} />
          </a>
        )}
        <button
          onClick={() => setShowShareModal(true)}
          className="shrink-0 w-9 h-9 rounded-full border border-[var(--border)] flex items-center justify-center hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)]"
          aria-label="Share profile"
        >
          <PiShareFat size={16} />
        </button>
      </div>

      {/* Share Profile Modal - rendered via portal to escape fixed header */}
      {profile &&
        createPortal(
          <ShareProfileModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            profileUrl={profileUrl}
            profileName={profile.display_name || profile.username}
          />,
          document.body
        )}
    </>
  );
}
