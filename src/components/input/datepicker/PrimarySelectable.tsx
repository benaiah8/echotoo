import { MdCheck } from "react-icons/md";

interface PrimarySelectableProps {
  selected?: boolean;
  label?: string;
  onSelect?: () => void;
  className?: string;
}

function PrimarySelectable({
  label = "",
  className = "",
  onSelect,
  selected = false,
}: PrimarySelectableProps) {
  return (
    <button
      onClick={() => onSelect?.()}
      className={`h-[53px] px-10 rounded-full flex items-center justify-center border ${
        selected
          ? "border-secondary bg-secondary"
          : "border-black bg-transparent"
      } ${className}`}
    >
      {selected ? (
        <div className="flex items-center gap-1">
          <span className="text-[var(--text)]">
            <MdCheck />
          </span>
          <span className="font-medium text-[var(--text)]">{label}</span>
        </div>
      ) : (
        <span className="font-medium">{label}</span>
      )}
    </button>
  );
}

export default PrimarySelectable;
