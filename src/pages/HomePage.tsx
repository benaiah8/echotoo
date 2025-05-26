import React, { useState } from "react";
import useScrollDirection from "../hooks/useScrollDirection";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import HomeSearchSection from "../sections/home/HomeSearchSection";
import HomeCategorySection from "../sections/home/HomeCategorySection";
import HomeViewToggleSection from "../sections/home/HomeViewToggleSection";
import HomeHangoutSection from "../sections/home/HomeHangoutSection";
import HomePostsSection from "../sections/home/HomePostsSection";

export default function HomePage() {
  const scrollDir = useScrollDirection();
  const isHidden = scrollDir === "down";
  const [viewMode, setViewMode] = useState<"all" | "hangouts" | "experiences">(
    "all"
  );

  // tweak these if your actual header/footer heights differ
  const HEADER_HEIGHT = 148;
  const FOOTER_HEIGHT = 80;

  return (
    <PrimaryPageContainer hideUI={isHidden}>
      {/* FIXED HEADER */}
      <div
        className="fixed inset-x-0 top-0 z-30 transition-transform duration-300 ease-in-out"
        style={{
          transform: isHidden
            ? `translateY(-${HEADER_HEIGHT}px)`
            : "translateY(0)",
        }}
      >
        <div className="w-full max-w-sm mx-auto bg-black px-4 pt-3 pb-1">
          <HomeSearchSection />
          <HomeCategorySection />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ paddingTop: HEADER_HEIGHT, paddingBottom: FOOTER_HEIGHT }}>
        {/* STICKY TOGGLE */}
        <div className="sticky top-0 z-20 bg-black">
          <div className="w-full max-w-sm mx-auto px-4">
            <HomeViewToggleSection
              viewMode={viewMode}
              setViewMode={setViewMode}
            />
          </div>
        </div>

        {/* HANGOUTS ROW */}
        {viewMode !== "experiences" && (
          <div className="w-full max-w-sm mx-auto px-4 pt-3">
            <HomeHangoutSection />
          </div>
        )}

        {/* POSTS & INJECTIONS */}
        <div className="w-full max-w-sm mx-auto px-4 pt-3">
          <HomePostsSection viewMode={viewMode} />
        </div>
      </div>
    </PrimaryPageContainer>
  );
}
