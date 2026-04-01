import React, { useEffect, useLayoutEffect, useState } from "react";
import { useAppSelector } from "../../app/hooks";
import { getViewerAuthUserId } from "../../api/services/follows";
import ChooserPillAvatar from "./ChooserPillAvatar";

type PostType = "hangout" | "experience";

const COPY = {
  hangout: {
    title: "Hangout",
    subtitle: "Something happening soon",
    helper: "For something people can join, check out, or plan for soon.",
  },
  experience: {
    title: "Experience",
    subtitle: "Share a plan, idea, or itinerary",
    helper: "Places, routes, or ideas others can try, save, or revisit.",
  },
} as const;

type ProfileLite = {
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

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
  const [me, setMe] = useState<ProfileLite | null>(null);
  const authUserId = useAppSelector((s) => s.auth?.user?.id ?? null);

  useEffect(() => {
    const quick = {
      display_name: localStorage.getItem("my_display_name"),
      username: localStorage.getItem("my_username"),
      avatar_url: localStorage.getItem("my_avatar_url"),
    };
    if (quick.display_name || quick.username || quick.avatar_url) {
      setMe(quick);
    }
    (async () => {
      const uid = await getViewerAuthUserId();
      if (!uid) return;
      const { getProfileByUserId } = await import("../../api/services/follows");
      const profile = await getProfileByUserId(uid);
      if (profile) {
        setMe({
          display_name: profile.display_name,
          username: profile.username,
          avatar_url: profile.avatar_url,
        });
      }
    })();
  }, []);

  const name = me?.display_name || me?.username || " ";

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
    ? "Create hangout"
    : "Create experience";

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
          className={[
            "inline-flex w-fit max-w-full shrink-0 items-center rounded-full border transition",
            /* h-11 so pl/pt/pb = 8px around 28px-tall pill; pr/gap larger for label */
            "min-h-11 h-11",
            "pl-2 pt-2 pb-2 gap-4 pr-5",
            "bg-[color-mix(in_oklab,var(--glass-bg)_88%,var(--brand-glass-bg)_12%)] backdrop-blur-xl",
            "disabled:cursor-not-allowed",
            selected
              ? "border-[var(--brand-glass-border)] shadow-[0_6px_22px_rgba(247,208,71,0.28),var(--glass-active-shadow)]"
              : "border-[var(--border)] shadow-[0_4px_18px_rgba(247,208,71,0.12)]",
          ].join(" ")}
          style={{
            maxWidth: ctaMaxW,
            WebkitBackdropFilter: "blur(20px)",
            backdropFilter: "blur(20px)",
          }}
        >
          <ChooserPillAvatar
            url={me?.avatar_url || undefined}
            name={name}
            userId={authUserId}
          />
          <span
            className={[
              "min-w-0 text-left text-sm font-medium leading-tight whitespace-nowrap",
              selected ? "text-[var(--text)]" : "text-[var(--text)]/92",
            ].join(" ")}
          >
            {ctaLabel}
          </span>
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
          dot: "bg-green-500",
        }
      : {
          ring: "ring-orange-500/28",
          border: "border-orange-500/34",
          glow: "shadow-[0_4px_18px_rgba(249,115,22,0.14)]",
          dot: "bg-orange-500",
        };

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
      <div className="flex items-start gap-2">
        <div
          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${accent.dot} opacity-90`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--text)]">
            {c.title}
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
      </div>
    </button>
  );
}
