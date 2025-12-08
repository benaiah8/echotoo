import SecondaryDropdown from "./input/dropdown/SecondaryDropdown";
import PrimaryInput from "./input/PrimaryInput";
import { useMemo } from "react";

interface Props {
  value: string; // stores the *display* string, e.g., "4 hrs"
  onChange: (v: string) => void;
  notes?: string;
  onNotesChange?: (v: string) => void;
  className?: string;
}

const PRESETS = [
  "Full day",
  "Evening/Night",
  ...Array.from({ length: 12 }, (_, i) => `${i + 1} hr${i ? "s" : ""}`),
];

export default function DurationPicker({
  value,
  onChange,
  notes = "",
  onNotesChange,
  className = "",
}: Props) {
  const options = useMemo(
    () => PRESETS.map((label) => ({ label, value: label })),
    []
  );

  const isPreset = PRESETS.includes(value);
  const customValue = isPreset ? "" : value;

  return (
    <div className={`w-full flex flex-col gap-3 ${className}`}>
      <SecondaryDropdown
        label="Duration"
        value={isPreset ? value : ""} // empty means "no preset currently selected"
        onChange={(v) => onChange(v)}
        options={options}
      />

      {/* Custom free text (always available) */}
      <PrimaryInput
        label="Or write a custom duration"
        placeholder={`e.g., "4 hrs 30 min"`}
        value={customValue}
        onChange={(e) => onChange((e.target as HTMLInputElement).value)}
      />

      {/* Optional notes below */}
      {onNotesChange && (
        <PrimaryInput
          label="Extra timing details (optional)"
          textarea
          rows={1}
          value={notes}
          onChange={(e) =>
            onNotesChange((e.target as HTMLTextAreaElement).value)
          }
          placeholder="Any extra info about timing…"
        />
      )}
    </div>
  );
}
