import { FaCommentDots, FaGlassCheers } from "react-icons/fa";
import { MdBookmark, MdFavorite, MdLocationOn, MdShare } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { Paths } from "../router/Paths";

export default function Post() {
  const navigate = useNavigate();

  // These two tags: date and location count
  const tags = [
    { label: "Today" },
    { label: "2", icon: <MdLocationOn size={12} /> },
  ];

  return (
    <div className="w-full max-w-sm mx-auto rounded-xl bg-background overflow-hidden flex flex-col">
      {/* Image Header */}
      <div
        className="relative h-56 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://plus.unsplash.com/premium_photo-1677000666741-17c3c57139a2?w=600')",
        }}
      >
        <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-4">
          <div
            className="flex-1 cursor-pointer"
            onClick={() => navigate(Paths.experience)}
          />
          <div className="flex items-center gap-2">
            {/* Profile image */}
            <img
              src="https://via.placeholder.com/40"
              alt="Profile"
              className="w-10 h-10 rounded-full border-2 border-white object-cover"
            />

            {/* Username */}
            <button className="text-xs font-light bg-white text-black rounded-md px-2 py-1">
              @chrisH
            </button>

            {/* Date & location tags */}
            <div className="flex gap-1">
              {tags.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 bg-primary text-black text-[10px] font-medium rounded-md px-2 py-1"
                >
                  <span>{t.label}</span>
                  {t.icon}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between text-white">
        <div className="flex items-center gap-4">
          <MdFavorite size={18} />
          <MdShare size={18} />
          <FaCommentDots size={18} />
          <div className=" flex gap-4 flex-wrap">
            {[
              { label: "Follow", action: () => {} },
              // { label: "See remixes", action: () => {} },
            ].map((btn, idx) => (
              <button
                key={idx}
                onClick={btn.action}
                className="bg-background text-white text-[14px] font-light rounded-full py-1"
              >
                {btn.label}
              </button>
            ))}
          </div>
          {/* <button className="bg-white text-black text-xs font-medium rounded-md px-3 py-1">
            Remix
          </button> */}
        </div>
        <MdBookmark size={20} />
      </div>

      {/* Title & Description */}
      <div className="px-4 pb-4">
        <h3 className="text-white font-medium text-sm">
          Title of The experience
        </h3>
        <p className="mt-1 text-xs text-white/70 leading-tight">
          If you could live anywhere in the world, where would you pick?
        </p>

        {/* Follow & See Remixes */}
        <div className="mt-3 flex gap-4 flex-wrap">
          {[
            { label: "Follow", action: () => {} },
            // { label: "See remixes", action: () => {} },
          ].map((btn, idx) => (
            <button
              key={idx}
              onClick={btn.action}
              className="bg-background text-white text-xs font-medium rounded-full py-1"
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
