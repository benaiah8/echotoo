/**
 * Canonical People deck empty-state card (Duo / Discover / Plans / Groups New).
 * Same Mine front-frame footprint, edge-card surface, and stack peeks as a
 * real candidate — not a larger independent panel.
 */
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  PEOPLE_MINE_CARD_RADIUS,
  PEOPLE_MINE_CARD_TRANSFORM_ORIGIN,
  PEOPLE_MINE_DEPTH_SHADOW,
  PEOPLE_MINE_Z_SETTLED,
  computePeopleDiscoverCardMetrics,
  peopleMineCardTransform,
  peopleMineUnseenEdgeRingStyle,
  type PeopleMineStackRole,
} from "../../lib/people/peopleCandidateMediaPresentation";
import {
  isMatchDeckHostSizeValid,
  resolveMatchDeckHostSize,
  type MatchDeckHostSize,
} from "../../lib/people/matchDeckHostSize";

export type PeopleDeckEmptyKind = "duo" | "discover" | "plans" | "groups_new";

const EMPTY_EMOJI: Record<PeopleDeckEmptyKind, string> = {
  duo: "🤝",
  discover: "✨",
  plans: "🗓️",
  groups_new: "👥",
};

/**
 * Same surface family as MineEdgeNavCards enabled face (cream in dark /
 * charcoal in light). Text colors follow that surface for contrast.
 */
const PEOPLE_EDGE_CARD_SURFACE_CLASS = [
  "border border-black/[0.08] bg-[color-mix(in_oklab,#f2efe6_94%,var(--brand)_6%)] text-[#1c1b19]",
  "shadow-[0_2px_6px_rgba(0,0,0,0.16),0_8px_18px_rgba(0,0,0,0.26)]",
  "app-light:border-white/[0.10] app-light:bg-[color-mix(in_oklab,var(--text)_86%,#1a1b1f_14%)] app-light:text-[#f2efe6]",
  "app-light:shadow-[0_2px_6px_rgba(0,0,0,0.20),0_8px_18px_rgba(0,0,0,0.30)]",
].join(" ");

const STACK_BACKING_ROLES: Exclude<PeopleMineStackRole, "front">[] = [
  "left",
  "right",
];

export type PeopleDeckEmptyCardProps = {
  kind: PeopleDeckEmptyKind;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
};

/**
 * Centered empty plate. Decorative layers are pointer-events: none so vertical
 * pull-to-refresh still receives touches over the card surface.
 */
export default function PeopleDeckEmptyCard({
  kind,
  title,
  body,
  ctaLabel,
  onCta,
}: PeopleDeckEmptyCardProps) {
  const emoji = EMPTY_EMOJI[kind];
  const showCta = Boolean(ctaLabel && onCta);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState<MatchDeckHostSize>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      setHostSize((prev) => {
        const resolved = resolveMatchDeckHostSize(prev, w, h);
        return resolved.changed ? resolved.next : prev;
      });
    };
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      apply(cr.width, cr.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metrics = useMemo(
    () =>
      computePeopleDiscoverCardMetrics({
        hostW: hostSize.w,
        hostH: hostSize.h,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        upwardPeekPad: true,
        fullWidthSlide: true,
        chromeProfile: "mine",
      }),
    [hostSize.w, hostSize.h]
  );

  const ready =
    isMatchDeckHostSizeValid(hostSize) &&
    metrics.frameW > 0 &&
    metrics.frameH > 0;

  const hostStyle = {
    ["--people-mine-portrait-w" as string]: ready
      ? `${metrics.portraitW}px`
      : undefined,
    ["--people-mine-portrait-h" as string]: ready
      ? `${metrics.portraitH}px`
      : undefined,
    ["--people-mine-frame-w" as string]: ready
      ? `${metrics.frameW}px`
      : undefined,
    ["--people-mine-frame-h" as string]: ready
      ? `${metrics.frameH}px`
      : undefined,
  } as CSSProperties;

  return (
    <div
      ref={hostRef}
      className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center"
      data-people-deck-empty="true"
      data-people-deck-empty-kind={kind}
      data-people-deck-carousel-host="true"
      style={hostStyle}
    >
      {ready ? (
        <div
          className="relative shrink-0 overflow-visible"
          data-people-deck-empty-portrait="true"
          data-people-duo-portrait="true"
          style={{
            width: metrics.portraitW,
            height: metrics.portraitH,
            paddingTop: metrics.stackPadYTop,
            paddingBottom: metrics.stackPadY,
            paddingLeft: metrics.stackPadX,
            paddingRight: metrics.stackPadX,
            boxSizing: "border-box",
          }}
        >
          <div
            className="relative h-full w-full"
            data-people-mine-stack="true"
            data-people-deck-empty-stack="true"
          >
            {STACK_BACKING_ROLES.map((role) => (
              <div
                key={role}
                aria-hidden
                data-people-deck-empty-backing={role}
                data-people-mine-card={role}
                className={[
                  "pointer-events-none absolute left-1/2 top-1/2 h-full w-full overflow-hidden",
                  PEOPLE_EDGE_CARD_SURFACE_CLASS,
                ].join(" ")}
                style={{
                  borderRadius: PEOPLE_MINE_CARD_RADIUS,
                  zIndex: PEOPLE_MINE_Z_SETTLED[role],
                  transformOrigin: PEOPLE_MINE_CARD_TRANSFORM_ORIGIN,
                  transform: peopleMineCardTransform(role),
                  boxShadow: PEOPLE_MINE_DEPTH_SHADOW,
                }}
              />
            ))}

            <div
              className={[
                "absolute left-1/2 top-1/2 flex h-full w-full flex-col items-center justify-center overflow-hidden",
                PEOPLE_EDGE_CARD_SURFACE_CLASS,
              ].join(" ")}
              data-people-deck-empty-plate="true"
              data-people-mine-card="front"
              style={{
                borderRadius: PEOPLE_MINE_CARD_RADIUS,
                zIndex: PEOPLE_MINE_Z_SETTLED.front,
                transformOrigin: PEOPLE_MINE_CARD_TRANSFORM_ORIGIN,
                transform: peopleMineCardTransform("front"),
                boxShadow: PEOPLE_MINE_DEPTH_SHADOW,
              }}
            >
              <div
                aria-hidden
                data-people-mine-unseen-edge="true"
                data-people-deck-empty-edge="true"
                className="absolute inset-0 z-[1]"
                style={peopleMineUnseenEdgeRingStyle(PEOPLE_MINE_CARD_RADIUS)}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-4 top-[3px] z-[1] h-px rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, color-mix(in oklab, #fff 55%, transparent) 50%, transparent 100%)",
                  opacity: 0.55,
                }}
              />
              <div
                className="relative z-[2] flex max-w-[15.5rem] flex-col items-center px-4 py-4 text-center"
                data-people-deck-empty-content="true"
              >
                <span
                  className="mb-2 select-none leading-none"
                  style={{ fontSize: 30 }}
                  aria-hidden
                >
                  {emoji}
                </span>
                <h2 className="m-0 text-[16px] font-semibold leading-snug tracking-tight">
                  {title}
                </h2>
                <p className="mt-2 m-0 text-[13px] font-medium leading-snug opacity-75">
                  {body}
                </p>
                {showCta ? (
                  <button
                    type="button"
                    data-people-deck-empty-cta="true"
                    onClick={onCta}
                    className={[
                      "mt-4 inline-flex min-h-9 items-center justify-center rounded-full px-3.5",
                      "bg-[var(--brand)] text-[12.5px] font-semibold text-[var(--brand-ink)]",
                      "transition active:scale-[0.96]",
                    ].join(" ")}
                  >
                    {ctaLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
