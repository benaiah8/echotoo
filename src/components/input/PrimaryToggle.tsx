// components/input/PrimaryToggle.tsx
import React from "react";

interface PrimaryToggleProps {
  value: boolean;
  onChange: (val: boolean) => void;
}

const PrimaryToggle: React.FC<PrimaryToggleProps> = ({ value, onChange }) => {
  return (
    <div
      onClick={() => onChange(!value)}
      className="w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors"
      style={{
        backgroundColor: value ? "var(--toggle-bg-active)" : "var(--toggle-bg)",
      }}
    >
      <div
        className="w-4 h-4 rounded-full shadow-md transform transition-transform"
        style={{
          backgroundColor: "var(--toggle-thumb)",
          transform: value ? "translateX(16px)" : "translateX(0px)",
        }}
      />
    </div>
  );
};

export default PrimaryToggle;
