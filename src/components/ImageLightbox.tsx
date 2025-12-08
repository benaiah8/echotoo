import React from "react";

export default function ImageLightbox({
  src,
  alt = "",
  open,
  onClose,
}: {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-[var(--surface)]/80"
        onClick={onClose}
      />
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 m-auto max-w-[95vw] max-h-[90vh] rounded-xl shadow-xl"
      />
      <button
        className="absolute top-3 right-3 text-sm px-3 py-1 rounded-lg bg-white/90 text-black"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}
