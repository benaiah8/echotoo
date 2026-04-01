// components/input/PrimaryToggle.tsx
import React from "react";

interface PrimaryToggleProps {
  value: boolean;
  onChange: (val: boolean) => void;
  /** Slimmer track (e.g. finalize date panel). */
  compact?: boolean;
}

const PrimaryToggle: React.FC<PrimaryToggleProps> = ({
  value,
  onChange,
  compact = false,
}) => {
  return (
    <div
      onClick={() => onChange(!value)}
      className={
        compact
          ? "w-8 h-[18px] flex items-center rounded-full p-[3px] cursor-pointer transition-colors shrink-0"
          : "w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors"
      }
      style={{
        backgroundColor: value ? "var(--toggle-bg-active)" : "var(--toggle-bg)",
      }}
    >
      <div
        className={
          compact
            ? "w-3 h-3 rounded-full shadow-sm transform transition-transform"
            : "w-4 h-4 rounded-full shadow-md transform transition-transform"
        }
        style={{
          backgroundColor: "var(--toggle-thumb)",
          transform: compact
            ? value
              ? "translateX(12px)"
              : "translateX(0px)"
            : value
            ? "translateX(16px)"
            : "translateX(0px)",
        }}
      />
    </div>
  );
};

export default PrimaryToggle;
