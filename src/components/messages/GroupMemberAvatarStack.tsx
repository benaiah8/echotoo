/**
 * Presentation-only group member avatar cluster.
 * No fetch / cache / backend ownership — parent supplies members + status.
 *
 * `layout="triangle"` (inbox): compact 3-slot triangle inside `size` footprint.
 * `layout="horizontal"` (thread header): overlapping left-to-right; `size` = circle diameter.
 */

import { memo, type KeyboardEvent, type ReactNode } from "react";
import Avatar from "../ui/Avatar";

export type GroupMemberAvatarStackMember = {
  userId: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
};

export type GroupMemberAvatarStackStatus = "loading" | "ready" | "empty";

export type GroupMemberAvatarStackLayout = "triangle" | "horizontal";

export type GroupMemberAvatarStackProps = {
  members: GroupMemberAvatarStackMember[];
  status: GroupMemberAvatarStackStatus;
  /**
   * Triangle: outer footprint / hit area (px). Circles scale ~58% of that.
   * Horizontal: each avatar diameter (px).
   */
  size?: number;
  /** Inbox uses triangle; thread header uses horizontal. Default triangle. */
  layout?: GroupMemberAvatarStackLayout;
  className?: string;
  onClick?: () => void;
};

/** Member circle diameter as a fraction of outer footprint (~55–60%). */
const CIRCLE_RATIO = 0.58;
const MAX_SLOTS = 3;

function memberLabel(m: GroupMemberAvatarStackMember): string {
  return m.displayName?.trim() || m.username?.trim() || "Member";
}

/** Map inbox/RPC preview arrays to stack status (null/omitted → loading). */
export function groupAvatarStackStatusFromPreview(
  preview: readonly unknown[] | null | undefined
): GroupMemberAvatarStackStatus {
  if (preview == null) return "loading";
  if (preview.length === 0) return "empty";
  return "ready";
}

function circleDiameter(footprint: number): number {
  return Math.max(1, Math.round(footprint * CIRCLE_RATIO));
}

/**
 * Absolute top-left for each slot inside the footprint square.
 * Bottom pair sits on the baseline; top is centered — slight edge inset
 * leaves room for avatar rings without growing the hit box.
 */
function slotOrigins(
  footprint: number,
  circle: number
): Array<{ left: number; top: number; zIndex: number }> {
  const inset = Math.max(1, Math.round(footprint * 0.02));
  return [
    {
      left: (footprint - circle) / 2,
      top: inset,
      zIndex: 3,
    },
    {
      left: inset,
      top: footprint - circle - inset,
      zIndex: 2,
    },
    {
      left: footprint - circle - inset,
      top: footprint - circle - inset,
      zIndex: 1,
    },
  ];
}

/** Visible neutral circle — never blank / never retired group icons. */
function EmptySlot({ circle }: { circle: number }) {
  return (
    <span
      aria-hidden
      className="block rounded-full border border-[var(--border)] bg-[var(--surface-2)] ring-2 ring-[var(--bg)] app-dark:border-[var(--border)]/80 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_70%,#0a0a0c)]"
      style={{ width: circle, height: circle }}
    />
  );
}

function SkeletonSlot({ circle }: { circle: number }) {
  return (
    <span
      aria-hidden
      className="block rounded-full border border-[var(--border)]/35 bg-[var(--text)]/12 animate-pulse ring-2 ring-[var(--bg)]"
      style={{ width: circle, height: circle }}
    />
  );
}

function MemberSlot({
  member,
  circle,
}: {
  member: GroupMemberAvatarStackMember;
  circle: number;
}) {
  const label = memberLabel(member);
  return (
    <span
      className="block rounded-full ring-2 ring-[var(--bg)]"
      title={label}
      style={{ width: circle, height: circle }}
    >
      <Avatar
        url={member.avatarUrl}
        name={label}
        userId={member.userId}
        size={circle}
        tightLineBox
        disableInnerPointer
        className="rounded-full"
      />
    </span>
  );
}

/** Pre-triangle header empty: single neutral circle (not retired group icons / not "M"). */
function HorizontalEmptyFallback({ circle }: { circle: number }) {
  return <EmptySlot circle={circle} />;
}

function buildInteractiveProps(onClick?: () => void) {
  if (!onClick) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };
}

function TriangleStack({
  members,
  status,
  size,
  className,
  onClick,
}: Omit<GroupMemberAvatarStackProps, "layout">) {
  const footprint = Math.max(1, Math.round(size ?? 48));
  const circle = circleDiameter(footprint);
  const origins = slotOrigins(footprint, circle);

  const filled: Array<GroupMemberAvatarStackMember | null> = [
    null,
    null,
    null,
  ];
  if (status === "ready") {
    const ordered = members
      .filter((m) => typeof m.userId === "string" && m.userId.trim())
      .slice(0, MAX_SLOTS);
    for (let i = 0; i < ordered.length; i++) {
      filled[i] = ordered[i]!;
    }
  }

  const rootClass = [
    "relative inline-block shrink-0 overflow-visible",
    onClick ? "cursor-pointer" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const interactive = buildInteractiveProps(onClick);

  // Confirmed empty: one centered neutral circle (matches horizontal empty;
  // avoids three faint slots reading as a blank hole at tile/chip sizes).
  if (status === "empty") {
    const emptyCircle = Math.max(circle, Math.round(footprint * 0.72));
    const offset = Math.round((footprint - emptyCircle) / 2);
    return (
      <span
        className={rootClass}
        style={{ width: footprint, height: footprint }}
        aria-hidden
        {...interactive}
      >
        <span
          className="absolute"
          style={{
            left: offset,
            top: offset,
            width: emptyCircle,
            height: emptyCircle,
          }}
        >
          <EmptySlot circle={emptyCircle} />
        </span>
      </span>
    );
  }

  const slots: ReactNode[] = origins.map((origin, i) => {
    let content: ReactNode;
    if (status === "loading") {
      content = <SkeletonSlot circle={circle} />;
    } else if (filled[i]) {
      content = <MemberSlot member={filled[i]!} circle={circle} />;
    } else {
      content = <EmptySlot circle={circle} />;
    }

    return (
      <span
        key={i}
        className="absolute"
        style={{
          left: origin.left,
          top: origin.top,
          zIndex: origin.zIndex,
          width: circle,
          height: circle,
        }}
      >
        {content}
      </span>
    );
  });

  return (
    <span
      className={rootClass}
      style={{ width: footprint, height: footprint }}
      aria-hidden={status === "loading" || !onClick ? true : undefined}
      aria-busy={status === "loading" ? true : undefined}
      {...interactive}
    >
      {slots}
    </span>
  );
}

function HorizontalStack({
  members,
  status,
  size,
  className,
  onClick,
}: Omit<GroupMemberAvatarStackProps, "layout">) {
  const circle = Math.max(1, Math.round(size ?? 32));
  const rootClass = [
    "inline-flex shrink-0 items-center justify-center overflow-visible",
    onClick ? "cursor-pointer" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const interactive = buildInteractiveProps(onClick);

  if (status === "loading") {
    return (
      <span
        className={rootClass}
        aria-hidden
        aria-busy="true"
        {...interactive}
      >
        <span className="flex items-center -space-x-2.5">
          {Array.from({ length: MAX_SLOTS }, (_, i) => (
            <SkeletonSlot key={i} circle={circle} />
          ))}
        </span>
      </span>
    );
  }

  if (status === "empty") {
    return (
      <span className={rootClass} aria-hidden {...interactive}>
        <HorizontalEmptyFallback circle={circle} />
      </span>
    );
  }

  const visible = members
    .filter((m) => typeof m.userId === "string" && m.userId.trim())
    .slice(0, MAX_SLOTS);

  if (visible.length === 0) {
    return (
      <span className={rootClass} aria-hidden {...interactive}>
        <HorizontalEmptyFallback circle={circle} />
      </span>
    );
  }

  return (
    <span className={rootClass} {...interactive}>
      <span className="flex items-center -space-x-2.5">
        {visible.map((m) => (
          <MemberSlot key={m.userId} member={m} circle={circle} />
        ))}
      </span>
    </span>
  );
}

function GroupMemberAvatarStack({
  layout = "triangle",
  ...rest
}: GroupMemberAvatarStackProps) {
  if (layout === "horizontal") {
    return <HorizontalStack {...rest} />;
  }
  return <TriangleStack {...rest} />;
}

export default memo(GroupMemberAvatarStack);
