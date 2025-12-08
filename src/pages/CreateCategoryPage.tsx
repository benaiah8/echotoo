import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateTabsSection from "../sections/create/CreateTabsSection";
import { Paths } from "../router/Paths";
import PrimaryInput from "../components/input/PrimaryInput";
import PrimaryToggle from "../components/input/PrimaryToggle";
import CalendarModal from "../components/CalendarModal";

import VisibilityPillToggle from "../components/input/VisibilityPillToggle";
import HorizontalNumberWheel from "../components/input/HorizontalNumberWheel";

type Visibility = "public" | "friends" | "anonymous";

type DraftMeta = {
  caption?: string;
  tags?: string[];
  visibility?: Visibility;
  rsvpCapacity?: number | null;
  rsvpEnabled?: boolean;
  selectedDates?: string[]; // ISO strings
  isRecurring?: boolean;
  recurrenceDays?: string[]; // ["MO","TU",...]
  anonymousName?: string; // NEW: anonymous name for anonymous posts
  anonymousAvatar?: string; // NEW: anonymous avatar (letter/number/emoji)
};

const WEEKDAYS: { code: string; label: string }[] = [
  { code: "MO", label: "Mon" },
  { code: "TU", label: "Tue" },
  { code: "WE", label: "Wed" },
  { code: "TH", label: "Thu" },
  { code: "FR", label: "Fri" },
  { code: "SA", label: "Sat" },
  { code: "SU", label: "Sun" },
];

export default function CreateCategoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const postType = (searchParams.get("type") || "experience").toLowerCase();

  const base = `?type=${postType}`;
  const paths = [
    `${Paths.createTitle}${base}`,
    `${Paths.createActivities}${base}`,
    `${Paths.createCategories}${base}`,
    `${Paths.preview}${base}`,
  ];

  // hydrate draft
  const initialMeta: DraftMeta = useMemo(() => {
    try {
      // Check if we're in edit mode
      const editData = localStorage.getItem("editPostData");
      if (editData) {
        const parsed = JSON.parse(editData);
        return {
          caption: parsed.caption ?? "", // Use nullish coalescing to preserve empty strings
          tags: parsed.tags || [],
          visibility: parsed.visibility || "public",
          rsvpCapacity: parsed.rsvp_capacity || 5,
          rsvpEnabled: parsed.rsvp_capacity ? true : false,
          selectedDates: parsed.selected_dates || [],
          isRecurring: parsed.is_recurring || false,
          recurrenceDays: parsed.recurrence_days || [],
          anonymousName: parsed.anonymous_name || "",
          anonymousAvatar: parsed.anonymous_avatar || "",
        };
      }

      // Fallback to draft data
      const raw = localStorage.getItem("draftMeta");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const [caption, setCaption] = useState<string>(initialMeta.caption ?? "");
  const [tags, setTags] = useState<string[]>(initialMeta.tags ?? []);
  const [tagInput, setTagInput] = useState("");

  const [visibility, setVisibility] = useState<Visibility>(
    (initialMeta.visibility as Visibility) || "public"
  );

  const [rsvpCapacity, setRsvpCapacity] = useState<number>(
    typeof initialMeta.rsvpCapacity === "number" ? initialMeta.rsvpCapacity : 5
  );
  const [rsvpEnabled, setRsvpEnabled] = useState<boolean>(
    typeof initialMeta.rsvpEnabled === "boolean"
      ? initialMeta.rsvpEnabled
      : false
  );

  const [showCal, setShowCal] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>(
    (initialMeta.selectedDates || []).length
      ? (initialMeta.selectedDates || []).map((iso) => new Date(iso))
      : []
  );
  const [isRecurring, setIsRecurring] = useState<boolean>(
    !!initialMeta.isRecurring
  );
  const [recurrenceDays, setRecurrenceDays] = useState<string[]>(
    initialMeta.recurrenceDays || []
  );

  // Anonymous name state - load from localStorage for reuse
  const [anonymousName, setAnonymousName] = useState<string>(() => {
    // First try to get from current draft
    if (initialMeta.anonymousName) {
      return initialMeta.anonymousName;
    }
    // Then try to get from localStorage for reuse
    const saved = localStorage.getItem("anonymousName");
    return saved || "";
  });

  // Anonymous avatar state - load from localStorage for reuse
  const [anonymousAvatar, setAnonymousAvatar] = useState<string>(() => {
    // First try to get from current draft
    if (initialMeta.anonymousAvatar) {
      return initialMeta.anonymousAvatar;
    }
    // Then try to get from localStorage for reuse
    const saved = localStorage.getItem("anonymousAvatar");
    return saved || "";
  });

  const [isEditMode, setIsEditMode] = useState(() => {
    return localStorage.getItem("editPostData") !== null;
  });

  // info toggles
  const [showTagsInfo, setShowTagsInfo] = useState(false);
  const [showVisInfo, setShowVisInfo] = useState(false);
  const [showRsvpInfo, setShowRsvpInfo] = useState(false);

  // persist
  useEffect(() => {
    const payload: DraftMeta = {
      caption,
      tags,
      visibility,
      rsvpCapacity,
      rsvpEnabled,
      selectedDates: selectedDates.map((d) => d.toISOString()),
      isRecurring,
      recurrenceDays,
      anonymousName,
      anonymousAvatar,
    };

    try {
      if (isEditMode) {
        // In edit mode, update the edit data
        const editData = localStorage.getItem("editPostData");
        if (editData) {
          const parsed = JSON.parse(editData);
          parsed.caption = payload.caption;
          parsed.tags = payload.tags;
          parsed.visibility = payload.visibility;
          parsed.rsvp_capacity = payload.rsvpCapacity;
          parsed.selected_dates = payload.selectedDates;
          parsed.is_recurring = payload.isRecurring;
          parsed.recurrence_days = payload.recurrenceDays;
          parsed.anonymous_name = payload.anonymousName;
          parsed.anonymous_avatar = payload.anonymousAvatar;
          localStorage.setItem("editPostData", JSON.stringify(parsed));
        }
      } else {
        // In create mode, use draft data
        localStorage.setItem("draftMeta", JSON.stringify(payload));
      }
    } catch {}
  }, [
    caption,
    tags,
    visibility,
    rsvpCapacity,
    rsvpEnabled,
    selectedDates,
    isRecurring,
    recurrenceDays,
    anonymousName,
    anonymousAvatar,
    isEditMode,
  ]);

  const handleNext = () => navigate(paths[3]);

  const handlePrev = () => {
    if (isEditMode) {
      // In edit mode, go to previous step (activities page)
      navigate(paths[1]); // This goes to CreateActivitiesPage
    } else {
      // In create mode, go to previous step
      navigate(paths[1]); // This also goes to CreateActivitiesPage
    }
  };

  // tag suggestions (trimmed)
  const allSuggestions = useMemo<string[]>(
    () => [
      "food",
      "drinks",
      "coffee",
      "date",
      "friends",
      "family",
      "outdoors",
      "nightlife",
      "museum",
      "games",
      "walk",
      "weekend",
      "summer",
    ],
    []
  );
  const suggestions = useMemo(
    () => allSuggestions.filter((s) => !tags.includes(s)).slice(0, 6),
    [allSuggestions, tags]
  );

  const addTag = (t: string) => {
    const v = t.trim().toLowerCase();
    if (!v || tags.includes(v)) return;
    setTags([...tags, v]);
    setTagInput("");
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const toggleDay = (code: string) =>
    setRecurrenceDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );

  // Helper function to format dates as ranges and individual dates
  const formatDateSummary = (dates: Date[]) => {
    if (dates.length === 0) return [];

    const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const groups: Array<{ type: "range" | "single"; start: Date; end?: Date }> =
      [];
    let i = 0;

    while (i < sortedDates.length) {
      const startDate = sortedDates[i];
      let endDate = startDate;
      let j = i;

      // Find consecutive dates
      while (j + 1 < sortedDates.length) {
        const currentDate = sortedDates[j];
        const nextDate = sortedDates[j + 1];
        const dayDiff =
          (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);

        if (dayDiff === 1) {
          endDate = nextDate;
          j++;
        } else {
          break;
        }
      }

      if (startDate.getTime() === endDate.getTime()) {
        // Single date
        groups.push({ type: "single", start: startDate });
      } else {
        // Range
        groups.push({ type: "range", start: startDate, end: endDate });
      }

      i = j + 1;
    }

    return groups;
  };

  const dateSummary = formatDateSummary(selectedDates);

  return (
    <PrimaryPageContainer back>
      {/* Modal lives at root */}
      <CalendarModal
        show={showCal}
        selectedDates={selectedDates}
        onSelectDates={(ds) => setSelectedDates(ds || [])}
        isRecurring={isRecurring}
        recurrenceDays={recurrenceDays}
        onToggleRecurrenceDay={toggleDay}
        onClose={() => setShowCal(false)}
      />

      <div
        className="flex-1 w-full page-content flex flex-col"
        style={{
          paddingBottom:
            "calc(var(--create-actions-total-bottom, 120px) + 24px)",
        }}
      >
        {/* Caption (enhanced with light hovering effect) */}
        <section className="w-full mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 pt-3 pb-[5px] shadow-[0_2px_12px_rgba(255,255,255,0.08),0_1px_4px_rgba(255,255,255,0.12)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.12),0_2px_8px_rgba(255,255,255,0.15)] transition-shadow duration-200">
          <h3 className="text-sm font-medium text-[var(--text)]/85">Caption</h3>

          <textarea
            rows={4}
            value={caption}
            placeholder="Say what this is about…"
            onChange={(e) => setCaption(e.target.value)}
            className="w-full mt-4 text-xs bg-[var(--surface)]/20 text-[var(--text)] placeholder-[var(--text)]/50 border border-[var(--border)] rounded-lg px-3 py-2 resize-none transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 focus:border-[var(--brand)]/50"
          />
        </section>

        {/* Tags */}
        <section className="w-full mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-[var(--text)]/85">Tags</h3>
            <button
              type="button"
              className="text-[var(--text)]/60 text-xs border border-[var(--border)] rounded-full px-2 py-0.5"
              onClick={() => setShowTagsInfo((s) => !s)}
              aria-expanded={showTagsInfo}
            >
              ⓘ
            </button>
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-[var(--surface)]/40 text-[var(--text)]"
                >
                  {t}
                  <button
                    type="button"
                    className="opacity-80 hover:opacity-100"
                    aria-label={`Remove ${t}`}
                    onClick={() => removeTag(t)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addTag(tagInput);
              }}
              className="relative"
            >
              <div className="flex items-center border border-[var(--border)] rounded-lg px-3 py-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  enterKeyHint="done"
                  placeholder="Add a tag (e.g., coffee, date, weekend)"
                  className="flex-1 bg-transparent text-sm text-[var(--text)] outline-none pr-16"
                />
                <button
                  type="submit"
                  className="absolute right-2 text-xs font-semibold rounded-lg px-3 py-1 bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] border border-[var(--border)] hover:opacity-90 active:scale-[0.99] transition"
                >
                  Add
                </button>
              </div>
            </form>

            {showTagsInfo && (
              <p className="text-[var(--text)]/70 text-xs mt-2">
                Use a few keywords; we’ll also consider your caption.
              </p>
            )}

            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addTag(s)}
                    className="text-xs px-2 py-1 rounded-full border border-[var(--border)] text-[var(--text)]/85 hover:bg-[var(--surface)]/40"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Dates & repeat (own section that triggers the modal) */}
        <section className="w-full mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3">
          <h3 className="text-sm font-medium text-[var(--text)]/85">
            Dates & repeat
          </h3>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowCal(true)}
              className="w-full text-left px-3 py-2 rounded-md border border-[var(--border)] text-[var(--text)]/85 hover:bg-[var(--surface)]/40"
            >
              {dateSummary.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {dateSummary.map((group, index) => (
                    <div
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-[var(--surface)]/30 text-[var(--text)] border border-[var(--border)] rounded-md font-medium"
                    >
                      <span>
                        {group.type === "range" && group.end
                          ? `${group.start.toLocaleDateString()} - ${group.end.toLocaleDateString()}`
                          : group.start.toLocaleDateString()}
                      </span>
                      {/* Using div instead of button to avoid nested button validation error */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          // Remove all dates in this group
                          let datesToRemove: Date[] = [];
                          if (group.type === "range" && group.end) {
                            // Remove all dates from start to end
                            const current = new Date(group.start);
                            while (current <= group.end) {
                              datesToRemove.push(new Date(current));
                              current.setDate(current.getDate() + 1);
                            }
                          } else {
                            // Remove single date
                            datesToRemove = [group.start];
                          }

                          // Filter out the dates to remove from selectedDates
                          const newDates = selectedDates.filter(
                            (date) =>
                              !datesToRemove.some(
                                (removeDate) =>
                                  removeDate.getTime() === date.getTime()
                              )
                          );
                          setSelectedDates(newDates);
                        }}
                        className="ml-1 text-[var(--text)]/60 hover:text-[var(--text)] text-sm leading-none cursor-pointer select-none"
                        role="button"
                        tabIndex={0}
                        aria-label="Remove date range"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            // Same logic as onClick
                            let datesToRemove: Date[] = [];
                            if (group.type === "range" && group.end) {
                              const current = new Date(group.start);
                              while (current <= group.end) {
                                datesToRemove.push(new Date(current));
                                current.setDate(current.getDate() + 1);
                              }
                            } else {
                              datesToRemove = [group.start];
                            }
                            const newDates = selectedDates.filter(
                              (date) =>
                                !datesToRemove.some(
                                  (removeDate) =>
                                    removeDate.getTime() === date.getTime()
                                )
                            );
                            setSelectedDates(newDates);
                          }
                        }}
                      >
                        ×
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                "Select date(s)"
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 mt-3">
            <span className="text-xs text-[var(--text)]/80">
              Repeat weekly?
            </span>
            <PrimaryToggle value={isRecurring} onChange={setIsRecurring} />
          </div>

          {isRecurring && (
            <div className="flex flex-wrap gap-2 mt-3">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => toggleDay(d.code)}
                  className={`text-xs px-2 py-1 rounded-full border border-[var(--border)]
                    ${
                      recurrenceDays.includes(d.code)
                        ? "bg-[var(--brand)] text-[var(--brand-ink)]"
                        : "bg-transparent text-[var(--text)]/85"
                    }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Visibility */}
        <section className="w-full mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-[var(--text)]/85">
              Visibility
            </h3>
            <button
              type="button"
              className="text-[var(--text)]/60 text-xs border border-[var(--border)] rounded-full px-2 py-0.5"
              onClick={() => setShowVisInfo((s) => !s)}
              aria-expanded={showVisInfo}
            >
              ⓘ
            </button>
          </div>

          <div className="mt-6">
            <VisibilityPillToggle value={visibility} onChange={setVisibility} />
          </div>
          {showVisInfo && (
            <p className="text-[var(--text)]/65 text-xs mt-2">
              Default is <strong>Public</strong>. Choose{" "}
              <strong>Friends</strong> to limit to friends, or{" "}
              <strong>Anonymous</strong> to hide your avatar/name.
            </p>
          )}
        </section>

        {/* Anonymous Name Input - Only show when anonymous is selected */}
        {visibility === "anonymous" && (
          <section className="w-full mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium text-[var(--text)]/85">
                Anonymous Identity
              </h3>
            </div>

            {/* Anonymous Name Input */}
            <div className="mb-3">
              <label className="text-xs text-[var(--text)]/70 mb-1 block">
                Display Name
              </label>
              <PrimaryInput
                value={anonymousName}
                onChange={(e) => {
                  setAnonymousName(e.target.value);
                  // Save to localStorage for reuse
                  localStorage.setItem("anonymousName", e.target.value);
                }}
                placeholder="Enter your anonymous name"
                maxLength={30}
              />
            </div>

            {/* Anonymous Avatar Input */}
            <div className="mb-3">
              <label className="text-xs text-[var(--text)]/70 mb-1 block">
                Avatar (Letter, Number, or Emoji)
              </label>
              <PrimaryInput
                value={anonymousAvatar}
                onChange={(e) => {
                  setAnonymousAvatar(e.target.value);
                  // Save to localStorage for reuse
                  localStorage.setItem("anonymousAvatar", e.target.value);
                }}
                placeholder="e.g., A, 1, 😊"
                maxLength={2}
              />
            </div>

            <p className="text-[var(--text)]/65 text-xs">
              This identity will be shown instead of your username and profile
              picture. It will be saved for future anonymous posts.
            </p>
          </section>
        )}

        {/* RSVP capacity (0–99) */}
        <section
          className={`w-full mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3 transition-opacity duration-200 ${
            !rsvpEnabled ? "opacity-40" : "opacity-100"
          }`}
          onClick={() => {
            if (!rsvpEnabled) {
              setRsvpEnabled(true);
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-[var(--text)]/85">
                RSVP capacity
              </h3>
              <button
                type="button"
                className="text-[var(--text)]/60 text-xs border border-[var(--border)] rounded-full px-2 py-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRsvpInfo((s) => !s);
                }}
                aria-expanded={showRsvpInfo}
              >
                ⓘ
              </button>
            </div>
            <button
              type="button"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                rsvpEnabled
                  ? "bg-[var(--brand)]"
                  : "bg-gray-300 dark:bg-gray-600"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setRsvpEnabled(!rsvpEnabled);
              }}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  rsvpEnabled ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          {rsvpEnabled && (
            <>
              <HorizontalNumberWheel
                value={rsvpCapacity}
                onChange={(v) => setRsvpCapacity(v)}
                max={99}
              />
              {showRsvpInfo && (
                <p className="text-[var(--text)]/65 text-xs mt-2">
                  Mostly for Hangouts (e.g., set <strong>10</strong> for a small
                  book club so it doesn't overcrowd).
                </p>
              )}
            </>
          )}
        </section>

        <div className="flex-1" />
        <CreateTabsSection
          step={isEditMode ? 2 : 3}
          paths={paths}
          onNext={handleNext}
          onPrev={handlePrev}
          isEditMode={isEditMode}
        />
      </div>
    </PrimaryPageContainer>
  );
}
