import { useLocation, useNavigate } from "react-router-dom";
import { URLdecode, URLencode } from "../../helpers/urlHelper";

function ProfileHeroSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = URLdecode();
  const stats = [
    {
      label: "Exp point",
      stat: 132,
    },
    {
      label: "flocks",
      stat: 120,
    },
    {
      label: "flocked",
      stat: 80,
    },
  ];

  const options = [
    {
      label: "Owl created",
      selected: Boolean(!params?.tab || params?.tab === "create"),
      action: () =>
        navigate(
          `${location.pathname}?${URLencode({ ...params, tab: "create" })}`
        ),
    },
    {
      label: "Owl interacted",
      selected: Boolean(params?.tab === "interacted"),
      action: () =>
        navigate(
          `${location.pathname}?${URLencode({ ...params, tab: "interacted" })}`
        ),
    },
    {
      label: "Owl saved",
      selected: Boolean(params?.tab === "saved"),
      action: () =>
        navigate(
          `${location.pathname}?${URLencode({ ...params, tab: "saved" })}`
        ),
    },
  ];

  return (
    <div className="w-full flex flex-col items-center pt-3 pb-2">
      <div className="w-16 h-16 rounded-full bg-image mb-2"></div>
      <span className="!text-sm font-bold">The batman</span>
      <small className="max-w-[80%] text-center font-medium mt-1 !text-xs">
        This is where The Title of The experience is This is where The Title of
        The experience is This is where The Title of The experience is{" "}
      </small>
      <div className="w-full justify-evenly flex mt-4">
        {stats.map((stat, statIndex) => (
          <div
            className="h-16 w-24 rounded-xl bg-background flex flex-col overflow-hidden"
            key={statIndex}
          >
            <div className="flex flex-1 items-center justify-center">
              <small className="!text-xs">{stat.label}</small>
            </div>
            <div className="flex flex-1 items-center justify-center rounded-xl bg-background200">
              <small className="!text-xs font-bold">{stat.stat}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="w-full flex rounded-full p-2 bg-background mt-4 items-center justify-center gap-2">
        {options?.map((option, optionIndex) => (
          <div
            key={optionIndex}
            className={`!text-[10px] py-1 px-4 rounded-full cursor-pointer ${
              option.selected
                ? "bg-primary text-black"
                : "bg-background200 text-white"
            }`}
            onClick={option.action}
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProfileHeroSection;
