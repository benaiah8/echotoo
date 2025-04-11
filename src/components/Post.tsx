import { FaCommentDots, FaGlassCheers } from "react-icons/fa";
import {
  MdBookmark,
  MdFavorite,
  MdLocationOn,
  MdMap,
  MdShare,
} from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { Paths } from "../router/Paths";

function Post() {
  const navigate = useNavigate();
  const items = [
    { label: "Today" },
    // { label: "3-hrs" },
    { label: "2", icon: <MdLocationOn /> },
  ];

  return (
    <div className="w-full rounded-xl bg-background flex flex-col overflow-hidden">
      {/* <div className="h-56 rounded-xl" ></div> */}
      <div className="w-full relative h-56 rounded-xl overflow-hidden flex bg-[url('https://plus.unsplash.com/premium_photo-1677000666741-17c3c57139a2?w=600')] bg-cover bg-center">
        <div className="w-full h-full flex bg-black/40 px-4 py-2 flex-col">
          <div
            className="flex flex-1"
            onClick={() => {
              navigate(Paths.experience);
            }}
          ></div>
          <div className="flex w-full gap-2 flex-wrap">
            <small className="!text-xs font-light rounded-md px-2 py-1 text-black bg-white">
              @chrisH
            </small>
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
          </div>
        </div>
      </div>
      <div className="px-4 pt-2 pb-2">
        <div className="w-full flex items-center justify-between mb-2">
          <div className="flex gap-4 items-center text-white">
            <span>
              <MdFavorite />
            </span>
            <span>
              <MdShare />
            </span>
            <span>
              <FaCommentDots />
            </span>
            <button className="px-3 py-1 rounded-md bg-white text-black">
              <div className="!text-xs font-medium">Remix</div>
            </button>
          </div>
          <span className="text-white">
            <MdBookmark />
          </span>
        </div>

        <span className="font-medium mt-2 text-sm">
          Title of The experience
        </span>
        <p className="font-extralight text-xs leading-5 mt-1 opacity-70 whitespace-nowrap overflow-hidden w-full text-ellipsis">
          If you could live anywhere in the world, where would you pick? If you
          could live anywhere in the world, where would you pick?
        </p>
        <div className="mt-3 gap-2 flex items-center flex-wrap rounded-full p-2 bg-background200 w-fit">
          {[
            { label: "Follow", action: () => {} },
            { label: "See remixes", action: () => {} },
          ].map((item, itemIndex) => (
            <button
              key={itemIndex}
              className="px-6 py-1 rounded-full text-xs bg-background"
              onClick={item.action}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Post;
