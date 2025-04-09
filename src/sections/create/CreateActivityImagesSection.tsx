import { MdAdd } from "react-icons/md";
import { ActivityType } from "../../types/post";
import { useRef, useState } from "react";
import Collapsible from "../../components/Collapsible";
import { IoIosArrowDown } from "react-icons/io";

interface CreateActivityImagesSectionProps {
  activity: ActivityType;
  handleChange: (field: string, value: any) => void;
}

function CreateActivityImagesSection({
  activity,
  handleChange,
}: CreateActivityImagesSectionProps) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const newImage = reader.result;
      handleChange("images", [newImage, ...(activity?.images || [])]);
    };
    reader.readAsDataURL(file);
  };

  const openLibrary = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-background w-full rounded-lg p-4 py-2 flex flex-col mt-3">
      <div
        className="w-full items-center justify-between flex cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <small className="">Add images</small>
        <IoIosArrowDown
          className={`transition-all ${open ? "rotate-180" : ""}`}
        />
      </div>

      <Collapsible open={open}>
        <div className="w-full py-2 flex gap-2 relative overflow-x-scroll scroll-hide">
          {/* Hidden file input */}
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            className="hidden"
            onChange={handleImageUpload}
          />

          {/* Add Image Button */}
          <div className="pr-2 sticky left-0 bg-background">
            <button
              className="w-20 h-20 shrink-0 rounded-md flex items-center justify-center text-white bg-background200 text-xl cursor-pointer"
              onClick={openLibrary}
            >
              <MdAdd />
            </button>
          </div>

          {/* Display selected images */}
          {activity?.images?.map((image: any, imageIndex: number) => (
            <div
              className="w-20 h-20 shrink-0 rounded-md overflow-hidden bg-background200"
              key={imageIndex}
            >
              <img
                src={image}
                alt={`image-${imageIndex}`}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

export default CreateActivityImagesSection;
