import SecondaryDropdown from "./input/dropdown/SecondaryDropdown";

type Props = {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  label?: string;
};

const OPTIONS = [
  "1 hr",
  "2 hrs",
  "3 hrs",
  "4 hrs",
  "5 hrs",
  "6 hrs",
  "Half day",
  "Full day",
  "Evening/Night",
  "None",
];

export default function DurationSelect({
  value,
  onChange,
  className = "",
  label = "Duration",
}: Props) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <small className="text-[var(--text)]">{label}</small>
      <SecondaryDropdown
        value={value}
        onChange={onChange}
        options={OPTIONS.map((d) => ({ label: d, value: d }))}
        dropdownClassName="min-w-[220px]"
      />
    </div>
  );
}
