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
      className={`h-9 px-5 rounded-full flex items-center justify-center border ${
        selected ? "border-primary bg-primary" : "border-white bg-transparent"
      } ${className}`}
    >
      {selected ? (
        <div className="flex items-center gap-1">
          {/* <small className="text-black">
            <MdCheck />
          </small> */}
          <small className="font-medium text-black">{label}</small>
        </div>
      ) : (
        <small className="font-medium">{label}</small>
      )}
    </button>
  );
}

export default PrimarySelectable;
