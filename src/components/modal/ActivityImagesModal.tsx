import { MdArrowBack, MdArrowForward, MdClose } from "react-icons/md";
import Modal from "./Modal";
import { useRef } from "react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ActivityImagesModal = ({ isOpen, onClose }: LoginModalProps) => {
  const imagesRef = useRef<HTMLDivElement | null>(null);
  const images = [
    "https://plus.unsplash.com/premium_photo-1677000666741-17c3c57139a2?w=600",
    "https://images.unsplash.com/photo-1728044849256-ad00ec91e794?q=80&w=1974",
    "https://plus.unsplash.com/premium_photo-1681841594224-ad729a249113?w=600",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600",
    "https://images.unsplash.com/photo-1605926637512-c8b131444a4b?w=600",
  ];

  const nextImage = () => {
    const container = imagesRef.current;
    if (container) {
      const width = container.clientWidth;
      container.scrollBy({ left: width, behavior: "smooth" });
    }
  };

  const prevImage = () => {
    const container = imagesRef.current;
    if (container) {
      const width = container.clientWidth;
      container.scrollBy({ left: -width, behavior: "smooth" });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      modalType="center"
      centerModalOverrideClassname="!bg-black/20"
    >
      <div className="flex flex-col h-screen w-full overflow-scroll scroll-hide relative p-4 px-2">
        <div className="w-full flex justify-end text-white mb-2">
          <button className="" onClick={() => onClose()}>
            {" "}
            <MdClose />{" "}
          </button>
        </div>
        <div
          ref={imagesRef}
          className="flex flex-1 items-center justify-center overflow-hidden"
        >
          {images.map((image, imageIndex) => (
            <div
              key={imageIndex}
              className="w-full h-full flex items-center justify-center shrink-0"
            >
              <img
                src={image}
                alt=""
                className="w-full h-full object-contain"
              />
            </div>
          ))}
        </div>
        <div className="w-full flex items-center justify-between mb-6">
          <button
            onClick={prevImage}
            className=" bg-black text-white p-2 rounded-full z-10"
          >
            <MdArrowBack size={24} />
          </button>
          <button
            onClick={nextImage}
            className=" bg-black text-white p-2 rounded-full z-10"
          >
            <MdArrowForward size={24} />
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ActivityImagesModal;
