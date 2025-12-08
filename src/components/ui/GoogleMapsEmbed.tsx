// src/components/ui/GoogleMapsEmbed.tsx
import React, { useState } from "react";

interface GoogleMapsEmbedProps {
  url: string;
  className?: string;
}

export default function GoogleMapsEmbed({
  url,
  className = "",
}: GoogleMapsEmbedProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if URL is an iframe embed URL
  const isIframeEmbed = (url: string) => {
    return url.includes("<iframe") && url.includes("src=");
  };

  // Extract iframe src from embed code
  const extractIframeSrc = (embedCode: string) => {
    const srcMatch = embedCode.match(/src="([^"]+)"/);
    return srcMatch ? srcMatch[1] : null;
  };

  // Check if URL is a share link (goo.gl, maps.app, etc.)
  const isShareLink = (url: string) => {
    return (
      url.includes("goo.gl") ||
      url.includes("maps.app") ||
      (url.includes("maps.google.com") && !url.includes("embed"))
    );
  };

  const handleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleOpenInMaps = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // If it's a share link, show a simple button
  if (isShareLink(url)) {
    return (
      <div className={`w-full ${className}`}>
        <button
          onClick={handleOpenInMaps}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-2 text-left hover:bg-[var(--surface)]/50 transition-all duration-300 ease-out"
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded-sm flex items-center justify-center">
              <span className="text-white text-xs font-bold">G</span>
            </div>
            <span className="text-xs text-[var(--text)]/85">View Location</span>
            <div className="ml-auto">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                className="text-[var(--text)]/60"
              >
                <path
                  d="M9 18L15 12L9 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </button>
      </div>
    );
  }

  // If it's an iframe embed, show expandable map
  const iframeSrc = isIframeEmbed(url) ? extractIframeSrc(url) : url;

  return (
    <div className={`w-full ${className}`}>
      {/* Collapsed state - pill button */}
      {!isExpanded && (
        <button
          onClick={handleExpand}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-2 text-left hover:bg-[var(--surface)]/50 transition-all duration-300 ease-out"
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded-sm flex items-center justify-center">
              <span className="text-white text-xs font-bold">G</span>
            </div>
            <span className="text-xs text-[var(--text)]/85">View Map</span>
            <div className="ml-auto">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                className="text-[var(--text)]/60 transition-transform duration-300 ease-out"
              >
                <path
                  d="M9 18L15 12L9 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </button>
      )}

      {/* Expanded state - iframe with smooth animation */}
      <div
        className={`overflow-hidden transition-all duration-500 ease-out ${
          isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30">
          <div className="p-2 flex items-center justify-between bg-[var(--surface)]/50">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded-sm flex items-center justify-center">
                <span className="text-white text-xs font-bold">G</span>
              </div>
              <span className="text-xs text-[var(--text)]/85">Google Maps</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenInMaps}
                className="text-xs text-[var(--text)]/70 hover:text-[var(--text)] px-2 py-1 rounded hover:bg-[var(--surface)]/30 transition-colors"
              >
                Open
              </button>
              <button
                onClick={handleExpand}
                className="text-xs text-[var(--text)]/70 hover:text-[var(--text)] px-2 py-1 rounded hover:bg-[var(--surface)]/30 transition-colors"
              >
                Collapse
              </button>
            </div>
          </div>
          <div className="relative w-full h-48">
            <iframe
              src={iframeSrc || ""}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Google Maps"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
