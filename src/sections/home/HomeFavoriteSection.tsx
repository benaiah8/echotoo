import { FaBookmark } from "react-icons/fa";

function HomeFavoriteSection() {
  return (
    <div className="w-full flex gap-3 scroll-hide overflow-scroll mt-3">
      {[...Array(10)].map((_, index) => (
        <button className="w-32 pb-2 relative" key={index}>
          <div className="w-32 h-32 rounded-xl bg-background"></div>
          <div className="absolute bottom-0 left-4">
            <span>
              <FaBookmark className="" />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

export default HomeFavoriteSection;
