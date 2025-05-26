import React from "react";
import HomeHangoutSection from "./HomeHangoutSection";
import Post from "../../components/Post";

interface Props {
  viewMode: "all" | "hangouts" | "experiences";
}

const INJECT_EVERY = 4;

export default function HomePostsSection({ viewMode }: Props) {
  // TODO: replace with your real data array
  const experiences = Array.from({ length: 12 }, (_, i) => ({ id: i }));

  return (
    <div className="flex flex-col w-full gap-4 mt-4 ">
      {experiences.map((exp, idx) => (
        <React.Fragment key={exp.id}>
          <Post />

          {/* inject Hangouts every N posts when in "all" mode */}
          {viewMode === "all" && (idx + 1) % INJECT_EVERY === 0 && (
            <>
              <div className="text-white font-medium  ">
                Happening Near You Right Now
              </div>
              <HomeHangoutSection />
            </>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
