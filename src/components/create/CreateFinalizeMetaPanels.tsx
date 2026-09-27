/**
 * Real create-flow controls for Finalize metadata tabs (same UI as CreateCategoryPage).
 */
import { type ReactNode } from "react";
import VisibilityPillToggle from "../input/VisibilityPillToggle";
import HorizontalNumberWheel from "../input/HorizontalNumberWheel";
import CreateActivityLocationSection from "../../sections/create/CreateActivityLocationSection";
import { ActivityType } from "../../types/post";

type Visibility = "public" | "friends";

export function FinalizeVisibilityPanel({
  visibility,
  onVisibilityChange,
}: {
  visibility: Visibility;
  onVisibilityChange: (v: Visibility) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-[var(--text)]/88 app-dark:text-white/90">
        Who can see this
      </p>
      <VisibilityPillToggle
        value={visibility}
        onChange={onVisibilityChange}
        tone="default"
      />
    </div>
  );
}

export function FinalizeRatePanel({
  ratingEnabled,
  setRatingEnabled,
}: {
  ratingEnabled: boolean;
  setRatingEnabled: (v: boolean) => void;
}) {
  return (
    <div
      className={`flex flex-col gap-2 transition-opacity duration-200 ${
        !ratingEnabled ? "opacity-80 app-dark:opacity-90" : "opacity-100"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-[var(--text)]/88 app-dark:text-white/90">
          Ratings
        </p>
        <button
          type="button"
          className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full p-[3px] transition-colors ${
            ratingEnabled
              ? "bg-[var(--brand)]"
              : "bg-gray-300 app-dark:bg-gray-600"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setRatingEnabled(!ratingEnabled);
          }}
          aria-pressed={ratingEnabled}
          aria-label={ratingEnabled ? "Turn off ratings" : "Turn on ratings"}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${
              ratingEnabled ? "translate-x-[14px]" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      <p className="text-[11px] leading-snug text-[var(--text)]/72 app-dark:text-white/70">
        Let people rate this post after it&apos;s published.
      </p>
    </div>
  );
}

/** Kept for non-V4 / future RSVP UI. V4 finalize More does not render this. */
export function FinalizeRsvpPanel({
  rsvpEnabled,
  setRsvpEnabled,
  rsvpCapacity,
  setRsvpCapacity,
}: {
  rsvpEnabled: boolean;
  setRsvpEnabled: (v: boolean) => void;
  rsvpCapacity: number;
  setRsvpCapacity: (v: number) => void;
}) {
  return (
    <div
      className={`flex flex-col gap-2 transition-opacity duration-200 ${
        !rsvpEnabled ? "opacity-80 app-dark:opacity-90" : "opacity-100"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-[var(--text)]/88 app-dark:text-white/90">
          RSVP capacity
        </p>
        <button
          type="button"
          className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full p-[3px] transition-colors ${
            rsvpEnabled
              ? "bg-[var(--brand)]"
              : "bg-gray-300 app-dark:bg-gray-600"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setRsvpEnabled(!rsvpEnabled);
          }}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${
              rsvpEnabled ? "translate-x-[14px]" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {rsvpEnabled && (
        <HorizontalNumberWheel
          value={rsvpCapacity}
          onChange={setRsvpCapacity}
          max={99}
        />
      )}
    </div>
  );
}

export function FinalizeLocationPanel({
  activity,
  onFieldChange,
}: {
  activity: ActivityType;
  onFieldChange: (field: string, value: unknown) => void;
}) {
  return (
    <CreateActivityLocationSection
      activity={activity}
      activityIndex={0}
      handleChange={onFieldChange}
      embedded
      finalizeEmbedded
    />
  );
}

/** Kept for non-V4 / older create flows. V4 Finalize no longer mounts this panel. */
export function FinalizeMorePanel({
  postType,
  tagsField,
  ratingEnabled,
  setRatingEnabled,
}: {
  postType: "hangout" | "experience";
  tagsField: ReactNode;
  ratingEnabled: boolean;
  setRatingEnabled: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {tagsField}
      {postType === "hangout" ? (
        <>
          <div
            className="border-t border-[var(--create-border-subtle)] app-dark:border-[var(--create-border-panel-line)]"
            aria-hidden
          />
          <FinalizeRatePanel
            ratingEnabled={ratingEnabled}
            setRatingEnabled={setRatingEnabled}
          />
        </>
      ) : null}
    </div>
  );
}
