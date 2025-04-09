import { IoArrowBack, IoArrowForward } from "react-icons/io5";
import { useNavigate } from "react-router-dom";

interface CreateTabsSectionProps {
  nextPath?: string;
  step: number;
  className?: string;
  onPost?: () => void;
}

function CreateTabsSection({
  nextPath = "",
  step,
  className = "sticky bottom-0",
  onPost,
}: CreateTabsSectionProps) {
  const navigate = useNavigate();
  return (
    <div
      className={`w-full flex items-center gap-2 mt-8 justify-between ${className}`}
    >
      <div className="flex flex-1">
        {step > 1 && (
          <button
            className="flex items-center gap-1 mr-4"
            onClick={() => navigate(-1)}
          >
            <span>
              <IoArrowBack />
            </span>
            <small>Prev</small>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-1 justify-center">
        {[...Array(4)].map((_, index) => (
          <div
            className={`w-4 h-1 rounded-full ${
              index + 1 === step ? "bg-white" : "bg-white/20"
            }`}
            key={index}
          ></div>
        ))}
      </div>
      <div className="flex flex-1 justify-end">
        {step > 1 && (
          <button
            className="flex items-center gap-1 ml-4"
            onClick={() => {
              if (step === 4) {
                onPost?.();
              } else {
                navigate(nextPath);
              }
            }}
          >
            <small>{step === 4 ? "Post" : "Next"}</small>
            <span>
              <IoArrowForward />{" "}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

export default CreateTabsSection;
