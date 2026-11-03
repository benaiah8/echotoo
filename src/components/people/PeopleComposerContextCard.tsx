/**
 * Shared People composer context card — presentation only.
 * Used by Duo/Discover comment composer and Open Plan request composer.
 */
/* eslint-disable react-refresh/only-export-components -- schedule pill helper co-located */

import { PiX } from "react-icons/pi";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import {
  resolveProfileIdentityMedia,
  profileIdentityInitial,
  type ProfileIdentityMediaSource,
} from "../../lib/profileIdentityMedia";
import { resolvePeopleFeedEchoPreset } from "../../lib/people/peopleFeedLayout";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

/** Same accent buckets as PeopleDuoOpportunityInfoCard date pills. */
const DATE_PILL_BASE =
  "inline-flex h-5 max-w-full items-center truncate rounded-md px-1.5 text-[10px] font-semibold leading-none tracking-tight";

const DATE_KIND_CLASSES: Record<PostScheduleLabelKind, string> = {
  today:
    "bg-green-100 text-green-900 border-green-800/35 app-dark:bg-green-500/20 app-dark:text-green-600 app-dark:border-green-500/30",
  tomorrow:
    "bg-sky-100 text-sky-950 border-sky-800/35 app-dark:bg-[var(--blue-bg)] app-dark:text-[var(--blue-text)] app-dark:border-[var(--blue-border)]",
  next_weekday:
    "bg-violet-100 text-violet-950 border-violet-800/35 app-dark:bg-violet-400/15 app-dark:text-violet-300 app-dark:border-violet-400/35",
  in_days:
    "bg-white/92 text-[var(--text)] border-black/12 app-dark:bg-[var(--text)]/8 app-dark:text-[var(--text)]/65 app-dark:border-[var(--border)]",
  passed:
    "bg-gray-100 text-gray-800 border-gray-500/40 italic app-dark:bg-gray-500/10 app-dark:text-[var(--text)]/40 app-dark:border-gray-500/25",
  posted_ago:
    "border-transparent bg-transparent text-[var(--text)]/55 font-normal",
};

export function peopleComposerSchedulePillClass(
  kind: PostScheduleLabelKind | null | undefined
): string {
  if (!kind) {
    return [
      DATE_PILL_BASE,
      "border border-black/12 bg-white/92 text-[var(--text)]",
      "app-dark:border-[var(--brand-glass-border)] app-dark:bg-[var(--brand-glass-bg)]",
    ].join(" ");
  }
  return `${DATE_PILL_BASE} border ${DATE_KIND_CLASSES[kind]}`;
}

function ComposerContextAvatar({
  identitySource,
  displayName,
  feedNeutralEchoSeed = null,
}: {
  identitySource: ProfileIdentityMediaSource;
  displayName: string;
  feedNeutralEchoSeed?: string | null;
}) {
  const resolved = resolveProfileIdentityMedia(identitySource);
  const echoPreset =
    resolvePeopleFeedEchoPreset(
      {
        profile_photos: identitySource.profile_photos,
        echo_preset: identitySource.echo_preset,
        avatar_url: identitySource.avatar_url,
        user_id: identitySource.user_id,
        profile_id: identitySource.profile_id,
      },
      feedNeutralEchoSeed
    ) ?? resolved.echoPreset;

  let src: string | null = null;
  if (resolved.kind === "photos" && resolved.photos[0]) {
    src = avatarDisplayUrl(resolved.photos[0]) ?? null;
  } else if (resolved.kind === "legacy-photo" && resolved.primaryPhoto) {
    src = avatarDisplayUrl(resolved.primaryPhoto) ?? null;
  } else if (echoPreset) {
    src = avatarDisplayUrl(echoPreset) ?? null;
  }

  const initial = profileIdentityInitial({
    ...identitySource,
    display_name: displayName,
  });

  return (
    <div
      className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]/45"
      aria-hidden
      data-people-composer-context-avatar="true"
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover object-center"
          draggable={false}
          decoding="async"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[var(--brand)] text-[11px] font-semibold text-[var(--brand-ink)]">
          {initial.slice(0, 1)}
        </div>
      )}
    </div>
  );
}

export type PeopleComposerContextCardProps = {
  identitySource: ProfileIdentityMediaSource;
  /** Permitted name, or a privacy-safe anonymous title. */
  displayName: string;
  caption?: string | null;
  scheduleLabel?: string | null;
  scheduleLabelKind?: PostScheduleLabelKind | null;
  /** Open Plan: seed Echo without a person id. */
  feedNeutralEchoSeed?: string | null;
  onClose: () => void;
  closeDisabled?: boolean;
  /**
   * When true, omit the frosted panel chrome (parent already provides it —
   * e.g. Duo sent-mode combined card).
   */
  embedded?: boolean;
  /** Extra data-* attr on the close control (e.g. Open Plan dismiss). */
  closeDataAttribute?: string;
  className?: string;
};

export default function PeopleComposerContextCard({
  identitySource,
  displayName,
  caption = null,
  scheduleLabel = null,
  scheduleLabelKind = null,
  feedNeutralEchoSeed = null,
  onClose,
  closeDisabled = false,
  embedded = false,
  closeDataAttribute,
  className,
}: PeopleComposerContextCardProps) {
  const captionText = caption?.trim() || "";
  const dateText = scheduleLabel?.trim() || "";
  const closeExtraAttrs = closeDataAttribute
    ? ({ [closeDataAttribute]: "true" } as Record<string, string>)
    : undefined;

  return (
    <div
      className={[
        embedded ? "w-full" : glassPeoplePanelClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-people-composer-context-card="true"
      data-people-comment-composer-context="true"
      data-people-composer-context-embedded={embedded ? "true" : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="relative"
        data-people-comment-composer-context-header="true"
      >
        <button
          type="button"
          data-people-comment-composer-close-x="true"
          data-people-composer-context-close="true"
          data-no-overlay-swipe
          aria-label={peopleUiCopy.deckCloseLabel}
          disabled={closeDisabled}
          onClick={onClose}
          {...closeExtraAttrs}
          className={[
            "absolute right-0.5 top-0.5 z-[2] inline-flex h-11 w-11 items-center justify-center",
            "rounded-full text-[var(--text)]/55 transition",
            "hover:bg-[color-mix(in_oklab,var(--text)_8%,transparent)]",
            "hover:text-[var(--text)]/80",
            "app-dark:hover:bg-[color-mix(in_oklab,white_10%,transparent)]",
            "disabled:opacity-50",
          ].join(" ")}
        >
          <PiX className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        </button>

        <div className="flex gap-2.5 px-3 py-3 pr-12 sm:px-4 sm:pr-14">
          <ComposerContextAvatar
            identitySource={identitySource}
            displayName={displayName}
            feedNeutralEchoSeed={feedNeutralEchoSeed}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span
                className="truncate text-[14px] font-semibold leading-tight text-[var(--text)]"
                data-people-composer-context-name="true"
              >
                {displayName}
              </span>
              {dateText ? (
                <span
                  className={peopleComposerSchedulePillClass(scheduleLabelKind)}
                  data-people-composer-context-date="true"
                  data-people-composer-context-date-kind={
                    scheduleLabelKind ?? "none"
                  }
                >
                  {dateText}
                </span>
              ) : null}
            </div>
            {captionText ? (
              <p
                className="mt-1 line-clamp-2 text-[13px] leading-snug text-[var(--text)]/78"
                data-people-comment-composer-caption="true"
                data-people-composer-context-caption="true"
              >
                {captionText}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
