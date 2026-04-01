// src/sections/create/CreateActivityDetailSection.tsx

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PiCheck, PiImage, PiListBullets, PiMapPin } from "react-icons/pi";
import { ActivityType } from "../../types/post";
import ActivitiesTagsInput from "../../components/ActivitiesTagsInput";
import PrimaryInput from "../../components/input/PrimaryInput";
import CreateActivityAdditionalDetailSection from "./CreateActivityAdditionalDetailSection";
import CreateActivityLocationSection from "./CreateActivityLocationSection";
import CreateActivityImagesSection from "./CreateActivityImagesSection";
import { CREATE_FLOW_LIMITS } from "../../lib/createFlowLimits";
import {
  clampString,
  charFieldRingClassForTone,
  charLimitTone,
} from "../../lib/createFlowLimitUtils";

function tagsIncludeCustomSentinel(tagList: string[]): boolean {
  return tagList.some((t) => t.toLowerCase() === "custom");
}

type AddonKey = "location" | "images" | "more";

/** Match “Next stop”: white pill, h-7, no outline border — selection = scale, not extra border */
const ADDON_TAB_BASE =
  "relative flex h-7 min-h-[1.75rem] min-w-0 items-center justify-between gap-0.5 rounded-full border-0 px-2 text-left " +
  "bg-white text-neutral-950 shadow-sm transition-transform duration-200 ease-out " +
  "hover:bg-neutral-100 active:scale-[0.99] " +
  "dark:bg-white dark:text-neutral-950 dark:shadow-[0_1px_8px_rgba(0,0,0,0.35)] dark:hover:bg-neutral-100";

interface CreateActivityDetailSectionProps {
  activity: number;
  activityIndex: number;
  activities: ActivityType[];
  setActivities: (activities: ActivityType[]) => void;
}

export default function CreateActivityDetailSection({
  activities,
  activity: activityIndex,
  setActivities,
}: CreateActivityDetailSectionProps) {
  const activity = activities[activityIndex];
  const customActivityInputRef = useRef<HTMLInputElement | null>(null);
  const prevTagsTrackerRef = useRef<{
    activityIndex: number;
    sig: string;
  } | null>(null);

  const [addon, setAddon] = useState<AddonKey | null>(null);

  useEffect(() => {
    setAddon(null);
  }, [activityIndex]);

  const toggleAddon = (key: AddonKey) => {
    const ae = document.activeElement;
    if (ae instanceof HTMLElement) ae.blur();
    setAddon((prev) => (prev === key ? null : key));
  };

  useLayoutEffect(() => {
    const tags = activity.tags;
    const sig = JSON.stringify(tags);
    const hasCustom = tagsIncludeCustomSentinel(tags);
    const prev = prevTagsTrackerRef.current;

    if (!prev || prev.activityIndex !== activityIndex) {
      prevTagsTrackerRef.current = { activityIndex, sig };
      return;
    }

    if (prev.sig === sig) return;

    const prevTags = JSON.parse(prev.sig) as string[];
    const hadCustom = tagsIncludeCustomSentinel(prevTags);
    prevTagsTrackerRef.current = { activityIndex, sig };

    if (!hadCustom && hasCustom) {
      customActivityInputRef.current?.focus();
    }
  }, [activity.tags, activityIndex]);

  const patchActivity = (patch: Partial<ActivityType>) => {
    setActivities(
      activities.map((act, idx) =>
        idx === activityIndex ? { ...act, ...patch } : act
      )
    );
  };

  const handleChange = (field: string, value: any) => {
    const lim = CREATE_FLOW_LIMITS.activities;
    if (field === "location") {
      patchActivity({
        location: clampString(String(value), lim.placeNameMaxChars),
      });
      return;
    }
    if (field === "locationUrl") {
      patchActivity({
        locationUrl: clampString(String(value), lim.googleMapsLinkMaxChars),
      });
      return;
    }
    if (field === "locationNotes") {
      patchActivity({
        locationNotes: clampString(
          String(value),
          lim.locationExtraDetailsMaxChars
        ),
      });
      return;
    }
    patchActivity({ [field]: value } as Partial<ActivityType>);
  };

  const handleTagsChange = (newTags: string[]) => {
    const primary = newTags.find((t) => t.toLowerCase() !== "custom") || "";
    const patch: Partial<ActivityType> = { tags: newTags };

    if (primary) {
      patch.activityType = primary;
      patch.title = primary;
    } else if (activity.customActivity?.trim()) {
      const custom = activity.customActivity.trim();
      patch.activityType = custom;
      patch.title = custom;
    }

    patchActivity(patch);
  };

  /** Add-on pill: empty | address-only (dot) | address + maps URL (check). Notes do not affect tier. */
  const locationStatus = useMemo(() => {
    const hasPlace = !!(activity.location || "").trim();
    const hasMapsUrl = !!(activity.locationUrl || "").trim();
    if (hasPlace && hasMapsUrl) return "strong" as const;
    if (hasPlace && !hasMapsUrl) return "partial" as const;
    return "empty" as const;
  }, [activity.location, activity.locationUrl]);

  const detailsCount = (activity.additionalInfo || []).length;
  const imageCount = (activity.images || []).length;

  const addonTabClass = (key: AddonKey) => {
    const selected = addon === key;
    const anyOpen = addon !== null;
    const scale =
      selected && anyOpen
        ? "z-10 scale-[1.06] shadow-md dark:shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
        : anyOpen
        ? "scale-[0.96] opacity-[0.88]"
        : "";
    const imagesNudge =
      key === "images" && !anyOpen
        ? "ring-1 ring-black/10 dark:ring-white/25"
        : "";
    return [ADDON_TAB_BASE, scale, imagesNudge].filter(Boolean).join(" ");
  };

  return (
    <div className="w-full flex flex-col">
      <section className="mt-3 w-full">
        <div
          className={[
            "rounded-xl border border-[var(--border)]/55 bg-[var(--surface)]/24 px-3 pb-2 pt-2.5",
            "shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_18%,transparent),0_2px_14px_rgba(0,0,0,0.05)]",
            "dark:border-white dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)]",
          ].join(" ")}
        >
          <ActivitiesTagsInput
            tags={activity.tags}
            onChange={handleTagsChange}
            autoFocus
            activityKey={activityIndex}
          />

          {tagsIncludeCustomSentinel(activity.tags) && (
            <div className="mt-2.5 w-full">
              <PrimaryInput
                ref={customActivityInputRef}
                label="Custom activity"
                placeholder="Describe your custom activity"
                value={activity.customActivity}
                maxLength={CREATE_FLOW_LIMITS.activities.customActivityMaxChars}
                counterMax={
                  CREATE_FLOW_LIMITS.activities.customActivityMaxChars
                }
                className={charFieldRingClassForTone(
                  charLimitTone(
                    (activity.customActivity || "").length,
                    CREATE_FLOW_LIMITS.activities.customActivityMaxChars
                  )
                )}
                autoCapitalize="sentences"
                autoCorrect="on"
                onChange={(e) => {
                  const val = clampString(
                    e.target.value,
                    CREATE_FLOW_LIMITS.activities.customActivityMaxChars
                  );
                  const name = val.trim();
                  patchActivity({
                    customActivity: val,
                    ...(name ? { activityType: name, title: name } : {}),
                  });
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Optional add-ons: single active panel */}
      <div className="mt-3 w-full">
        <div
          className="grid grid-cols-3 gap-1.5"
          role="tablist"
          aria-label="Optional add-ons"
        >
          <button
            type="button"
            role="tab"
            aria-selected={addon === "location"}
            className={addonTabClass("location")}
            onClick={() => toggleAddon("location")}
          >
            <span className="flex min-w-0 items-center gap-1">
              <PiMapPin
                className="h-3.5 w-3.5 shrink-0 text-neutral-950"
                aria-hidden
              />
              <span className="truncate text-[11px] font-semibold leading-none text-neutral-950">
                Location
              </span>
            </span>
            {locationStatus === "strong" ? (
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white shadow-sm"
                role="img"
                aria-label="Place and map link added"
              >
                <PiCheck
                  className="h-2.5 w-2.5 text-white"
                  strokeWidth={2.75}
                  aria-hidden
                />
              </span>
            ) : locationStatus === "partial" ? (
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-950"
                role="img"
                aria-label="Place added; add a map link to finish"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              </span>
            ) : (
              <span className="inline-flex h-4 w-4 shrink-0" aria-hidden />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={addon === "images"}
            className={addonTabClass("images")}
            onClick={() => toggleAddon("images")}
          >
            <span className="flex min-w-0 items-center gap-1">
              <PiImage
                className="h-3.5 w-3.5 shrink-0 text-neutral-950"
                aria-hidden
              />
              <span className="truncate text-[11px] font-semibold leading-none text-neutral-950 sm:text-[12px]">
                Images
              </span>
            </span>
            {imageCount > 0 ? (
              <span className="inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-neutral-950 px-0.5 text-[9px] font-semibold tabular-nums leading-none text-white shadow-sm">
                {imageCount}
              </span>
            ) : (
              <span className="inline-flex h-4 w-4 shrink-0" aria-hidden />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={addon === "more"}
            className={addonTabClass("more")}
            onClick={() => toggleAddon("more")}
          >
            <span className="flex min-w-0 items-center gap-1">
              <PiListBullets
                className="h-3.5 w-3.5 shrink-0 text-neutral-950"
                aria-hidden
              />
              <span className="truncate text-[10px] font-semibold leading-tight text-neutral-950 sm:text-[11px]">
                More details
              </span>
            </span>
            {detailsCount > 0 ? (
              <span className="inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-neutral-950 px-0.5 text-[9px] font-semibold tabular-nums leading-none text-white shadow-sm">
                {detailsCount}
              </span>
            ) : (
              <span className="inline-flex h-4 w-4 shrink-0" aria-hidden />
            )}
          </button>
        </div>

        {addon !== null && (
          <div className="mt-2 w-full">
            {addon === "location" && (
              <CreateActivityLocationSection
                key={`create-loc-${activityIndex}`}
                embedded
                activity={activity}
                activityIndex={activityIndex}
                handleChange={handleChange}
              />
            )}
            {addon === "images" && (
              <CreateActivityImagesSection
                key={`create-img-${activityIndex}`}
                embedded
                activities={activities}
                activity={activity}
                activityIndex={activityIndex}
                handleChange={handleChange}
              />
            )}
            {addon === "more" && (
              <CreateActivityAdditionalDetailSection
                key={`create-more-${activityIndex}`}
                embedded
                activity={activity}
                handleChange={handleChange}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
