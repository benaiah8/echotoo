import { useEffect, useState } from "react";
import { getOwlLogoPath } from "../../lib/assets";

interface AnimatedLogoProps {
  onComplete?: () => void;
  duration?: number; // Animation duration in ms
}

export default function AnimatedLogo({
  onComplete,
  duration = 3000,
}: AnimatedLogoProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        onComplete?.();
      }, 300); // Faster fade out if page loads quickly
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  // Generate random stars for background
  const stars = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 0.5,
    delay: Math.random() * 2,
  }));

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg)]"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: "opacity 0.3s ease-out",
      }}
    >
      {/* Stars background */}
      <div className="absolute inset-0 overflow-hidden">
        {stars.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: 0.6,
              animation: `twinkle ${2 + Math.random() * 2}s ease-in-out infinite`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Main logo container - centered with gentle hover */}
      <div
        className="relative flex items-center justify-center"
        style={{
          animation: "gentleHover 3s ease-in-out infinite",
        }}
      >
        {/* Owl logo */}
        <img
          src={getOwlLogoPath()}
          alt="Echotoo"
          className="block"
          style={{
            width: "90px",
            height: "auto",
            filter: "drop-shadow(0 5px 15px rgba(255, 204, 0, 0.25))",
          }}
        />
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes gentleHover {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes twinkle {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

