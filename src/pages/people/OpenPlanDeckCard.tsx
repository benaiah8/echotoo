import { isAvatarPresetValue } from "../../lib/avatarPresets";
import type { OpenPlanCandidate } from "../../lib/people/types";
import { peopleUiCopy } from "./peopleUiCopy";

export type OpenPlanDeckPhotoKind = "photo" | "preset" | "empty";

/**
 * Anonymous Open Plan People card. No name, username, or profile affordance.
 */
export default function OpenPlanDeckCard({
  candidate,
  photos,
  photoIndex,
  isCurrent,
  withPhoto,
  photoKind = "empty",
  occursLabel,
}: {
  candidate: OpenPlanCandidate;
  photos: string[];
  photoIndex: number;
  isCurrent: boolean;
  withPhoto: boolean;
  photoKind?: OpenPlanDeckPhotoKind;
  occursLabel: string | null;
}) {
  const src = photos.length > 0 ? photos[photoIndex % photos.length] : null;
  const kind: OpenPlanDeckPhotoKind =
    photoKind !== "empty"
      ? photoKind
      : isAvatarPresetValue(candidate.avatar_url)
        ? "preset"
        : src
          ? "photo"
          : "empty";
  const bio = candidate.bio?.trim() || null;
  const planNote = candidate.description?.trim() || null;
  const caption = candidate.source_caption?.trim() || null;

  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-[18px] border border-[var(--border)]/60 bg-[var(--surface-2)] shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
      {withPhoto && kind === "photo" && src ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          loading={isCurrent ? "eager" : "lazy"}
          decoding="async"
        />
      ) : withPhoto && kind === "preset" && src ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]">
          <div className="flex h-[46%] max-h-[11rem] w-[46%] max-w-[11rem] items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]/50">
            <img
              src={src}
              alt=""
              className="h-[86%] w-[86%] object-contain"
              draggable={false}
              loading={isCurrent ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        </div>
      ) : withPhoto ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--brand)] font-semibold text-[var(--brand-ink)]">
            <span className="text-[28px] leading-none">?</span>
          </div>
        </div>
      ) : null}

      {isCurrent && kind === "photo" && photos.length > 1 ? (
        <div
          className="absolute inset-x-2.5 top-2.5 z-[2] flex gap-1"
          aria-hidden
        >
          {photos.map((photo, i) => (
            <span
              key={`${photo}-${i}`}
              className={`h-[3px] flex-1 rounded-full ${
                i === photoIndex % photos.length ? "bg-white/95" : "bg-white/35"
              }`}
            />
          ))}
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-1/2"
        style={{
          background:
            "linear-gradient(to top, color-mix(in oklab, var(--bg) 82%, transparent) 0%, color-mix(in oklab, var(--bg) 48%, transparent) 44%, transparent 100%)",
        }}
      />

      <div className="absolute inset-x-0 bottom-0 z-[2] flex flex-col gap-1 px-3.5 pb-3.5">
        {occursLabel ? (
          <span className="inline-flex w-fit items-center rounded-full border border-[var(--brand-glass-border)] bg-[var(--brand-glass-bg)] px-2 py-0.5 text-[11px] font-semibold leading-none tracking-tight text-[var(--text)]">
            {occursLabel}
          </span>
        ) : null}
        {caption ? (
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--text)]">
            {caption}
          </p>
        ) : null}
        {bio ? (
          <p className="line-clamp-2 text-[12.5px] leading-snug text-[var(--text)]/70">
            {bio}
          </p>
        ) : null}
        {planNote ? (
          <p className="line-clamp-2 text-[12.5px] leading-snug text-[var(--text)]/65">
            <span className="mr-1 inline-flex translate-y-[-1px] items-center rounded-full border border-[var(--brand-glass-border)] bg-[var(--brand-glass-bg)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--text)]">
              {peopleUiCopy.openPlansNoteLabel}
            </span>
            {planNote}
          </p>
        ) : null}
        {isCurrent ? (
          <p className="text-[11px] leading-snug text-[var(--text)]/50">
            {peopleUiCopy.openPlansPrivacyLine}
          </p>
        ) : null}
      </div>
    </div>
  );
}
