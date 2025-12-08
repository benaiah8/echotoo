import { useEffect, useState } from "react";
import ActivityImagesModal from "../../components/modal/ActivityImagesModal";

/**
 * Cloudinary optimizer:
 * - If the URL is a Cloudinary image, injects f_auto,q_auto,w_400
 * - If not Cloudinary (e.g., Unsplash), returns the original URL
 */
const optimize = (src: string, w = 400) => {
  try {
    const u = new URL(src);
    if (!u.hostname.includes("res.cloudinary.com")) return src;
    u.pathname = u.pathname.replace(
      /\/upload\/(?!f_auto)/,
      `/upload/f_auto,q_auto,w_${w}/`
    );
    return u.toString();
  } catch {
    return src;
  }
};

// Small, friendly idle callback with fallback
const onIdle = (cb: () => void, timeout = 800) => {
  const anyWin = window as any;
  if (anyWin.requestIdleCallback) {
    anyWin.requestIdleCallback(cb, { timeout });
  } else {
    setTimeout(cb, timeout);
  }
};

function ExperienceActivityImagesSection() {
  const [modal, setModal] = useState(false);

  // Demo image (replace with your Cloudinary URLs when wiring real data)
  const image =
    "https://plus.unsplash.com/premium_photo-1677000666741-17c3c57139a2?w=1200";

  // Progressive reveal: start with 4 thumbnails, then expand after idle
  const TOTAL = 10;
  const [showCount, setShowCount] = useState(4);

  useEffect(() => {
    // After the browser is idle, reveal a few more…
    onIdle(() => setShowCount((c) => Math.min(TOTAL, Math.max(c, 8))), 600);
    // …and then the rest a bit later
    onIdle(() => setShowCount(TOTAL), 1200);
  }, []);

  return (
    <div className="w-full pb-4 pt-4 px-4 rounded-lg bg-[var(--surface-2)]200 flex flex-col mt-4">
      <ActivityImagesModal isOpen={modal} onClose={() => setModal(false)} />
      <div
        className="w-full flex flex-row gap-2 overflow-hidden relative cursor-pointer"
        onClick={() => setModal(true)}
      >
        {Array.from({ length: showCount }).map((_, index) => (
          <div key={index} className="w-20 h-20 shrink-0">
            <img
              src={optimize(image, 400)}
              alt=""
              className="w-20 h-20 rounded-md shrink-0 object-cover"
              loading="lazy"
              decoding="async"
              width={80}
              height={80}
              sizes="(max-width: 640px) 25vw, 80px"
            />
          </div>
        ))}
        <div className="absolute right-0 h-full w-20 bg-gradient-to-r from-transparent to-background200"></div>
      </div>
    </div>
  );
}

export default ExperienceActivityImagesSection;
