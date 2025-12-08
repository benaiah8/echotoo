import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import PrimaryInput from "../components/input/PrimaryInput";
import PrimaryToggle from "../components/input/PrimaryToggle";
import CreateTabsSection from "../sections/create/CreateTabsSection";
import CalendarModal from "../components/CalendarModal";
import DurationSelect from "../components/DurationSelect";
import { Paths } from "../router/Paths";

type DraftMeta = {
  caption?: string;
  duration?: string;
  durationNotes?: string;
  isRecurring?: boolean;
  selectedDates?: string[]; // ISO strings
  anonymous?: boolean;
};

export default function CreateTitlePage() {
  const navigate = useNavigate();
  const [q] = useSearchParams();
  const postType = q.get("type") || "experience";

  // hydrate from localStorage (support older "title/description" too)
  const [caption, setCaption] = useState(() => {
    try {
      const raw = localStorage.getItem("draftMeta");
      if (!raw) return "";
      const meta = JSON.parse(raw);
      return meta.caption ?? meta.title ?? meta.description ?? "";
    } catch {
      return "";
    }
  });
  const [duration, setDuration] = useState(() => {
    try {
      const raw = localStorage.getItem("draftMeta");
      return raw ? JSON.parse(raw).duration ?? "" : "";
    } catch {
      return "";
    }
  });
  const [durationNotes, setDurationNotes] = useState(() => {
    try {
      const raw = localStorage.getItem("draftMeta");
      return raw ? JSON.parse(raw).durationNotes ?? "" : "";
    } catch {
      return "";
    }
  });

  const [showCal, setShowCal] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([
    new Date(), // preselect "today"
  ]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [anonymous, setAnonymous] = useState(() => {
    try {
      const raw = localStorage.getItem("draftMeta");
      return raw ? Boolean(JSON.parse(raw).anonymous) : false;
    } catch {
      return false;
    }
  });

  // persist as-you-type
  useEffect(() => {
    const payload: DraftMeta = {
      caption,
      duration,
      durationNotes,
      isRecurring,
      selectedDates: selectedDates.map((d) => d.toISOString()),
      anonymous,
    };
    try {
      localStorage.setItem("draftMeta", JSON.stringify(payload));
    } catch {}
  }, [caption, duration, durationNotes, isRecurring, selectedDates, anonymous]);

  // wizard URLs
  const base = `?type=${postType}`;
  const paths = [
    `${Paths.createTitle}${base}`,
    `${Paths.createActivities}${base}`,
    `${Paths.createCategories}${base}`,
    `${Paths.preview}${base}`,
  ];

  // let users continue even if blank (you asked to remove "required" gating)
  const handleNext = () => navigate(paths[1]);

  return (
    <PrimaryPageContainer back>
      <CalendarModal
        show={showCal}
        selectedDates={selectedDates}
        onSelectDates={setSelectedDates}
        isRecurring={isRecurring}
        recurrenceDays={[]} // not used now
        onToggleRecurrenceDay={() => {}}
        onClose={() => setShowCal(false)}
      />

      <div className="flex flex-1 flex-col items-center justify-start w-full px-4 pt-8 pb-4">
        {/* Caption */}
        <div className="w-full bg-[var(--surface-2)] p-4 rounded-md flex flex-col gap-4">
          <PrimaryInput
            label="Caption"
            value={caption}
            placeholder="Say what this experience is about..."
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>

        {/* Duration + Other notes */}
        <div className="w-full mt-4 bg-[var(--surface-2)] p-4 rounded-md flex flex-col gap-4">
          <DurationSelect value={duration} onChange={setDuration} />

          <PrimaryInput
            label="Other details (optional)"
            textarea
            rows={1}
            value={durationNotes}
            placeholder="e.g., meet-up window, breaks, flex timing"
            onChange={(e) => setDurationNotes(e.target.value)}
          />
        </div>

        {/* Date + Recurrence */}
        <div className="w-full mt-4 bg-[var(--surface-2)] p-4 rounded-md flex flex-col gap-4">
          <div
            className="cursor-pointer bg-[var(--surface-2)]200 rounded px-3 py-2 w-full text-[var(--text)]/80 text-sm"
            onClick={() => setShowCal(true)}
          >
            {selectedDates.length
              ? selectedDates.map((d) => d.toLocaleDateString()).join(", ")
              : "Select date(s)"}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text)]">Repeat weekly?</span>
            <PrimaryToggle value={isRecurring} onChange={setIsRecurring} />
          </div>
        </div>

        {/* Anonymous */}
        <div className="w-full mt-4 bg-[var(--surface-2)] p-4 rounded-md">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text)]">Post anonymously</span>
            <PrimaryToggle value={anonymous} onChange={setAnonymous} />
          </div>
        </div>

        <div className="flex-1" />

        <CreateTabsSection step={1} paths={paths} onNext={handleNext} />
      </div>
    </PrimaryPageContainer>
  );
}
