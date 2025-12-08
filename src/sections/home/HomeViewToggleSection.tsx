interface Props {
  viewMode: "all" | "hangouts" | "experiences";
  setViewMode: (mode: Props["viewMode"]) => void;
}

interface ButtonType {
  label: string;
  value: "all" | "hangouts" | "experiences";
  isHome?: boolean;
}

export default function HomeViewToggleSection({
  viewMode,
  setViewMode,
}: Props) {
  const buttons: ButtonType[] = [
    { label: "Hangouts Only", value: "hangouts" },
    { label: "All", value: "all", isHome: true },
    { label: "Experiences Only", value: "experiences" },
  ];

  return (
    <div className="w-full rounded-lg p-2  overflow-hidden">
      <div className="flex items-center justify-center w-full gap-2">
        {buttons.map((btn) => {
          const isSelected = viewMode === btn.value;
          const isHome = btn.isHome;
          return (
            <button
              key={btn.value}
              onClick={() => setViewMode(btn.value)}
              className={`py-1 px-3 rounded-md text-[10px] font-medium whitespace-nowrap border ${
                isSelected
                  ? isHome
                    ? "bg-yellow-500 text-black border-yellow-500"
                    : "bg-white text-black border-white"
                  : isHome
                  ? "text-[var(--text)] border-yellow-500/50 bg-transparent hover:bg-yellow-500/10"
                  : "text-[var(--text)] border-white/25 bg-transparent hover:hover:bg-[rgba(255,255,255,0.08)]"
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
