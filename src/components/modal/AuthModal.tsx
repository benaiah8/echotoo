import Modal from "./Modal";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { setAuthModal } from "../../reducers/modalReducer";
import LoginForm from "./Auth/LoginForm";
import SignupForm from "./Auth/SignupForm";
import useUserApi, { UserPayloadInterface } from "../../hooks/useUserApi";

const AuthModal = () => {
  const { registerUser } = useUserApi();
  const dispatch = useDispatch();
  const { authModal } = useSelector((state: RootState) => state.modal);
  const [tab, setTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UserPayloadInterface>({
    email: "test1@gmail.com",
    password: "password",
    repeatPassword: "password",
    username: "username1",
    fullName: "Full name",
  });

  const handleClose = () => {
    dispatch(setAuthModal(false));
  };

  const tabs = [
    {
      label: "Login",
      value: "login",
      action: () => {
        setTab("login");
      },
    },
    {
      label: "Sign up",
      value: "signup",
      action: () => {
        setTab("signup");
      },
    },
  ];

  const handleContinue = async () => {
    if (tab === "login") {
    } else {
      let paylaodData = data;
      delete paylaodData.repeatPassword;
      await registerUser({ setLoading, data: paylaodData });
    }
  };

  return (
    <Modal
      isOpen={authModal}
      onClose={handleClose}
      modalType="center"
      centerModalOverrideClassname="!bg-black/20"
    >
      <div className="flex flex-col w-full overflow-scroll scroll-hide relative p-4 px-2 bg-background rounded-xl">
        <div className="w-full flex items-center">
          {tabs?.map((tb, tbIndex) => {
            let selected = tb.value === tab;
            return (
              <button
                key={tbIndex}
                className={`flex flex-1 py-2 border-b-2 items-center justify-center ${
                  selected ? "border-primary" : "border-white"
                }`}
                onClick={tb.action}
              >
                <span
                  className={`text-xs font-medium text-center ${
                    selected ? "text-primary" : "text-white"
                  }`}
                >
                  {tb.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="w-full flex flex-col px-4 bg-background200 py-3 rounded-md mt-4">
          <div className="w-full my-4">
            {tab === "login" ? (
              <LoginForm data={data} setData={setData} />
            ) : (
              <SignupForm data={data} setData={setData} />
            )}
          </div>
          <button
            className="w-full py-2 rounded-md text-xs font-medium bg-primary text-black"
            onClick={() => handleContinue()}
          >
            {loading ? (
              <div className="buttonLoader"></div>
            ) : tab === "login" ? (
              "Login"
            ) : (
              "Sign up"
            )}
          </button>
        </div>
        <div className="w-full mt-3 mb-2 gap-1 flex items-center">
          <div className="flex flex-1 border border-white/20"></div>
          <small className="!text-[10px] text-white">or</small>
          <div className="flex flex-1 border border-white/20"></div>
        </div>
        <button className="bg-white flex items-center justify-center py-2 w-full text-black rounded-full gap-2">
          <img
            src="/IconGoogle.svg"
            alt=""
            className="w-5 h-5 object-contain"
          />
          <span className="text-sm font-medium">Continue with Google</span>
        </button>
      </div>
    </Modal>
  );
};

export default AuthModal;
