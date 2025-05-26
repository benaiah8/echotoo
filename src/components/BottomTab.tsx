import { BsPersonFill } from "react-icons/bs";
import { FaHome } from "react-icons/fa";
import { IoGameController, IoNotifications } from "react-icons/io5";
import { RiAddBoxFill } from "react-icons/ri";
import { useNavigate } from "react-router-dom";
import { Paths } from "../router/Paths";
import AuthModal from "./modal/AuthModal";
import { useDispatch } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";

function BottomTab() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const menu = [
    {
      icon: <FaHome />,
      onClick: () => {
        navigate(Paths.home);
      },
    },
    {
      icon: <IoGameController />,
      onClick: () => {
        dispatch(setAuthModal(true));
      },
    },
    {
      icon: <RiAddBoxFill />,
      onClick: () => {
        navigate(Paths.create);
      },
    },
    {
      icon: <IoNotifications />,
      onClick: () => {
        navigate(Paths.notification);
      },
    },
    {
      icon: <BsPersonFill />,
      onClick: () => {
        navigate(Paths.profile);
      },
    },
  ];

  return (
    <div className="w-full flex items-center justify-center py-1 sticky bottom-0">
      <AuthModal />
      <div className="flex-1 px-4 py-1 rounded-xl flex items-center justify-between bg-background backdrop-blur-md">
        {menu.map((item, index) => (
          <button
            key={index}
            className="flex items-center px-2 py-2 text-white text-xl"
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
