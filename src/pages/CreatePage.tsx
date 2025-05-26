// src/pages/CreatePage.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import { Paths } from "../router/Paths";

export default function CreatePage() {
  const navigate = useNavigate();
  const options = [
    { label: "Hang out", type: "hangout" },
    { label: "Journey",  type: "journey"  },
  ];

  return (
    <PrimaryPageContainer>
      <div className="flex flex-1 flex-col items-center justify-center h-[100vh] px-4">
        <h3 className="font-normal text-center max-w-[70%]">
          What are we going to create today?
        </h3>
        <div className="bg-image rounded-full h-14 w-14 mt-3 mb-10" />

        <div className="flex w-full max-w-[60%] flex-col gap-3">
          {options.map(({ label, type }) => (
            <button
              key={type}
              className="w-full py-2 px-4 h-20 bg-background rounded-md text-lg"
              onClick={() => navigate(`${Paths.createTitle}?type=${type}`)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </PrimaryPageContainer>
  );
}
