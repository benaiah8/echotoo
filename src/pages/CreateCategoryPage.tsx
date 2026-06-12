import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateFlowKeyboardShell, {
  createFlowMainColumnStyle,
} from "../components/create/CreateFlowKeyboardShell";
import CreateFlowTopBar from "../components/create/CreateFlowTopBar";
import { useCreateFlowNotices } from "../components/create/CreateFlowNoticeContext";
import CreateTabsSection from "../sections/create/CreateTabsSection";
import { Paths } from "../router/Paths";
import { CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID } from "../lib/createFlowNoticeIds";
import PrimaryToggle from "../components/input/PrimaryToggle";
import CalendarModal from "../components/CalendarModal";

import VisibilityPillToggle from "../components/input/VisibilityPillToggle";
import HorizontalNumberWheel from "../components/input/HorizontalNumberWheel";
import CreateFlowPostTagsField from "../components/create/CreateFlowPostTagsField";
import { CREATE_FLOW_WEEKDAYS } from "../lib/createFlowScheduleConstants";
import { formatDateSummary } from "../lib/createFlowDateSummary";
import { notifyLocalDraftPersisted } from "../lib/drafts";

// [LAUNCH] Anonymous posting disabled - only public and friends
type Visibility = "public" | "friends";

type DraftMeta = {
  caption?: string;
  tags?: string[];
  visibility?: Visibility;
  rsvpCapacity?: number | null;
  rsvpEnabled?: boolean;
  selectedDates?: string[]; // ISO strings
  isRecurring?: boolean;
  recurrenceDays?: string[]; // ["MO","TU",...]
};

export default function CreateCategoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { upsertNotice, removeNotice, notices } = useCreateFlowNotices();
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
        const vis = parsed.visibility || "public";
        return {
          caption: parsed.caption ?? "",
          tags: parsed.tags || [],
          visibility: vis === "anonymous" ? "public" : vis,
          rsvpCapacity: parsed.rsvp_capacity || 5,
          rsvpEnabled: parsed.rsvp_capacity ? true : false,
          selectedDates: parsed.selected_dates || [],
          isRecurring: parsed.is_recurring || false,
          recurrenceDays: parsed.recurrence_days || [],
        };
      }

      const raw = localStorage.getItem("draftMeta");
      if (raw) {
        const meta = JSON.parse(raw);
        return {
          ...meta,
          visibility:
            meta.visibility === "anonymous"
              ? "public"
              : meta.visibility || "public",
        };
      }
      return {};
    } catch {
      return {};
    }
  }, []);

  const [caption, setCaption] = useState<string>(initialMeta.caption ?? "");
  const [tags, setTags] = useState<string[]>(initialMeta.tags ?? []);
  const captionSectionRef = useRef<HTMLElement | null>(null);

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

  const [isEditMode, setIsEditMode] = useState(() => {
    return localStorage.getItem("editPostData") !== null;
  });

  // info toggles
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
    };

    try {
      if (isEditMode) {
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
          localStorage.setItem("editPostData", JSON.stringify(parsed));
        }
      } else {
        localStorage.setItem("draftMeta", JSON.stringify(payload));
        notifyLocalDraftPersisted();
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
    isEditMode,
  ]);

  const scrollCaptionIntoView = () => {
    captionSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    const ta = captionSectionRef.current?.querySelector("textarea");
    if (ta instanceof HTMLTextAreaElement) {
      window.setTimeout(() => ta.focus(), 320);
    }
  };

  useEffect(() => {
    if (caption.trim().length > 0) {
      removeNotice(CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID);
    }
  }, [caption, removeNotice]);

  const handleNext = () => {
    if (!caption.trim()) {
      upsertNotice({
        id: CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID,
        variant: "warning",
        message: "Add a caption to continue.",
        onAction: scrollCaptionIntoView,
        actionLabel: "Show",
      });
      scrollCaptionIntoView();
      return;
    }
    navigate(paths[3]);
  };

  const showCaptionHighlight = notices.some(
    (n) => n.id === CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID
  );

  const handlePrev = () => {
    if (isEditMode) {
      // In edit mode, go to previous step (activities page)
      navigate(paths[1]); // This goes to CreateActivitiesPage
    } else {
      // In create mode, go to previous step
      navigate(paths[1]); // This also goes to CreateActivitiesPage
    }
  };

  const toggleDay = (code: string) =>
    setRecurrenceDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );

  const dateSummary = formatDateSummary(selectedDates);

  return (
    <PrimaryPageContainer back capacitorNotchScrim>
      <CreateFlowTopBar />
      <CreateFlowKeyboardShell>
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
          className="flex-1 w-full px-4 flex flex-col"
          style={createFlowMainColumnStyle}
        >
          {/* Caption (enhanced with light hovering effect) */}
          <section
            ref={captionSectionRef}
            className={[
              "w-full mt-6 rounded-lg border bg-[var(--surface)]/30 px-3 pt-3 pb-[5px] transition-shadow duration-200",
              showCaptionHighlight
                ? "border-[var(--brand)]/60 ring-2 ring-[var(--brand)]/35 shadow-[0_0_22px_rgba(247,208,71,0.28),0_4px_16px_rgba(0,0,0,0.12)]"
                : "border-[var(--border)] shadow-[0_2px_12px_rgba(255,255,255,0.08),0_1px_4px_rgba(255,255,255,0.12)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.12),0_2px_8px_rgba(255,255,255,0.15)]",
            ].join(" ")}
          >
            <h3 className="text-sm font-medium text-[var(--text)]/85">
              Caption <span className="text-[var(--brand)]">*</span>
            </h3>

            <textarea
              rows={4}
              value={caption}
              placeholder="Say what this is about…"
              onChange={(e) => setCaption(e.target.value)}
              className="w-full mt-4 text-xs bg-[var(--surface)]/20 text-[var(--text)] placeholder-[var(--text)]/50 border border-[var(--border)] rounded-lg px-3 py-2 resize-none transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 focus:border-[var(--brand)]/50"
            />
          </section>

          <CreateFlowPostTagsField
            tags={tags}
            onTagsChange={setTags}
            variant="standalone"
          />

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
                {CREATE_FLOW_WEEKDAYS.map((d) => (
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
              <VisibilityPillToggle
                value={visibility}
                onChange={setVisibility}
              />
            </div>
            {showVisInfo && (
              <p className="text-[var(--text)]/65 text-xs mt-2">
                Default is <strong>Public</strong>. Choose{" "}
                <strong>Friends</strong> to limit visibility to friends only.
              </p>
            )}
          </section>

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
                    Mostly for events (e.g., set <strong>10</strong> for a
                    small book club so it doesn't overcrowd).
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
      </CreateFlowKeyboardShell>
    </PrimaryPageContainer>
  );
}
