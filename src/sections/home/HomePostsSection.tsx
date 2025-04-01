import { FaCommentDots, FaGlassCheers } from "react-icons/fa";
import {
  MdBookmark,
  MdChat,
  MdFavorite,
  MdLocationOn,
  MdMap,
  MdShare,
} from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { Paths } from "../../router/Paths";

function HomePostsSection() {
  const navigate = useNavigate();
  const items = [
    { label: "Today" },
    { label: "3-hrs" },
    { label: "2", icon: <MdLocationOn /> },
  ];

  const tags = [
    "Family",
    "Dinning",
    "Dinner",
    "Date",
    "Hangout",
    "Family",
    "Dinning",
  ];

  return (
    <div className="flex flex-col w-full gap-4 mt-6">
      {[...Array(10)].map((_, index) => (
        <div
          className="w-full rounded-xl bg-background flex flex-col overflow-hidden"
          key={index}
        >
          {/* <div className="h-56 rounded-xl" ></div> */}
          <div className="w-full relative h-56 rounded-xl overflow-hidden flex bg-[url('https://plus.unsplash.com/premium_photo-1677000666741-17c3c57139a2?w=600')] bg-cover bg-center">
            <div className="w-full h-full flex bg-black/40 px-4 py-2 flex-col">
              <div className="w-full justify-between items-center flex">
                <div className="flex gap-2">
                  {items.map((item, itemIndex) => (
                    <div
                      key={itemIndex}
                      className="flex items-center gap-1 bg-primary text-black py-1 px-2 rounded-md"
                    >
                      <small className="!text-[10px] !font-medium">
                        {item.label}
                      </small>
                      {item.icon && <div className="text-xs">{item.icon}</div>}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1 bg-primary text-black py-1 px-2 rounded-md w-fit">
                  <small className="!text-[10px] !font-medium">Category</small>
                  <div className="text-xs">
                    {" "}
                    <FaGlassCheers />{" "}
                  </div>
                </div>
              </div>
              <div
                className="flex flex-1"
                onClick={() => {
                  navigate(Paths.experience);
                }}
              ></div>
              <div className="flex w-full flex-col">
                <div className="w-full flex gap-2 justify-between">
                  <div className="flex items-center gap-2 ">
                    <div className="w-8 h-8 border border-primary rounded-full bg-image"></div>
                    <div className="flex flex-1 flex-col">
                      <small className="!text-xs font-medium ">
                        Chris Johnson (wise owl)
                      </small>
                      <small className="!text-xs font-light">@chrisH</small>
                    </div>
                  </div>
                  <div>
                    <div className="border-2 border-white w-8 h-8 rounded-md flex items-center justify-center">
                      <span className="text-primary">
                        {" "}
                        <MdMap />{" "}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="font-medium mt-2">
                  Title of The experience
                </span>
              </div>
            </div>
          </div>
          <div className="px-4 pt-2 pb-2">
            <div className="w-full flex items-center justify-between">
              <div className="flex gap-4 items-center text-white">
                <span>
                  <MdFavorite />
                </span>
                <span>
                  <MdShare />
                </span>
                <span>
                  <MdChat />
                </span>
                <button className="px-3 py-1 rounded-md bg-white text-black">
                  <div className="!text-xs font-medium">Remix</div>
                </button>
              </div>
              <span className="text-white">
                <MdBookmark />
              </span>
            </div>
            <div className="w-full flex gap-1 mt-3 flex-wrap mb-1">
              {tags.map((tag, index) => (
                <div
                  key={index}
                  className="text-xs bg-background200 text-white px-2 py-1 rounded-md"
                >
                  {tag}
                </div>
              ))}
            </div>
            <small className="text-sm !font-light">
              If you could live anywhere in the world, where would you pick? If
              you could live anywhere in the world, where would you pick?
            </small>
            <div className="mt-3 w-full gap-4 flex items-center">
              <div className="flex flex-1 flex-col">
                <button className="text-white">
                  <span>
                    <FaCommentDots />
                  </span>
                </button>
              </div>
              <button className="px-3 rounded-md py-1 bg-background200">
                <small className="text-white">See remixes</small>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default HomePostsSection;
