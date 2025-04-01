import { IoMdArrowRoundBack } from "react-icons/io";
import { useNavigate } from "react-router-dom";

function HeaderBack() {
  const navigate = useNavigate();
  return (
    <div className="w-full bg-black px-4 backdrop-blur-md py-1 flex items-center justify-between sticky top-0 z-40">
      <button
        onClick={() => {
          navigate(-1);
        }}
      >
        <span className="text-lg">
          {" "}
          <IoMdArrowRoundBack />{" "}
        </span>
      </button>
    </div>
  );
}

export default HeaderBack;
