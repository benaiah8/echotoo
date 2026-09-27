/**
 * V4 Finalize Settings sheet — post type (create only), visibility + ratings.
 * Writes live draft state immediately; Done / backdrop only close.
 */
import { useEffect, useRef, useState } from "react";
import { PiX } from "react-icons/pi";
import BottomDrawer from "../ui/BottomDrawer";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";

type VisibilityCtl = "public" | "friends";
type CreatePostType = "hangout" | "experience";

type Props = {
  open: boolean;
  onClose: () => void;
  /** New create only — hide Event/Post selector in edit mode. */
  showPostType?: boolean;
  postType?: CreatePostType;
  onPostTypeChange?: (next: CreatePostType) => void;
  visibility: VisibilityCtl;
  onVisibilityChange: (v: VisibilityCtl) => void;
  ratingEnabled: boolean;
  onRatingToggle: () => void;
  /** Star indicator deep-link — temporary Ratings spotlight. */
  highlightRatings?: boolean;
};

/** Dim non-Ratings options while star-driven spotlight is active. */
const SETTINGS_SPOTLIGHT_DIM_CLASS =
  "opacity-[0.35] transition-opacity duration-200 ease-out motion-reduce:transition-none";

const SETTINGS_SPOTLIGHT_IDLE_CLASS =
  "opacity-100 transition-opacity duration-200 ease-out motion-reduce:transition-none";

/** Elevated Ratings surface during star-driven spotlight (no pointer-blocking overlay). */
const SETTINGS_RATINGS_SPOTLIGHT_CLASS =
  "rounded-xl border border-[var(--border)]/80 bg-[color-mix(in_oklab,var(--surface)_92%,var(--text)_4%)] " +
  "p-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.08)] opacity-100 " +
  "app-dark:border-[var(--border)]/90 app-dark:bg-[color-mix(in_oklab,var(--surface)_88%,white_6%)] " +
  "app-dark:shadow-[0_2px_14px_rgba(0,0,0,0.35)] " +
  "transition-[background-color,border-color,box-shadow,opacity] duration-200 ease-out " +
  "motion-reduce:transition-none";

const SETTINGS_RATINGS_IDLE_CLASS =
  "rounded-xl border border-transparent p-1.5 opacity-100 " +
  "transition-[background-color,border-color,box-shadow,opacity] duration-200 ease-out " +
  "motion-reduce:transition-none";

const closeBtnClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/75 transition hover:bg-[var(--text)]/8";

const doneClass =
  "flex h-10 min-h-10 w-full items-center justify-center rounded-full bg-amber-400/90 px-3 text-[13px] font-semibold text-neutral-900 transition active:scale-[0.99]";

const sectionLabelClass =
  "text-[12px] font-semibold leading-snug text-[var(--text)]";

const helperClass =
  "mt-1.5 text-[11px] font-medium leading-snug text-[var(--text)]/55";

const supportClass =
  "mt-0.5 text-[11px] font-medium leading-snug text-[var(--text)]/55";

const segmentBase =
  "flex h-10 min-h-10 min-w-0 flex-1 items-center justify-center text-[13px] font-semibold transition active:scale-[0.99]";

const segmentPublicOn =
  `${segmentBase} bg-[var(--brand)] text-[var(--brand-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]`;

const segmentFriendsOn =
  `${segmentBase} bg-[var(--green-text)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]`;

const segmentEventOn =
  `${segmentBase} bg-[var(--green-text)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]`;

const segmentPlaceOn =
  `${segmentBase} bg-orange-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]`;

const segmentIdle =
  `${segmentBase} bg-transparent text-[var(--text)]/70`;

const TOGGLE_TRACK_CLASS =
  "box-border relative flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-[2px] transition-colors";
const TOGGLE_THUMB_CLASS =
  "box-border h-[22px] w-[22px] shrink-0 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.32)] transition-transform duration-200 ease-out";

function RatingToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Turn off ratings" : "Turn on ratings"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`${TOGGLE_TRACK_CLASS} ${
        on
          ? "bg-[var(--brand)]"
          : "bg-[color-mix(in_oklab,var(--text)_18%,transparent)] ring-1 ring-inset ring-[var(--border)]/70"
      }`}
    >
      <span
        aria-hidden
        className={`${TOGGLE_THUMB_CLASS} ${
          on ? "translate-x-[20px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function CreateFinalizeSettingsSheet({
  open,
  onClose,
  showPostType = false,
  postType = "experience",
  onPostTypeChange,
  visibility,
  onVisibilityChange,
  ratingEnabled,
  onRatingToggle,
  highlightRatings = false,
}: Props) {
  const isFriends = visibility === "friends";
  const isEvent = postType === "hangout";
  const ratingsSectionRef = useRef<HTMLElement | null>(null);
  /** Local dismiss so other options work on first tap without a blocking overlay. */
  const [spotlightActive, setSpotlightActive] = useState(false);

  useEffect(() => {
    if (open && highlightRatings) {
      setSpotlightActive(true);
      return;
    }
    setSpotlightActive(false);
  }, [open, highlightRatings]);

  useEffect(() => {
    if (!open || !spotlightActive) return;
    const el = ratingsSectionRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, spotlightActive]);

  const dismissSpotlight = () => {
    if (spotlightActive) setSpotlightActive(false);
  };

  return (
    <BottomDrawer
      open={open}
      onClose={onClose}
      transparentSheet
      backdropVariant="strong"
      portalClassName="z-[130]"
      maxHeight="88vh"
      shrinkSheetToContent
      showCloseButton={false}
      contentClassName="px-4 pt-1"
    >
      <div
        className={`${glassPeoplePanelClass} mx-auto flex w-full max-w-lg flex-col`}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">
            Settings
          </p>
          <button
            type="button"
            className={closeBtnClass}
            aria-label="Close"
            onClick={onClose}
          >
            <PiX className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-3 pb-1">
          <div
            data-create-settings-spotlight-dim
            className={`flex flex-col gap-4 ${
              spotlightActive
                ? SETTINGS_SPOTLIGHT_DIM_CLASS
                : SETTINGS_SPOTLIGHT_IDLE_CLASS
            }`}
            onPointerDownCapture={dismissSpotlight}
          >
            {showPostType && onPostTypeChange ? (
              <>
                <section>
                  <p className={sectionLabelClass}>Post type</p>
                  <div
                    className="mt-2 flex overflow-hidden rounded-full border border-[var(--border)]/70 bg-[var(--surface-2)]/70"
                    role="radiogroup"
                    aria-label="Post type"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isEvent}
                      className={isEvent ? segmentEventOn : segmentIdle}
                      onClick={() => onPostTypeChange("hangout")}
                    >
                      Event
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!isEvent}
                      className={!isEvent ? segmentPlaceOn : segmentIdle}
                      onClick={() => onPostTypeChange("experience")}
                    >
                      Post
                    </button>
                  </div>
                  <p className={helperClass}>
                    {isEvent
                      ? "For events, hangouts, and things happening on a date."
                      : "For places, routes, recommendations, and ideas others can save and try."}
                  </p>
                </section>

                <div
                  className="h-px w-full bg-[var(--border)]/45"
                  aria-hidden
                />
              </>
            ) : null}

            <section>
              <p className={sectionLabelClass}>Who can see this?</p>
              <div
                className="mt-2 flex overflow-hidden rounded-full border border-[var(--border)]/70 bg-[var(--surface-2)]/70"
                role="radiogroup"
                aria-label="Who can see this?"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isFriends}
                  className={!isFriends ? segmentPublicOn : segmentIdle}
                  onClick={() => onVisibilityChange("public")}
                >
                  Public
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isFriends}
                  className={isFriends ? segmentFriendsOn : segmentIdle}
                  onClick={() => onVisibilityChange("friends")}
                >
                  Friends
                </button>
              </div>
              <p className={helperClass}>
                {isFriends
                  ? "Only your friends can see this post."
                  : "Anyone can see this post."}
              </p>
            </section>

            <div
              className="h-px w-full bg-[var(--border)]/45"
              aria-hidden
            />
          </div>

          <section
            ref={ratingsSectionRef}
            data-create-settings-ratings
            className={
              spotlightActive
                ? SETTINGS_RATINGS_SPOTLIGHT_CLASS
                : SETTINGS_RATINGS_IDLE_CLASS
            }
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className={sectionLabelClass}>Allow ratings</p>
                <p className={supportClass}>People can rate this post.</p>
              </div>
              <RatingToggle on={ratingEnabled} onToggle={onRatingToggle} />
            </div>
          </section>
        </div>

        <div className="shrink-0 px-3 pb-2.5 pt-3">
          <button type="button" className={doneClass} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </BottomDrawer>
  );
}
