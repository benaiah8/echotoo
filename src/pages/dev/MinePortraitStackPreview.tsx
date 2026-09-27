/**
 * DEV-only isolated Mine portrait stack preview (Plan A depth + B1 identity).
 * Not a production route. Uses fixture Unsplash URLs; no social mutations.
 *
 * Index/count/bio persist in sessionStorage so synthetic gallery history.back()
 * remounts (React Router location.key) do not wipe verification state.
 * Production Mine keeps person-keyed index in MatchDeckOverlay instead.
 */
import { useMemo, useState } from "react";
import PeopleCandidateMedia from "../../components/people/PeopleCandidateMedia";
import MinePortraitIdentityOverlay from "../../components/people/MinePortraitIdentityOverlay";
import { computePeopleDiscoverCardMetrics } from "../../lib/people/peopleCandidateMediaPresentation";

const FIXTURE_3 = [
  "https://images.unsplash.com/photo-1728044849256-ad00ec91e794?q=80&w=800",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800",
  "https://images.unsplash.com/photo-1605926637512-c8b131444a4b?w=800",
] as const;

const FIXTURE_2 = FIXTURE_3.slice(0, 2);
const FIXTURE_1 = FIXTURE_3.slice(0, 1);

const BIO_SHORT = "Trail runner, slow coffee.";
const BIO_LONG =
  "Trail runner, slow coffee, terrible at chess. Looking for weekday evening walks, weekend market mornings, and the occasional museum afternoon when the weather turns. Always down for a pastry crawl if you know the good spots — and I will absolutely overpack snacks.";
const BIO_NONE = null;

type BioMode = "short" | "long" | "missing";

const PREVIEW_STORE_KEY = "echo.dev.minePortraitStack.preview";

type PreviewStore = {
  count: 1 | 2 | 3;
  index: number;
  bioMode: BioMode;
};

function readPreviewStore(): PreviewStore {
  try {
    const raw = sessionStorage.getItem(PREVIEW_STORE_KEY);
    if (!raw) return { count: 3, index: 0, bioMode: "long" };
    const parsed = JSON.parse(raw) as Partial<PreviewStore>;
    const count = parsed.count === 1 || parsed.count === 2 || parsed.count === 3
      ? parsed.count
      : 3;
    const index =
      typeof parsed.index === "number" && parsed.index >= 0
        ? Math.floor(parsed.index)
        : 0;
    const bioMode =
      parsed.bioMode === "short" ||
      parsed.bioMode === "long" ||
      parsed.bioMode === "missing"
        ? parsed.bioMode
        : "long";
    return { count, index: index % count, bioMode };
  } catch {
    return { count: 3, index: 0, bioMode: "long" };
  }
}

function writePreviewStore(next: PreviewStore): void {
  try {
    sessionStorage.setItem(PREVIEW_STORE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export default function MinePortraitStackPreview() {
  const initial = readPreviewStore();
  const [count, setCount] = useState<1 | 2 | 3>(initial.count);
  const [index, setIndexState] = useState(initial.index);
  const [bioMode, setBioModeState] = useState<BioMode>(initial.bioMode);
  const photos = count === 1 ? FIXTURE_1 : count === 2 ? FIXTURE_2 : FIXTURE_3;

  const setIndex = (
    next: number | ((prev: number) => number)
  ) => {
    setIndexState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      writePreviewStore({ count, index: resolved, bioMode });
      return resolved;
    });
  };

  const setBioMode = (mode: BioMode) => {
    writePreviewStore({ count, index, bioMode: mode });
    setBioModeState(mode);
  };

  const bio =
    bioMode === "short" ? BIO_SHORT : bioMode === "long" ? BIO_LONG : BIO_NONE;

  const metrics = useMemo(
    () =>
      computePeopleDiscoverCardMetrics({
        hostW: 390,
        hostH: 700,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        upwardPeekPad: true,
        fullWidthSlide: true,
      }),
    []
  );

  const source = useMemo(
    () => ({
      profile_photos: [...photos],
      avatar_url: photos[0] ?? null,
      display_name: "Alex Chen",
      username: null,
      echo_preset: null,
    }),
    [photos]
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--text)]">
      <h1 className="text-lg font-semibold">Mine portrait stack (DEV)</h1>
      <p className="mt-1 text-sm opacity-70">
        Tap photo to cycle. Fullscreen control opens MediaGalleryLightbox.
        Expandable bio must not cycle photos. Not a production surface.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {([1, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
            onClick={() => {
              writePreviewStore({ count: n, index: 0, bioMode });
              setCount(n);
              setIndex(0);
            }}
          >
            {n} photo{n === 1 ? "" : "s"}
          </button>
        ))}
        <span className="self-center text-sm opacity-60">index {index}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(
          [
            ["short", "Short bio"],
            ["long", "Long bio"],
            ["missing", "No bio"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={`rounded-md border px-3 py-1.5 text-sm ${
              bioMode === mode
                ? "border-[var(--text)]"
                : "border-[var(--border)]"
            }`}
            onClick={() => setBioMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="relative mx-auto mt-6"
        style={{
          width: metrics.portraitW,
          height: metrics.portraitH,
        }}
      >
        <PeopleCandidateMedia
          source={source}
          activeIndex={index}
          onActiveIndexChange={setIndex}
          withPhoto
          isCurrent
          enableTapCycle
          presentation="mine"
          identityOverlay={
            <MinePortraitIdentityOverlay
              name="Alex Chen"
              bio={bio}
              resetKey={`preview:${index}:${bioMode}`}
              interactive
            />
          }
        />
      </div>
    </div>
  );
}
