// src/sections/create/CreateActivityDetailSection.tsx

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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

/** Uses `create-meta-pill` + --create-meta-pill-* (index.css); matches CreateFinalizeMetadataRow. */
const ADDON_TAB_LAYOUT =
  "create-meta-pill relative flex h-7 min-h-[1.75rem] min-w-0 items-center justify-between gap-0.5 rounded-full px-2 text-left";

const ADDON_ICON_LABEL = "text-[var(--create-meta-pill-fg)]";

interface CreateActivityDetailSectionProps {
  activity: number;
  activityIndex: number;
  activities: ActivityType[];
  setActivities: Dispatch<SetStateAction<ActivityType[]>>;
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
  const totalImagesPost = useMemo(
    () => activities.reduce((n, act) => n + (act.images?.length ?? 0), 0),
    [activities]
  );

  const addonTabClass = (key: AddonKey) => {
    const selected = addon === key;
    const anyOpen = addon !== null;
    const scale =
      selected && anyOpen
        ? "z-10 scale-[1.06] shadow-md shadow-black/35"
        : anyOpen
        ? "scale-[0.96] opacity-[0.88]"
        : "";
    const imagesNudge =
      key === "images" && !anyOpen
        ? "ring-1 ring-[var(--create-meta-pill-images-ring)]"
        : "";
    return [ADDON_TAB_LAYOUT, scale, imagesNudge].filter(Boolean).join(" ");
  };

  return (
    <div className="w-full flex flex-col">
      <section className="mt-3 w-full">
        <div
          className={[
            "rounded-[var(--create-radius-panel)] border border-[var(--create-border-composer-shell)] bg-white/95 px-3 pb-2 pt-2.5",
            "shadow-[0_0_0_1px_var(--create-border-composer-shell-ring),0_2px_14px_rgba(0,0,0,0.06)]",
            "app-dark:bg-[var(--surface)]/24 app-dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)]",
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
                className={`h-3.5 w-3.5 shrink-0 ${ADDON_ICON_LABEL}`}
                aria-hidden
              />
              <span
                className={`truncate text-[11px] font-semibold leading-none ${ADDON_ICON_LABEL}`}
              >
                Location
              </span>
            </span>
            {locationStatus === "strong" ? (
              <span
                className="create-meta-pill-endcap inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                role="img"
                aria-label="Place and map link added"
              >
                <PiCheck
                  className="h-2.5 w-2.5 text-[var(--create-meta-pill-endcap-fg)]"
                  strokeWidth={2.75}
                  aria-hidden
                />
              </span>
            ) : locationStatus === "partial" ? (
              <span
                className="create-meta-pill-endcap inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                role="img"
                aria-label="Place added; add a map link to finish"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
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
                className={`h-3.5 w-3.5 shrink-0 ${ADDON_ICON_LABEL}`}
                aria-hidden
              />
              <span
                className={`truncate text-[11px] font-semibold leading-none sm:text-[12px] ${ADDON_ICON_LABEL}`}
              >
                Images
              </span>
            </span>
            {totalImagesPost > 0 ? (
              <span className="create-meta-pill-endcap inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold tabular-nums leading-none text-[var(--create-meta-pill-endcap-fg)]">
                {totalImagesPost}
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
                className={`h-3.5 w-3.5 shrink-0 ${ADDON_ICON_LABEL}`}
                aria-hidden
              />
              <span
                className={`truncate text-[10px] font-semibold leading-tight sm:text-[11px] ${ADDON_ICON_LABEL}`}
              >
                More details
              </span>
            </span>
            {detailsCount > 0 ? (
              <span className="create-meta-pill-endcap inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold tabular-nums leading-none text-[var(--create-meta-pill-endcap-fg)]">
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
                activityIndex={activityIndex}
                setActivities={setActivities}
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
