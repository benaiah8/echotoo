import { useState, useEffect } from "react";
import { FiSearch, FiEdit3 } from "react-icons/fi";
import { useNavigate, useLocation } from "react-router-dom";
import Logo from "../ui/Logo";

export default function ProfileTopBar({
  onLogoClick,
  onSearch,
}: {
  onLogoClick?: () => void;
  onSearch?: (q: string) => void;
}) {
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const loc = useLocation();

  // simple debounce so we don't query on every keystroke
  useEffect(() => {
    const id = setTimeout(() => onSearch?.(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="w-full flex items-center gap-2 px-3 pt-2 pb-3 border-b border-[var(--border)]">
      {/* left: logo */}
      <Logo size={28} onClick={onLogoClick} className="shrink-0" />

      {/* middle: search users */}
      <div className="relative flex items-center h-9 flex-1 rounded-xl px-3 bg-transparent border border-[var(--border)] focus-within:border-white/50">
        <FiSearch size={18} />
        <input
          type="text"
          placeholder="Search users"
          className="w-full pl-2 pr-2 border-none text-[var(--text)] text-[12px] bg-transparent outline-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* right: edit icon */}
      <button
        onClick={() => nav(`${loc.pathname}?edit=1`)}
        className="shrink-0 w-9 h-9 rounded-xl border border-[var(--border)] flex items-center justify-center hover:hover:bg-[rgba(255,255,255,0.08)]"
        aria-label="Edit profile"
      >
        <FiEdit3 size={16} />
      </button>
    </div>
  );
}
