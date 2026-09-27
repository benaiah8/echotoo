/**
 * Share S2B destination tile — PeopleGridItem visual language.
 * Groups reuse GroupMemberAvatarStack (inbox triangle); people/DMs use Avatar.
 */

import { PiCheck } from "react-icons/pi";
import Avatar from "../ui/Avatar";
import GroupMemberAvatarStack, {
  groupAvatarStackStatusFromPreview,
  type GroupMemberAvatarStackMember,
} from "./GroupMemberAvatarStack";

export type ShareDestinationTileModel = {
  id: string;
  label: string;
  avatarUrl?: string | null;
  /** Auth user id for DM/person avatars; null for groups. */
  userId?: string | null;
  variant: "person" | "direct" | "group";
  /**
   * Group only: inbox member_preview mapped to stack members.
   * null = loading; [] = empty; omitted treated as loading for groups.
   */
  memberPreview?: GroupMemberAvatarStackMember[] | null;
};

type Props = {
  tile: ShareDestinationTileModel;
  selected?: boolean;
  onSelect?: (id: string) => void;
  disabled?: boolean;
};

const TILE_AVATAR_PX = 56;

export default function ShareDestinationTile({
  tile,
  selected = false,
  onSelect,
  disabled = false,
}: Props) {
  const name = tile.label.trim() || (tile.variant === "group" ? "Group" : "Chat");
  const isGroup = tile.variant === "group";
  const groupMembers = isGroup
    ? Array.isArray(tile.memberPreview)
      ? tile.memberPreview
      : []
    : [];
  const groupStatus = isGroup
    ? groupAvatarStackStatusFromPreview(tile.memberPreview)
    : "empty";

  return (
    <button
      type="button"
      disabled={disabled}
      className="relative flex w-full min-w-0 flex-col items-center rounded-xl px-1 py-1.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 disabled:pointer-events-none disabled:opacity-50"
      onClick={() => onSelect?.(tile.id)}
      aria-pressed={selected}
      aria-label={selected ? `Deselect ${name}` : `Select ${name}`}
    >
      <div className="relative mx-auto h-14 w-14 shrink-0 overflow-visible">
        {isGroup ? (
          <GroupMemberAvatarStack
            members={groupMembers}
            status={groupStatus}
            size={TILE_AVATAR_PX}
            layout="triangle"
          />
        ) : (
          <Avatar
            url={tile.avatarUrl}
            name={name}
            userId={tile.userId ?? null}
            size={TILE_AVATAR_PX}
            tightLineBox
            disableInnerPointer
            className="rounded-full"
          />
        )}
        {selected ? (
          <span
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/45"
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
    </button>
  );
}
