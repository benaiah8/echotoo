

interface Props {
  viewMode: "all" | "hangouts" | "experiences";
  setViewMode: (mode: Props["viewMode"]) => void;
}

export default function HomeViewToggleSection({
  viewMode,
  setViewMode,
}: Props) {
  const buttons = [
    { label: "Hangouts Only", value: "hangouts" },
    { label: "Experiences Only", value: "experiences" },
  ];

  return (
    <div className="w-full bg-background rounded-lg p-2 mt-2 overflow-hidden">
      <div className="flex items-center w-full gap-2">
        {buttons.map((btn) => {
          const isSelected = viewMode === btn.value;
          return (
            <button
              key={btn.value}
              onClick={() =>
                setViewMode(
                  isSelected ? "all" : (btn.value as Props["viewMode"])
                )
              }
              className={`py-1 px-3 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap ${
                isSelected
                  ? "bg-white text-black"
                  : "bg-background200 text-white"
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
