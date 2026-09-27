import { PiArrowSquareOutBold } from "react-icons/pi";
import type { PairUpCandidate } from "../../lib/people/types";
import { isAvatarPresetValue } from "../../lib/avatarPresets";
import { peopleUiCopy } from "./peopleUiCopy";

export type MatchDeckPhotoKind = "photo" | "preset" | "empty";

/**
 * Portrait Match Deck card. Bio (who they are) and P2P note (why this plan)
 * render separately. Age/gender/about are DEV-mock overlays only.
 */
export default function MatchDeckCard({
  candidate,
  photos,
  photoIndex,
  isCurrent,
  withPhoto,
  photoKind = "empty",
  age,
  gender,
  about,
  onOpenProfile,
  /** Discover: display_name only — never fall back to @username. */
  hideUsername = false,
}: {
  candidate: PairUpCandidate;
  photos: string[];
  photoIndex: number;
  isCurrent: boolean;
  /** False for the far slivers so their photos are never fetched. */
  withPhoto: boolean;
  photoKind?: MatchDeckPhotoKind;
  age?: number | null;
  gender?: string | null;
  about?: string | null;
  onOpenProfile?: () => void;
  hideUsername?: boolean;
}) {
  const name = hideUsername
    ? candidate.display_name?.trim() || "Someone"
    : candidate.display_name?.trim() || candidate.username?.trim() || "Someone";
  const letter = name.charAt(0).toUpperCase() || " ";
  const src = photos.length > 0 ? photos[photoIndex % photos.length] : null;
  const kind: MatchDeckPhotoKind =
    photoKind !== "empty"
      ? photoKind
      : isAvatarPresetValue(candidate.avatar_url)
        ? "preset"
        : src
          ? "photo"
          : "empty";
  const bio = about?.trim() || candidate.bio?.trim() || null;
  const p2pNote = candidate.description?.trim() || null;
  const facts = [
    typeof age === "number" && age > 0 ? String(age) : null,
    gender?.trim() || null,
  ].filter(Boolean) as string[];

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
            <span className="text-[28px] leading-none">{letter}</span>
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
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-[19px] font-semibold leading-tight text-[var(--text)]">
            {name}
          </span>
          {isCurrent && onOpenProfile ? (
            <button
              type="button"
              onClick={onOpenProfile}
              aria-label={peopleUiCopy.deckOpenProfile}
              title={peopleUiCopy.deckOpenProfile}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text)]/75 transition hover:text-[var(--text)] active:scale-[0.94]"
            >
              <PiArrowSquareOutBold className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        {facts.length > 0 ? (
          <span className="truncate text-[13px] leading-none text-[var(--text)]/70">
            {facts.join(" · ")}
          </span>
        ) : null}
        {bio ? (
          <p className="line-clamp-2 text-[12.5px] leading-snug text-[var(--text)]/70">
            {bio}
          </p>
        ) : null}
        {p2pNote ? (
          <p className="line-clamp-2 text-[12.5px] leading-snug text-[var(--text)]/65">
            <span className="mr-1 inline-flex translate-y-[-1px] items-center rounded-full border border-[var(--brand-glass-border)] bg-[var(--brand-glass-bg)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--text)]">
              {peopleUiCopy.p2pNoteLabel}
            </span>
            {p2pNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}
