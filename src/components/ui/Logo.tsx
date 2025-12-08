import React from "react";

// Import the Echotoo logo directly
import echo2logoUrl from "../../assets/echo2logo.svg";

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
        border: "1px solid var(--border-contrast)", // Use high contrast border for light/dark mode
        display: "grid",
        placeItems: "center",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <img
        src={echo2logoUrl}
        alt={alt}
        style={{
          width: Math.round(size * 0.85), // 85% of container size to leave space for border
          height: Math.round(size * 0.85),
          objectFit: "contain",
          pointerEvents: "none",
        }}
        draggable={false}
      />
    </div>
  );
}
