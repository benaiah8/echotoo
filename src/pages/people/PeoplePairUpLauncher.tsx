import { useEffect, useLayoutEffect, useState } from "react";
import { getCachedAvatar, setCachedAvatar } from "../../lib/avatarCache";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import type { PairUpCandidate } from "../../lib/people/types";
import type { MatchDeckViewer } from "../../hooks/usePeopleMatchDeckPreview";
import { useTabActive } from "../../router/PersistentTabContainer.new";
import { peopleUiCopy } from "./peopleUiCopy";

const CARD_W = 60;
const CARD_H = 84;
const CLUSTER_W = 196;
const LABEL_H = 26;
/**
 * DEV-only empty-stack faces. Same Unsplash URLs already used by
 * ActivityImagesModal — the repo has no bundled photorealistic portraits.
 */
const DEV_FALLBACK_PHOTO_URLS: string[] = import.meta.env.DEV
  ? [
      "https://plus.unsplash.com/premium_photo-1677000666741-17c3c57139a2?w=600",
      "https://images.unsplash.com/photo-1728044849256-ad00ec91e794?q=80&w=1974",
      "https://plus.unsplash.com/premium_photo-1681841594224-ad729a249113?w=600",
    ]
  : [];
const TAB_SEAM_PX = 1;
const ENTRANCE_MS = 460;
/** Extra list pad: cards peeking above the tab pill. */
export const PEOPLE_LIST_LAUNCHER_PAD_PX = CARD_H + 8;

type PillGeom = {
  clusterLeft: number;
  bottom: number;
  pillHeight: number;
};

function measurePill(): PillGeom | null {
  const pill = document.getElementById("bottom-tab");
  if (!pill) return null;
  const rect = pill.getBoundingClientRect();
  const messagesBtn = pill.querySelector<HTMLElement>(
    "button[aria-label='tab-3']"
  );
  const messagesRect = messagesBtn?.getBoundingClientRect();
  const messagesCenterX =
    messagesRect != null
      ? messagesRect.left + messagesRect.width / 2
      : rect.left + rect.width * 0.72;
  const maxLeft = rect.left + rect.width - CLUSTER_W;
  const minLeft = Math.min(rect.left + rect.width * 0.5, maxLeft);
  const clusterLeft = Math.min(
    maxLeft,
    Math.max(minLeft, messagesCenterX - CLUSTER_W / 2)
  );
  return {
    clusterLeft,
    bottom: Math.max(0, window.innerHeight - rect.bottom),
    pillHeight: rect.height,
  };
}

type StackSlot = "backLeft" | "front" | "backRight";

function cardTransformForSlot(slot: StackSlot): string {
  if (slot === "backLeft") {
    return "translate(calc(-50% - 26px), 12px) rotate(-17deg)";
  }
  if (slot === "backRight") {
    return "translate(calc(-50% + 24px), 10px) rotate(21deg)";
  }
  return "translate(calc(-50% + 3px), 0px) rotate(5deg)";
}

const SLOT_Z: Record<StackSlot, number> = {
  backLeft: 1,
  backRight: 2,
  front: 3,
};

function resolveCardSrc(
  url?: string | null,
  userId?: string | null
): string | undefined {
  const trimmed = typeof url === "string" ? url.trim() : "";
  const raw = trimmed !== "" ? url : userId ? getCachedAvatar(userId) : null;
  return avatarDisplayUrl(raw);
}

function MatchDeckCardFace({
  avatarUrl,
  name,
  userId,
  zIndex,
  transform,
}: {
  avatarUrl?: string | null;
  name?: string | null;
  userId?: string | null;
  zIndex: number;
  transform: string;
}) {
  const src = resolveCardSrc(avatarUrl, userId);
  const letter = (name || "").trim().charAt(0).toUpperCase() || " ";
  return (
    <div
      className="absolute bottom-0 left-1/2 overflow-hidden rounded-[1px] border border-[var(--bottom-tab-border)] bg-[var(--surface-2)]"
      style={{
        width: CARD_W,
        height: CARD_H,
        zIndex,
        transform,
        boxShadow:
          "0 2px 8px color-mix(in oklab, var(--text) 18%, transparent)",
      }}
      aria-hidden
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onLoad={() => {
            if (userId && avatarUrl) setCachedAvatar(userId, avatarUrl);
          }}
        />
      ) : (
        <div
          className="flex h-full w-full select-none items-center justify-center bg-[var(--brand)] font-semibold text-[var(--brand-ink)]"
          style={{ fontSize: Math.round(CARD_H * 0.42) }}
        >
          {letter}
        </div>
      )}
    </div>
  );
}

function MatchDeckCardBack({
  zIndex,
  transform,
}: {
  zIndex: number;
  transform: string;
}) {
  return (
    <div
      className="absolute bottom-0 left-1/2 rounded-[1px] border border-[var(--bottom-tab-border)] bg-[color-mix(in_oklab,var(--surface-2)_88%,var(--glass-bg))]"
      style={{
        width: CARD_W,
        height: CARD_H,
        zIndex,
        transform,
        boxShadow:
          "0 1px 5px color-mix(in oklab, var(--text) 12%, transparent)",
      }}
      aria-hidden
    />
  );
}

export default function PeoplePairUpLauncher({
  candidates,
  viewer,
  hasCandidates,
  onOpen,
}: {
  candidates: PairUpCandidate[];
  viewer: MatchDeckViewer;
  hasCandidates: boolean;
  onOpen?: () => void;
}) {
  const isPeopleActive = useTabActive("people");
  const [geom, setGeom] = useState<PillGeom | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [entered, setEntered] = useState(false);

  useLayoutEffect(() => {
    const apply = () => {
      const next = measurePill();
      if (next) setGeom(next);
    };
    apply();
    const pill = document.getElementById("bottom-tab");
    const ro = new ResizeObserver(apply);
    if (pill) ro.observe(pill);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isPeopleActive) {
      setEntered(false);
      return;
    }
    if (reduceMotion) {
      setEntered(true);
      return;
    }
    setEntered(false);
    let innerId = 0;
    const outerId = window.requestAnimationFrame(() => {
      innerId = window.requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(outerId);
      window.cancelAnimationFrame(innerId);
    };
  }, [isPeopleActive, reduceMotion]);

  if (!geom) return null;

  const peekH = CARD_H + 8;
  const clusterBottom = geom.bottom + geom.pillHeight - TAB_SEAM_PX;

  const activeFaces: Array<{
    key: string;
    slot: StackSlot;
    avatarUrl?: string | null;
    name?: string | null;
    userId?: string | null;
  }> = [];
  if (hasCandidates) {
    if (candidates[0]) {
      activeFaces.push({
        key: candidates[0].opportunity_id,
        slot: "backLeft",
        avatarUrl: candidates[0].avatar_url,
        name: candidates[0].display_name || candidates[0].username,
        userId: candidates[0].creator_id,
      });
    }
    activeFaces.push({
      key: "viewer",
      slot: "front",
      avatarUrl: viewer.avatarUrl,
      name: viewer.displayName,
      userId: viewer.userId,
    });
    if (candidates[1]) {
      activeFaces.push({
        key: candidates[1].opportunity_id,
        slot: "backRight",
        avatarUrl: candidates[1].avatar_url,
        name: candidates[1].display_name || candidates[1].username,
        userId: candidates[1].creator_id,
      });
    }
  }
  const idleSlots: StackSlot[] = ["backLeft", "front", "backRight"];
  const showDevPhotoFallback =
    import.meta.env.DEV && !hasCandidates && DEV_FALLBACK_PHOTO_URLS.length >= 3;
  const viewerSrc = resolveCardSrc(viewer.avatarUrl, viewer.userId);
  const devFaces: Array<{
    key: string;
    slot: StackSlot;
    avatarUrl: string;
  }> = showDevPhotoFallback
    ? [
        {
          key: "dev-backLeft",
          slot: "backLeft",
          avatarUrl: DEV_FALLBACK_PHOTO_URLS[0]!,
        },
        {
          key: "dev-front",
          slot: "front",
          avatarUrl: viewerSrc || DEV_FALLBACK_PHOTO_URLS[1]!,
        },
        {
          key: "dev-backRight",
          slot: "backRight",
          avatarUrl: DEV_FALLBACK_PHOTO_URLS[2]!,
        },
      ]
    : [];

  return (
    <div
      className="pointer-events-none fixed z-[38]"
      style={{
        left: geom.clusterLeft,
        width: CLUSTER_W,
        bottom: clusterBottom,
        height: peekH,
      }}
    >
      <button
        type="button"
        onClick={() => {
          onOpen?.();
        }}
        aria-label={peopleUiCopy.matchDeck}
        className="pointer-events-auto relative h-full w-full overflow-visible border-0 bg-transparent p-0"
        style={{
          transformOrigin: "50% 100%",
          transform: entered
            ? "translateY(0) scale(1)"
            : "translateY(14px) scale(0.94)",
          transition:
            reduceMotion || !entered
              ? "none"
              : `transform ${ENTRANCE_MS}ms cubic-bezier(0.22, 1.2, 0.36, 1)`,
        }}
      >
        <div className="absolute inset-0 z-[1] overflow-hidden" aria-hidden>
          <div
            className="absolute left-1/2"
            style={{
              bottom: 0,
              transform: "translateX(-50%)",
            }}
          >
            <div
              className="relative"
              style={{ width: CARD_W + 56, height: CARD_H }}
            >
              {hasCandidates
                ? activeFaces.map((card) => (
                    <MatchDeckCardFace
                      key={card.key}
                      avatarUrl={card.avatarUrl}
                      name={card.name}
                      userId={card.userId}
                      zIndex={SLOT_Z[card.slot]}
                      transform={cardTransformForSlot(card.slot)}
                    />
                  ))
                : showDevPhotoFallback
                  ? devFaces.map((card) => (
                      <MatchDeckCardFace
                        key={card.key}
                        avatarUrl={card.avatarUrl}
                        zIndex={SLOT_Z[card.slot]}
                        transform={cardTransformForSlot(card.slot)}
                      />
                    ))
                  : idleSlots.map((slot) => (
                      <MatchDeckCardBack
                        key={`back-${slot}`}
                        zIndex={SLOT_Z[slot]}
                        transform={cardTransformForSlot(slot)}
                      />
                    ))}
            </div>
          </div>
        </div>

        <div
          className="absolute left-1/2 z-[4] isolate flex min-w-[7.75rem] items-center justify-center overflow-hidden whitespace-nowrap rounded-t-[6px] rounded-b-none bg-[color-mix(in_oklab,var(--text)_78%,transparent)] px-3.5 text-[var(--bg)]"
          style={{
            bottom: 0,
            transform: "translateX(-50%)",
            height: LABEL_H,
            backdropFilter: "blur(28px) saturate(1.35)",
            WebkitBackdropFilter: "blur(28px) saturate(1.35)",
          }}
        >
          <span className="text-[13px] font-semibold leading-none tracking-wide">
            {peopleUiCopy.matchDeck}
          </span>
        </div>
      </button>
    </div>
  );
}
