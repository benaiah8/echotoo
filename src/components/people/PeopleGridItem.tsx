/**
 * Presentation tile for a person in a 3-column grid.
 * Membership/Share-agnostic — optional selection, badge, and manage-remove.
 */

import { Link } from "react-router-dom";
import { PiCheck, PiX } from "react-icons/pi";
import Avatar from "../ui/Avatar";

export type PeopleGridPerson = {
  id: string;
  /** Primary label: display_name, else username fallback (single line in tile). */
  displayName: string;
  /** Optional; not rendered as a second line — profile routing may use separately. */
  username?: string | null;
  avatarUrl?: string | null;
  /** Compact marker under the name (e.g. Creator). */
  badge?: string | null;
  /** Optional secondary line (e.g. subtle role); prefer badge for primary markers. */
  secondaryLabel?: string | null;
};

type Props = {
  person: PeopleGridPerson;
  /** When set and username-backed, wraps the tile in a profile Link. */
  profileHref?: string | null;
  selected?: boolean;
  onClick?: () => void;
  onSelect?: (id: string) => void;
  /** Manage mode: show remove control (does not navigate). */
  showRemove?: boolean;
  onRemove?: (id: string) => void;
};

export default function PeopleGridItem({
  person,
  profileHref,
  selected = false,
  onClick,
  onSelect,
  showRemove = false,
  onRemove,
}: Props) {
  // Single primary identity line: callers pass display_name with username fallback.
  const name = person.displayName.trim() || "Member";
  const badge = person.badge?.trim() || null;
  const secondary = person.secondaryLabel?.trim() || null;

  const handleActivate = () => {
    onClick?.();
    onSelect?.(person.id);
  };

  const removeControl =
    showRemove && onRemove ? (
      <button
        type="button"
        className="absolute -right-0.5 -top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]/80 shadow-sm"
        aria-label={`Remove ${name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(person.id);
        }}
      >
        <PiX className="h-3 w-3" aria-hidden />
      </button>
    ) : null;

  const body = (
    <>
      <div className="relative mx-auto h-14 w-14 shrink-0">
        <Avatar
          url={person.avatarUrl}
          name={name}
          userId={person.id}
          size={56}
          tightLineBox
          disableInnerPointer
          className="rounded-full"
        />
        {removeControl}
        {selected ? (
          <span
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45"
            aria-hidden
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-neutral-900">
              <PiCheck className="h-3.5 w-3.5" strokeWidth={8} />
            </span>
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 w-full truncate text-center text-[11px] font-medium leading-snug text-[var(--text)]">
        {name}
      </p>
      {badge ? (
        <p className="mt-0.5 w-full truncate text-center text-[9px] font-semibold uppercase tracking-wide text-amber-700/85 app-dark:text-amber-300/90">
          {badge}
        </p>
      ) : secondary ? (
        <p className="mt-0.5 w-full truncate text-center text-[9px] font-medium text-[var(--text)]/45">
          {secondary}
        </p>
      ) : null}
    </>
  );

  const shellClass =
    "relative flex w-full min-w-0 flex-col items-center rounded-xl px-1 py-1.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40";

  if (profileHref && !showRemove) {
    return (
      <Link
        to={profileHref}
        className={`${shellClass} cursor-pointer`}
        onClick={handleActivate}
      >
        {body}
      </Link>
    );
  }

  // Manage mode: profile link disabled on tile; remove is the primary action.
  // Still allow optional onClick for non-remove taps when not managing.
  if (showRemove) {
    return <div className={shellClass}>{body}</div>;
  }

  if (onClick || onSelect) {
    return (
      <button type="button" className={shellClass} onClick={handleActivate}>
        {body}
      </button>
    );
  }

  return <div className={shellClass}>{body}</div>;
}
