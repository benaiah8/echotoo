import { useNavigate } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import { Paths } from "../router/Paths";
import CreateTabsSection from "../sections/create/CreateTabsSection";

function CreatePage() {
  const navigate = useNavigate();
  const options = [
    {
      label: "Hang out",
      action: () => {
        navigate(Paths.createTitle);
      },
      className: "",
    },
    { label: "Journey", action: () => {}, className: "" },
  ];
  return (
    <PrimaryPageContainer>
      <div className="flex flex-1 flex-col items-center justify-center">
        <h3 className="!font-normal text-center max-w-[70%]">
          What are we going to create today ben
        </h3>
        <div className="bg-image rounded-full h-14 w-14 mt-3 mb-10"></div>
        <div className="flex w-full max-w-[60%] flex-col gap-3">
          {options.map((option, index) => (
            <button
              key={index}
              className={`w-full py-2 px-4 rounded-md h-20 bg-background text-lg ${option.className}`}
              onClick={option.action}
            >
              {option.label}
            </button>
          ))}
        </div>
        <CreateTabsSection step={1} className="" />
      </div>
    </PrimaryPageContainer>
  );
}

export default CreatePage;
