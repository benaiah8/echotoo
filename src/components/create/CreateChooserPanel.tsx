import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { PiCalendarBlank, PiPath } from "react-icons/pi";
import { useAppSelector } from "../../app/hooks";
import { getCachedAvatar } from "../../lib/avatarCache";
import ChooserPillAvatar from "./ChooserPillAvatar";

type PostType = "hangout" | "experience";

const COPY = {
  hangout: {
    title: "Events / Hangouts",
    subtitle: "Plan something people can join",
    helper: "For meetups, activities, classes, or anything happening soon.",
  },
  experience: {
    title: "Places / Experiences",
    subtitle: "Share a place, plan, or idea",
    helper: "For places, routes, itineraries, or ideas others can save or try.",
  },
} as const;

type ProfileLite = {
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

/** Same sources as BottomTab: in-memory avatar cache, then localStorage — no network. */
function readStoredProfileLite(uid: string | null): ProfileLite | null {
  try {
    const display_name = localStorage.getItem("my_display_name");
    const username = localStorage.getItem("my_username");
    let avatar_url: string | null = localStorage.getItem("my_avatar_url");
    if (uid) {
      const cached = getCachedAvatar(uid);
      if (cached) avatar_url = cached;
    }
    if (!display_name && !username && !avatar_url) return null;
    return { display_name, username, avatar_url };
  } catch {
    return null;
  }
}

type Props = {
  variant: "overlay" | "page";
  onContinue: (type: PostType) => void;
};

/**
 * Shared create-type chooser: two selectable cards + bottom CTA (avatar + label).
 * Used by overlay (from + tab) and by CreatePage for direct /create visits.
 */
export default function CreateChooserPanel({ variant, onContinue }: Props) {
  const [selected, setSelected] = useState<PostType | null>(null);
  const authUserId = useAppSelector((s) => s.auth?.user?.id ?? null);
  const [me, setMe] = useState<ProfileLite | null>(() =>
    typeof window === "undefined" ? null : readStoredProfileLite(null)
  );

  useEffect(() => {
    setMe(readStoredProfileLite(authUserId));
  }, [authUserId]);

  useEffect(() => {
    const onProfileUpdated = () => setMe(readStoredProfileLite(authUserId));
    window.addEventListener("profile:updated", onProfileUpdated);
    return () =>
      window.removeEventListener("profile:updated", onProfileUpdated);
  }, [authUserId]);

  const name = me?.display_name || me?.username || " ";

  /** Prefer cache synchronously so ChooserPillAvatar matches BottomTab without waiting a frame. */
  const avatarUrlForCta = useMemo(() => {
    if (authUserId) {
      const cached = getCachedAvatar(authUserId);
      if (cached) return cached;
    }
    return me?.avatar_url ?? undefined;
  }, [authUserId, me?.avatar_url]);

  /** Match floating tab bar width so the CTA never reads wider than the pill nav. */
  const [ctaMaxW, setCtaMaxW] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.getElementById("bottom-tab");
      const w = el?.getBoundingClientRect().width ?? 0;
      setCtaMaxW(w > 0 ? Math.round(w) : undefined);
    };
    measure();
    window.addEventListener("resize", measure);
    const el = document.getElementById("bottom-tab");
    const ro =
      el && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (el) ro?.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  const ctaLabel = !selected
    ? "Choose what to create"
    : selected === "hangout"
    ? "Create event"
    : "Create experience";

  const ctaButtonClass = (() => {
    const base = [
      "inline-flex w-fit max-w-full shrink-0 items-center rounded-full border transition",
      "disabled:cursor-not-allowed",
      // Same insets for default + selected so h-9 pill avatar centers in h-11 chip.
      "min-h-11 h-11 pl-1 py-1 gap-3 pr-4",
    ];
    if (!selected) {
      return [
        ...base,
        "bg-[color-mix(in_oklab,var(--glass-bg)_88%,var(--brand-glass-bg)_12%)]",
        "border-[var(--border)] shadow-[0_4px_18px_rgba(247,208,71,0.12)]",
      ].join(" ");
    }
    if (selected === "hangout") {
      return [
        ...base,
        "bg-[var(--create-chooser-cta-selected-surface)]",
        "border-green-500/55",
        "shadow-[0_8px_30px_rgba(34,197,94,0.42),0_0_0_1px_rgba(34,197,94,0.28)]",
      ].join(" ");
    }
    return [
      ...base,
      "bg-[var(--create-chooser-cta-selected-surface)]",
      "border-orange-500/50",
      "shadow-[0_8px_30px_rgba(249,115,22,0.42),0_0_0_1px_rgba(249,115,22,0.28)]",
    ].join(" ");
  })();

  const ctaLabelClass = !selected
    ? "min-w-0 text-left text-sm font-bold leading-tight whitespace-nowrap text-[var(--text)]/92"
    : "min-w-0 text-left text-sm font-bold leading-tight whitespace-nowrap text-[var(--create-chooser-cta-selected-label)]";

  const rootClass = variant === "page" ? "w-full max-w-md mx-auto" : "w-full";

  return (
    <div className={rootClass}>
      <div
        className={[
          "rounded-2xl border border-[var(--border)]/50 p-2",
          "bg-[color-mix(in_oklab,var(--glass-bg)_65%,transparent)]",
          "shadow-[0_4px_18px_rgba(0,0,0,0.18)] backdrop-blur-xl",
        ].join(" ")}
        style={{ WebkitBackdropFilter: "blur(18px)" }}
      >
        <div className="flex flex-col gap-2.5">
          <ChooserCard
            kind="hangout"
            selected={selected}
            onSelect={() => setSelected("hangout")}
          />
          <ChooserCard
            kind="experience"
            selected={selected}
            onSelect={() => setSelected("experience")}
          />
        </div>
      </div>

      <div className="mt-12 flex w-full flex-col items-center gap-4">
        <div
          className="flex w-full max-w-xs items-center justify-center gap-2 px-1"
          aria-hidden
        >
          <span className="h-px min-w-0 flex-1 bg-[var(--border)]/90" />
          <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--text)]/40" />
          <span className="h-px min-w-0 flex-1 bg-[var(--border)]/90" />
        </div>

        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onContinue(selected)}
          className={ctaButtonClass}
          style={ctaMaxW != null ? { maxWidth: ctaMaxW } : undefined}
        >
          <ChooserPillAvatar
            url={avatarUrlForCta}
            name={name}
            userId={authUserId}
            className={
              selected ? undefined : "h-8 w-12"
            }
          />
          <span className={ctaLabelClass}>{ctaLabel}</span>
        </button>
      </div>
    </div>
  );
}

function ChooserCard({
  kind,
  selected,
  onSelect,
}: {
  kind: PostType;
  selected: PostType | null;
  onSelect: () => void;
}) {
  const isSel = selected === kind;
  const c = COPY[kind];
  const accent =
    kind === "hangout"
      ? {
          ring: "ring-green-500/45",
          border: "border-green-500/50",
          glow: "shadow-[0_4px_22px_rgba(34,197,94,0.26)]",
          icon: PiCalendarBlank,
          iconClass: "text-green-500",
        }
      : {
          ring: "ring-orange-500/28",
          border: "border-orange-500/34",
          glow: "shadow-[0_4px_18px_rgba(249,115,22,0.14)]",
          icon: PiPath,
          iconClass: "text-orange-500",
        };
  const TitleIcon = accent.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full text-left rounded-xl border px-3 py-2.5 transition-all duration-200",
        "bg-[var(--glass-bg)]",
        "backdrop-blur-xl",
        isSel
          ? `ring-2 ${accent.ring} ${accent.border} ${accent.glow} scale-[1.02] bg-[color-mix(in_oklab,var(--glass-bg)_95%,transparent)]`
          : "border-[var(--border)] hover:opacity-100",
      ].join(" ")}
      style={{ WebkitBackdropFilter: "blur(18px)" }}
    >
      <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-[var(--text)]">
              {c.title}
            </span>
            <TitleIcon
              className={`h-3.5 w-3.5 shrink-0 ${accent.iconClass}`}
              strokeWidth={1.35}
              aria-hidden
            />
          </div>
          <div className="text-xs text-[var(--text)]/65 mt-0.5">
            {c.subtitle}
          </div>
          <div
            className={[
              "overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
              isSel ? "max-h-16 opacity-100 mt-1.5" : "max-h-0 opacity-0",
            ].join(" ")}
          >
            <p className="text-[11px] leading-tight text-[var(--text)]/75 pr-0.5">
              {c.helper}
            </p>
          </div>
      </div>
    </button>
  );
}
