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
      className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
        value ? "bg-white/90" : "bg-white/20"
      }`}
    >
      <div
        className={`w-4 h-4 bg-black rounded-full shadow-md transform transition-transform ${
          value ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </div>
  );
};

export default PrimaryToggle;
