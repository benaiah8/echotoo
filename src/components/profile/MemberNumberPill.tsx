import React from "react";

interface MemberNumberPillProps {
  memberNo: number;
}

export default function MemberNumberPill({ memberNo }: MemberNumberPillProps) {
  return (
    <div
      className="mx-auto mb-6 w-max px-4 py-2 rounded-full text-base font-medium"
      style={{
        background:
          "radial-gradient(120% 120% at 50% 50%, rgba(255,204,0,0.18), rgba(255,204,0,0.06))",
        boxShadow:
          "0 0 0 1px rgba(255,204,0,0.35) inset, 0 0 28px rgba(255,204,0,0.25)",
        color: "var(--text)",
      }}
    >
      #{Number(memberNo).toLocaleString()}
    </div>
  );
}

