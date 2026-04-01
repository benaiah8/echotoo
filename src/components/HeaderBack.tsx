import { PiArrowLeft } from "react-icons/pi";
import { useNavigate } from "react-router-dom";

function HeaderBack() {
  const navigate = useNavigate();
  return (
    <div className="w-full bg-[var(--surface)] px-4 backdrop-blur-md py-1 flex items-center justify-between sticky top-0 z-40 safe-area-inset-top">
      <button
        onClick={() => {
          navigate(-1);
        }}
      >
        <span className="text-lg">
          {" "}
          <PiArrowLeft />{" "}
        </span>
      </button>
    </div>
  );
}

export default HeaderBack;
