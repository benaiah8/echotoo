import { useState } from "react";
import ActivityImagesModal from "../../components/modal/ActivityImagesModal";

function ExperienceActivityImagesSection() {
  const [modal, setModal] = useState(false);
  let image =
    "https://plus.unsplash.com/premium_photo-1677000666741-17c3c57139a2?w=600";
  return (
    <div className="w-full pb-4 pt-4 px-4 rounded-lg bg-background200 flex flex-col mt-4">
      <ActivityImagesModal isOpen={modal} onClose={() => setModal(false)} />
      <div
        className="w-full flex flex-row gap-2 overflow-hidden relative cursor-pointer"
        onClick={() => setModal(true)}
      >
        {[...Array(10)].map((_, index) => (
          <div key={index} className="w-20 h-20 shrink-0">
            <img
              src={image}
              alt=""
              className="w-20 h-20 rounded-md shrink-0 object-cover"
            />
          </div>
        ))}
        <div className="absolute right-0 h-full w-20 bg-gradient-to-r from-transparent to-background200"></div>
      </div>
    </div>
  );
}

export default ExperienceActivityImagesSection;
