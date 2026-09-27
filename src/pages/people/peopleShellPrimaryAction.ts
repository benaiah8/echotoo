/**
 * People shell primary action — solid faces + same-family extrusion helpers.
 */

export type PeopleShellActionTone = "brand" | "active" | "muted";

export type PeopleShellActionIcon =
  | "connect"
  | "request"
  | "requested"
  | "open"
  | "im_down"
  | "withdraw"
  | "retry";

export type PeopleShellPrimaryAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone: PeopleShellActionTone;
  icon?: PeopleShellActionIcon;
};

/** Opaque solid faces — no transparency through the control. */
export function peopleShellActionFaceClass(
  tone: PeopleShellActionTone,
  disabled?: boolean
): string {
  if (disabled || tone === "muted") {
    return [
      "bg-[color-mix(in_oklab,var(--surface)_82%,#0a0a0a)]",
      "text-[var(--text)]/45",
      "border-[var(--text)]/16",
    ].join(" ");
  }
  if (tone === "active") {
    return [
      "bg-[rgb(34,197,94)]",
      "text-white",
      "border-[rgb(22,163,74)]",
    ].join(" ");
  }
  return [
    "bg-[var(--brand)]",
    "text-[var(--brand-ink)]",
    "border-[color-mix(in_oklab,var(--brand-ink)_22%,var(--brand))]",
  ].join(" ");
}

/** Same-family underside (not a second loud color). */
export function peopleShellActionExtrusionClass(
  tone: PeopleShellActionTone,
  disabled?: boolean
): string {
  if (disabled || tone === "muted") {
    return "bg-[color-mix(in_oklab,var(--surface)_40%,#000)]";
  }
  if (tone === "active") {
    return "bg-[rgb(21,128,61)]";
  }
  return "bg-[color-mix(in_oklab,var(--brand)_55%,#1a1a1a)]";
}

export function peopleShellSegmentActiveClass(active: boolean): string {
  return active
    ? "bg-[var(--brand)] text-[var(--brand-ink)]"
    : "bg-transparent text-[var(--text)]/72";
}

export function resolveGroupUpShellActionState(input: {
  browseTab: "new" | "yours";
  viewerState: string | null | undefined;
  hasCurrent: boolean;
}): {
  labelKey: "request" | "requested" | "open" | "none";
  tone: PeopleShellActionTone;
  disabled: boolean;
  icon: PeopleShellActionIcon;
} {
  if (!input.hasCurrent) {
    return { labelKey: "none", tone: "muted", disabled: true, icon: "request" };
  }
  const state = input.viewerState ?? "none";
  if (input.browseTab === "new") {
    if (state === "none") {
      return {
        labelKey: "request",
        tone: "brand",
        disabled: false,
        icon: "request",
      };
    }
    if (state === "pending") {
      return {
        labelKey: "requested",
        tone: "active",
        disabled: false,
        icon: "requested",
      };
    }
    if (state === "member" || state === "owner") {
      return { labelKey: "open", tone: "brand", disabled: false, icon: "open" };
    }
    return { labelKey: "none", tone: "muted", disabled: true, icon: "request" };
  }
  if (state === "pending") {
    return {
      labelKey: "requested",
      tone: "active",
      disabled: false,
      icon: "requested",
    };
  }
  if (state === "member" || state === "owner") {
    return { labelKey: "open", tone: "brand", disabled: false, icon: "open" };
  }
  return { labelKey: "none", tone: "muted", disabled: true, icon: "request" };
}

export function resolveOpenPlanShellActionState(input: {
  hasCurrent: boolean;
  pending: boolean;
}): {
  labelKey: "im_down" | "withdraw" | "none";
  tone: PeopleShellActionTone;
  disabled: boolean;
  icon: PeopleShellActionIcon;
} {
  if (!input.hasCurrent) {
    return { labelKey: "none", tone: "muted", disabled: true, icon: "im_down" };
  }
  if (input.pending) {
    return {
      labelKey: "withdraw",
      tone: "active",
      disabled: false,
      icon: "withdraw",
    };
  }
  return {
    labelKey: "im_down",
    tone: "brand",
    disabled: false,
    icon: "im_down",
  };
}

export function resolvePairUpShellActionState(input: {
  hasCurrent: boolean;
  locked: boolean;
  completeFailed: boolean;
}): {
  labelKey: "connect" | "retry" | "none";
  tone: PeopleShellActionTone;
  disabled: boolean;
  icon: PeopleShellActionIcon;
} {
  if (!input.hasCurrent) {
    return { labelKey: "none", tone: "muted", disabled: true, icon: "connect" };
  }
  if (input.completeFailed) {
    return {
      labelKey: "retry",
      tone: "brand",
      disabled: input.locked,
      icon: "retry",
    };
  }
  return {
    labelKey: "connect",
    tone: "brand",
    disabled: input.locked,
    icon: "connect",
  };
}
