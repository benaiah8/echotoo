import React from "react";
import { getOwlLogoPath } from "../../lib/assets";

type LogoProps = {
  size?: number; // square px
  rounded?: number; // border radius px (default 12)
  className?: string;
  alt?: string;
  onClick?: () => void; // For future functionality
};

export default function Logo({
  size = 42, // Increased default size
  rounded = 8,
  className = "",
  alt = "Echotoo",
  onClick,
}: LogoProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        background: "transparent",
        display: "grid",
        placeItems: "center",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <img
        src={getOwlLogoPath()}
        alt={alt}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          pointerEvents: "none",
        }}
        draggable={false}
      />
    </div>
  );
}
