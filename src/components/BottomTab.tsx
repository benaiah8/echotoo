import { BsPersonFill } from "react-icons/bs";
import { FaHome } from "react-icons/fa";
import { IoGameController } from "react-icons/io5";
import { RiAddBoxFill } from "react-icons/ri";
import { useNavigate } from "react-router-dom";
import { Paths } from "../router/Paths";

function BottomTab() {
  const navigate = useNavigate();
  const menu = [
    {
      icon: <FaHome />,
      onClick: () => {},
    },
    {
      icon: <IoGameController />,
      onClick: () => {},
    },
    {
      icon: <RiAddBoxFill />,
      onClick: () => {
        navigate(Paths.create);
      },
    },
    {
      icon: <RiAddBoxFill />,
      onClick: () => {},
    },
    {
      icon: <BsPersonFill />,
      onClick: () => {},
    },
  ];

  return (
    <div className="w-full flex items-center justify-center px-3 py-2 sticky bottom-0">
      <div className="flex-1 px-4 py-2 rounded-xl flex items-center justify-between bg-white/10 backdrop-blur-md">
        {menu.map((item, index) => (
          <button
            key={index}
            className="flex items-center px-2 py-2 text-white text-lg"
            onClick={item.onClick}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

export default BottomTab;
