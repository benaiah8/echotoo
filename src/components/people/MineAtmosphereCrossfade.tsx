import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import {
  MINE_ATMOSPHERE_CROSSFADE_MS,
  type MineAtmosphereCrossfadeState,
} from "../../lib/people/mineAtmosphereCrossfade";

const WASH_OPACITY_CLASS = "opacity-[0.38] app-light:opacity-[0.40]";
const SCRIM_CLASS =
  "absolute inset-0 app-dark:bg-[color-mix(in_oklab,var(--profile-avatar-pill-scrim)_26%,transparent)] app-light:bg-[color-mix(in_oklab,var(--profile-avatar-pill-scrim)_10%,transparent)]";
const WASH_FILTER = "var(--people-mine-atmosphere-filter, blur(36px))";
const WASH_CLASS_NAME = [
  "[--people-mine-atmosphere-filter:blur(36px)]",
  "app-light:[--people-mine-atmosphere-filter:blur(36px)_saturate(1.55)_contrast(1.14)_brightness(0.93)]",
].join(" ");

const BLOOM_FILTER =
  "blur(60px) saturate(2.35) contrast(1.18) brightness(0.94)";
const BLOOM_MASK =
  "radial-gradient(ellipse 72% 74% at 50% 48%, #000 0%, #000 32%, rgba(0,0,0,0.55) 52%, transparent 74%)";

const FADE_EASE = "ease-out";
/** Safety net when transitionend is skipped. */
const FADE_FALLBACK_MS = MINE_ATMOSPHERE_CROSSFADE_MS + 80;

function washPhotoStyle(url: string): CSSProperties {
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: "cover",
    backgroundPosition: "center 28%",
    top: "-32px",
    left: "-24px",
    right: "-24px",
    bottom: "-32px",
    filter: WASH_FILTER,
    transform: "scale(1.04)",
  };
}

function FadeLayer({
  opacity,
  fading,
  layer,
  onOpacityTransitionEnd,
  children,
}: {
  opacity: number;
  fading: boolean;
  layer?: "from" | "to";
  onOpacityTransitionEnd?: (e: TransitionEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute inset-0"
      data-mine-atm-layer={layer}
      style={{
        opacity,
        transition: fading
          ? `opacity ${MINE_ATMOSPHERE_CROSSFADE_MS}ms ${FADE_EASE}`
          : "none",
      }}
      onTransitionEnd={onOpacityTransitionEnd}
    >
      {children}
    </div>
  );
}

/**
 * Mine-only two-layer atmosphere crossfade.
 * Reuses Profile wash + Mine bloom presentation tokens (filters/scrims/masks).
 * Does not change ProfileHeroAvatarAtmosphere defaults.
 */
export default function MineAtmosphereCrossfade({
  state,
  onFadeComplete,
}: {
  state: MineAtmosphereCrossfadeState;
  onFadeComplete: (generation: number) => void;
}) {
  const { fromPath, toPath, fading, generation } = state;
  const onFadeCompleteRef = useRef(onFadeComplete);
  onFadeCompleteRef.current = onFadeComplete;
  const generationRef = useRef(generation);
  generationRef.current = generation;

  /** Incoming layer mounts at 0, then flips to 1 after paint so CSS can interpolate. */
  const [toEntered, setToEntered] = useState(false);

  useLayoutEffect(() => {
    if (!fading || !toPath) {
      setToEntered(false);
      return;
    }
    setToEntered(false);
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setToEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [fading, toPath, generation]);

  useEffect(() => {
    if (!fading) return;
    const gen = generation;
    const id = window.setTimeout(() => {
      if (generationRef.current !== gen) return;
      onFadeCompleteRef.current(gen);
    }, FADE_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [fading, generation, toPath, fromPath]);

  if (!fromPath && !toPath) return null;

  const fromOpacity = fading ? 0 : 1;
  const toOpacity = toEntered ? 1 : 0;
  const showTo = Boolean(toPath && fading);

  const handleOpacityTransitionEnd = (
    e: TransitionEvent<HTMLDivElement>
  ) => {
    if (e.propertyName !== "opacity") return;
    if (e.target !== e.currentTarget) return;
    // Prefer incoming completion; fade-to-empty uses outgoing only.
    if (showTo && e.currentTarget.dataset.mineAtmLayer !== "to") return;
    if (!showTo && e.currentTarget.dataset.mineAtmLayer !== "from") return;
    onFadeComplete(generation);
  };

  const fromUrl = fromPath ? avatarDisplayUrl(fromPath) : undefined;
  const toUrl = toPath ? avatarDisplayUrl(toPath) : undefined;

  return (
    <>
      <div
        className="pointer-events-none absolute z-0 max-w-none overflow-hidden"
        style={{ top: 0, height: "100%", left: 0, right: 0 }}
        aria-hidden
        data-people-mine-atmosphere-crossfade="true"
        data-people-mine-atmosphere-generation={generation}
      >
        {fromUrl ? (
          <FadeLayer
            layer="from"
            opacity={fromOpacity}
            fading={fading}
            onOpacityTransitionEnd={handleOpacityTransitionEnd}
          >
            <div
              className={[
                "absolute bg-center",
                WASH_OPACITY_CLASS,
                WASH_CLASS_NAME,
              ].join(" ")}
              style={washPhotoStyle(fromUrl)}
            />
          </FadeLayer>
        ) : null}
        {showTo && toUrl ? (
          <FadeLayer
            key={`to-${generation}`}
            layer="to"
            opacity={toOpacity}
            fading={fading}
            onOpacityTransitionEnd={handleOpacityTransitionEnd}
          >
            <div
              className={[
                "absolute bg-center",
                WASH_OPACITY_CLASS,
                WASH_CLASS_NAME,
              ].join(" ")}
              style={washPhotoStyle(toUrl)}
            />
          </FadeLayer>
        ) : null}
        <div className={SCRIM_CLASS} />
        {/* Edge fades into --bg. Light: stronger top cushion for caption/date. */}
        <div
          className="absolute inset-0 app-light:hidden"
          style={{
            background: [
              "linear-gradient(to bottom, var(--bg) 0%, color-mix(in oklab, var(--bg) 38%, transparent) 6%, transparent 14%)",
              "linear-gradient(to bottom, transparent 0%, transparent 68%, color-mix(in oklab, var(--bg) 22%, transparent) 78%, color-mix(in oklab, var(--bg) 62%, transparent) 88%, var(--bg) 96%, var(--bg) 100%)",
            ].join(", "),
          }}
          aria-hidden
          data-people-mine-atmosphere-edge-fade="dark"
        />
        <div
          className="absolute inset-0 hidden app-light:block"
          style={{
            background: [
              // Soft white atmospheric band behind Back / caption / date — no box edges.
              "linear-gradient(to bottom, color-mix(in oklab, var(--bg) 97%, white) 0%, color-mix(in oklab, var(--bg) 88%, transparent) 10%, color-mix(in oklab, var(--bg) 52%, transparent) 18%, color-mix(in oklab, var(--bg) 18%, transparent) 26%, transparent 34%)",
              "linear-gradient(to bottom, transparent 0%, transparent 68%, color-mix(in oklab, var(--bg) 22%, transparent) 78%, color-mix(in oklab, var(--bg) 62%, transparent) 88%, var(--bg) 96%, var(--bg) 100%)",
            ].join(", "),
          }}
          aria-hidden
          data-people-mine-atmosphere-edge-fade="light"
        />
      </div>

      {(fromUrl || (showTo && toUrl)) && (
        <div
          className="pointer-events-none absolute inset-0 z-[0] hidden overflow-hidden app-light:block"
          aria-hidden
          data-people-mine-atmosphere-bloom="true"
        >
          {fromUrl ? (
            <FadeLayer opacity={fromOpacity} fading={fading}>
              <div
                className="absolute left-1/2 top-[44%] h-[min(70vh,34rem)] w-[min(145%,30rem)] opacity-[0.58]"
                style={{
                  backgroundImage: `url(${fromUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center 28%",
                  filter: BLOOM_FILTER,
                  transform: "translate(-50%, -50%) scale(1.08)",
                  WebkitMaskImage: BLOOM_MASK,
                  maskImage: BLOOM_MASK,
                }}
              />
            </FadeLayer>
          ) : null}
          {showTo && toUrl ? (
            <FadeLayer
              key={`bloom-to-${generation}`}
              opacity={toOpacity}
              fading={fading}
            >
              <div
                className="absolute left-1/2 top-[44%] h-[min(70vh,34rem)] w-[min(145%,30rem)] opacity-[0.58]"
                style={{
                  backgroundImage: `url(${toUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center 28%",
                  filter: BLOOM_FILTER,
                  transform: "translate(-50%, -50%) scale(1.08)",
                  WebkitMaskImage: BLOOM_MASK,
                  maskImage: BLOOM_MASK,
                }}
              />
            </FadeLayer>
          ) : null}
        </div>
      )}
    </>
  );
}
