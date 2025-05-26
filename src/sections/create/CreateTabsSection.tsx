import React from "react";
import { IoArrowBack, IoArrowForward } from "react-icons/io5";
import { useNavigate } from "react-router-dom";

interface CreateTabsSectionProps {
  step: number; // current step: 1..paths.length
  paths: string[]; // URLs for each step
  onNext?: () => void; // optional validation+navigation override
  onPost?: () => void; // call this on final step instead of navigate
}

export default function CreateTabsSection({
  step,
  paths,
  onNext,
  onPost,
}: CreateTabsSectionProps) {
  const navigate = useNavigate();
  const total = paths.length;

  const handlePrev = () => navigate(paths[step - 2]);
  const handleNext = () => {
    if (step === total) {
      onPost?.();
    } else if (onNext) {
      onNext();
    } else {
      navigate(paths[step]);
    }
  };

  return (
    <div className="sticky bottom-[48px] bg-black w-full flex items-center justify-between px-4 py-2">
      {/* Prev */}
      {step > 1 ? (
        <button
          className="flex items-center gap-1 text-white"
          onClick={handlePrev}
        >
          <IoArrowBack /> <small>Prev</small>
        </button>
      ) : (
        <div className="w-20" />
      )}

      {/* Dots */}
      <div className="flex gap-2">
        {paths.map((_, idx) => (
          <button
            key={idx}
            onClick={() => navigate(paths[idx])}
            className="focus:outline-none"
          >
            <div
              className={`w-4 h-1 rounded-full ${
                idx + 1 === step ? "bg-white" : "bg-white/20"
              }`}
            />
          </button>
        ))}
      </div>

      {/* Next / Post */}
      <button
        className="flex items-center gap-1 text-white"
        onClick={handleNext}
      >
        <small>{step === total ? "Post" : "Next"}</small> <IoArrowForward />
      </button>
    </div>
  );
}
