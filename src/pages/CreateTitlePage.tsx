import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { RRule } from "rrule";

import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import PrimaryInput from "../components/input/PrimaryInput";
import PrimaryToggle from "../components/input/PrimaryToggle";
import CreateTabsSection from "../sections/create/CreateTabsSection";
import CalendarModal from "../components/CalendarModal";
import { Paths } from "../router/Paths";

const WEEKDAYS = ["MO","TU","WE","TH","FR","SA","SU"];
const WEEKDAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export default function CreateTitlePage() {
  const navigate = useNavigate();
  const [q] = useSearchParams();
  const postType = q.get("type") || "journey";

  // form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; details?: string }>({});

  // calendar & recurrence
  const [showCal, setShowCal] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDays, setRecurrenceDays] = useState<string[]>([]);

  const toggleRecurrenceDay = (d: string) =>
    setRecurrenceDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    );

  // wizard URLs
  const base = `?type=${postType}`;
  const paths = [
    `${Paths.createTitle}${base}`,
    `${Paths.createActivities}${base}`,
    `${Paths.createCategories}${base}`,
    `${Paths.preview}${base}`,
  ];

  // step-1 validation
  const handleNext = () => {
    const errs: typeof errors = {};
    if (!title.trim()) errs.title = "Title is required.";
    if (!details.trim()) errs.details = "Details are required.";
    setErrors(errs);
    if (!Object.keys(errs).length) navigate(paths[1]);
  };

  // summary renderer
  // inside CreateTitlePage component, replace renderSummary() with:
const renderSummary = () => {
  const pills: JSX.Element[] = [];

  // Recurring pill (one only)
  if (isRecurring && recurrenceDays.length) {
    const names = recurrenceDays
      .map(d => WEEKDAY_NAMES[WEEKDAYS.indexOf(d)])
      .join(", ");
    pills.push(
      <span
        key="recurring"
        className="text-xs bg-white text-black rounded-full px-2 py-1"
      >
        Every {names}
      </span>
    );
  }

  // Specific date pills
  selectedDates.forEach(dt =>
    pills.push(
      <span
        key={dt.toISOString()}
        className="text-xs bg-background200 text-white rounded-full px-2 py-1"
      >
        {dt.toLocaleDateString()}
      </span>
    )
  );

  if (!pills.length) {
    return <span className="text-xs text-white/70">Select date(s)</span>;
  }
  return <div className="flex flex-wrap gap-2">{pills}</div>;
};


  return (
    <PrimaryPageContainer back>
      <CalendarModal
        show={showCal}
        selectedDates={selectedDates}
        onSelectDates={setSelectedDates}
        isRecurring={isRecurring}
        recurrenceDays={recurrenceDays}
        onToggleRecurrenceDay={toggleRecurrenceDay}
        onClose={() => setShowCal(false)}
      />

      <div className="flex flex-1 flex-col items-center justify-start w-full px-4 pt-8 pb-4">
        {/* Title & Description */}
        <div className="w-full bg-background p-4 rounded-md flex flex-col gap-4">
          <div className={`p-1 ${errors.title ? "border border-red-500 rounded animate-shake" : ""}`}>
            <PrimaryInput
              label="Title"
              value={title}
              placeholder="This is the first thing other owls see"
              onChange={e => setTitle(e.target.value)}
            />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
          </div>
          <PrimaryInput
            label="Description"
            textarea
            rows={1}
            value={description}
            placeholder="Optional – let people know what to expect"
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {/* Recurrence toggle */}
        <div className="w-full mt-4 flex items-center gap-2">
          <span className="text-xs text-white">Repeat weekly?</span>
          <PrimaryToggle value={isRecurring} onChange={setIsRecurring} />
        </div>

        {/* Date summary & Details */}
        <div className="w-full mt-4 bg-background p-4 rounded-md flex flex-col gap-4">
          <div
            className="cursor-pointer bg-background200 rounded px-3 py-2 w-full"
            onClick={() => setShowCal(true)}
          >
            {renderSummary()}
          </div>
          <div className={`p-1 ${errors.details ? "border border-red-500 rounded animate-shake" : ""}`}>
            <PrimaryInput
              label="Details"
              textarea
              rows={1}
              value={details}
              placeholder="Duration or extra info (required)"
              onChange={e => setDetails(e.target.value)}
            />
            {errors.details && <p className="text-red-500 text-xs mt-1">{errors.details}</p>}
          </div>
        </div>

        {/* Anonymous */}
        <div className="w-full mt-4 bg-background p-4 rounded-md">
          <div className="flex justify-between items-center">
            <span className="text-xs text-white">Post anonymously</span>
            <PrimaryToggle value={anonymous} onChange={setAnonymous} />
          </div>
        </div>

        <div className="flex-1" />

        {/* Stepper */}
        <CreateTabsSection step={1} paths={paths} onNext={handleNext} />
      </div>
    </PrimaryPageContainer>
  );
}
