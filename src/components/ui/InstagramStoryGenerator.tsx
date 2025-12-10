import { useRef, useEffect, useState } from "react";
import html2canvas from "html2canvas";
import toast from "react-hot-toast";
import { imgUrlPublic } from "../../lib/img";
import { getOwlLogoPath } from "../../lib/assets";

interface InstagramStoryGeneratorProps {
  caption: string;
  postImageUrl?: string | null;
  postId: string;
  postType: "experience" | "hangout";
  onImageGenerated?: (blob: Blob) => void;
  onClose?: () => void;

  creatorName?: string;
  creatorHandle?: string;
  creatorAvatarUrl?: string | null;
  activities?: string[];
}

const SITE_URL = import.meta.env.VITE_SITE_URL || "echotoo.com";

export default function InstagramStoryGenerator({
  caption,
  postImageUrl,
  postId,
  postType,
  onImageGenerated,
  onClose,
  creatorName,
  creatorHandle,
  creatorAvatarUrl,
  activities,
}: InstagramStoryGeneratorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const processedImageUrl = postImageUrl
    ? imgUrlPublic(postImageUrl) || postImageUrl
    : null;

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = getOwlLogoPath();
    img.onload = () => setLogoLoaded(true);
    img.onerror = () => {
      console.error("Failed to load owl icon");
      setLogoLoaded(true); // Still allow generation even if logo fails
    };
  }, []);

  const generateImage = async () => {
    if (!canvasRef.current) return;

    setIsGenerating(true);
    toast.loading("Creating your Instagram Story...", { id: "generating" });

    try {
      await new Promise((resolve) => setTimeout(resolve, 400));

      const canvas = await html2canvas(canvasRef.current, {
        useCORS: true,
        backgroundColor: "#05060A",
        logging: false,
        scale: 3,
      });

      canvas.toBlob(
        (blob) => {
          if (blob) {
            toast.success("Story image created!", { id: "generating" });
            onImageGenerated?.(blob);

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `echotoo-story-${postId}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            onClose?.();
          } else {
            toast.error("Failed to generate image", { id: "generating" });
          }
          setIsGenerating(false);
        },
        "image/jpeg",
        0.95
      );
    } catch (error) {
      console.error("Error generating image:", error);
      toast.error("Failed to generate image", { id: "generating" });
      setIsGenerating(false);
    }
  };

  // caption + sample creator
  const rawCaption = caption || "Check out this experience!";
  const truncated =
    rawCaption.length > 260 ? rawCaption.slice(0, 257) + "…" : rawCaption;

  const storyUrl = `${SITE_URL}/${postType}/${postId}`;
  const safeCreatorName = creatorName || "";
  const safeCreatorHandle = creatorHandle || "";
  const processedAvatarUrl = creatorAvatarUrl
    ? imgUrlPublic(creatorAvatarUrl) || creatorAvatarUrl
    : null;
  const hasAvatar = !!processedAvatarUrl;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
      <div className="relative w-full max-w-sm bg-[var(--bg)] rounded-2xl p-6 mx-auto border border-[var(--border)] shadow-2xl">
        <h2 className="text-xl font-bold mb-4 text-[var(--text)] text-center w-full">
          Create Instagram Story
        </h2>

        {/* Phone frame */}
        <div
          className="mb-4 rounded-xl overflow-hidden border-2 border-[var(--border)] bg-black"
          style={{
            aspectRatio: "9/16",
            width: "100%",
            position: "relative",
          }}
        >
          {/* Story canvas */}
          <div
            ref={canvasRef}
            className="relative w-full h-full"
            style={{ boxSizing: "border-box" }}
          >
            {/* BACKGROUND GRADIENT */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, #181a35 0%, #070717 40%, #020308 100%)",
              }}
            />

            {/* blurred image texture */}
            {processedImageUrl && (
              <div className="absolute inset-0 opacity-10 overflow-hidden">
                <img
                  src={processedImageUrl}
                  alt=""
                  crossOrigin="anonymous"
                  className="w-full h-full object-cover"
                  style={{
                    filter: "blur(4px) brightness(0.7) contrast(1.05)",
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            {/* yellow splashes */}
            <div
              className="pointer-events-none absolute"
              style={{
                top: "-20%",
                left: "50%",
                transform: "translateX(-50%)",
                width: "80%",
                height: "50%",
                background:
                  "radial-gradient(circle, rgba(255,204,0,0.28) 0%, transparent 70%)",
              }}
            />
            <div
              className="pointer-events-none absolute"
              style={{
                bottom: "-25%",
                right: "-10%",
                width: "60%",
                height: "50%",
                background:
                  "radial-gradient(circle at bottom right, rgba(255,204,0,0.22) 0%, transparent 70%)",
              }}
            />

            {/* radial / pattern mix */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 0%, rgba(255,204,0,0.16) 0, transparent 60%), radial-gradient(circle at 0% 80%, rgba(255,204,0,0.08) 0, transparent 65%), radial-gradient(circle at 100% 80%, rgba(255,204,0,0.08) 0, transparent 65%)",
                mixBlendMode: "soft-light",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
                opacity: 0.25,
                mixBlendMode: "soft-light",
              }}
            />

            {/* FOREGROUND COLUMN */}
            <div className="relative z-10 flex h-full w-full flex-col items-center justify-between px-[10%] py-[8%]">
              {/* top: owl standing on stacked caption card */}
              <div className="w-full flex justify-center">
                <div className="flex w-[80%] max-w-[340px] flex-col items-center gap-3">
                  {/* Owl, slightly overlapping the card so it feels like it's standing on it */}
                  <div className="mb-[-8px] flex justify-center w-full">
                    <img
                      src={getOwlLogoPath()}
                      alt="Owl"
                      className="block"
                      style={{
                        width: 72,
                        height: "auto",
                        display: "block",
                      }}
                    />
                  </div>

                  {/* stacked caption card */}
                  <div className="relative w-full">
                    {/* back card 1 */}
                    <div
                      className="absolute inset-0 translate-y-[26px] scale-[0.92] rounded-[20px]"
                      style={{
                        backgroundColor: "#d8b200",
                        border: "1px solid rgba(255,255,255,0.25)",
                        opacity: 0.85,
                      }}
                    />
                    {/* back card 2 */}
                    <div
                      className="absolute inset-0 translate-y-[13px] scale-[0.96] rounded-[20px]"
                      style={{
                        backgroundColor: "#f5c800",
                        border: "1px solid rgba(255,255,255,0.35)",
                        opacity: 0.95,
                      }}
                    />
                    {/* main card */}
                    <div
                      className="relative rounded-[20px] bg-[#FFCC00] text-[#14120A] shadow-[0_18px_40px_rgba(0,0,0,0.65)] px-5 py-4 text-center"
                      style={{ fontSize: 14, lineHeight: 1.4 }}
                    >
                      {/* profile row centered */}
                      <div className="mb-3 flex flex-col items-center gap-2">
                        {hasAvatar ? (
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: "999px",
                              overflow: "hidden",
                              border: "2px solid #000000",
                            }}
                          >
                            <img
                              src={processedAvatarUrl as string}
                              alt={safeCreatorHandle || "Creator"}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                                (
                                  e.target as HTMLImageElement
                                ).parentElement!.style.display = "none";
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: "999px",
                              backgroundColor: "rgba(20,18,10,0.16)",
                              border: "2px solid #000000",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 16,
                              fontWeight: 700,
                            }}
                          >
                            {safeCreatorHandle?.[0] ||
                              safeCreatorName?.[0] ||
                              "E"}
                          </div>
                        )}

                        {safeCreatorHandle ? (
                          <span className="text-[12px] font-bold leading-tight text-[#14120A]">
                            {safeCreatorHandle}
                          </span>
                        ) : safeCreatorName ? (
                          <span className="text-[12px] font-bold leading-tight text-[#14120A]">
                            {safeCreatorName}
                          </span>
                        ) : null}
                      </div>

                      {/* caption */}
                      <p className="text-[14px] font-semibold">{truncated}</p>

                      {/* optional activities pills */}
                      {activities && activities.length > 0 && (
                        <div className="mt-2 flex flex-wrap justify-center gap-1">
                          {activities.map((act) => (
                            <span
                              key={act}
                              className="rounded-full bg-[#F2B800] px-2 py-1 text-[10px] font-medium"
                            >
                              {act}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* bottom: Download + buttons + URL */}
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-[14px] font-semibold text-[#FFE9A8]">
                  Download Echotoo
                </p>

                <div className="flex gap-2">
                  <div className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-black shadow-[0_6px_16px_rgba(0,0,0,0.6)]">
                    App Store
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-black shadow-[0_6px_16px_rgba(0,0,0,0.6)]">
                    Play Store
                  </div>
                </div>

                <p className="mt-1 text-center text-[11px] text-[rgba(255,233,168,0.9)]">
                  {storyUrl}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl border-2 border-[var(--border)] bg-transparent text-[var(--text)] font-semibold hover:bg-[var(--surface-2)] transition text-sm"
          >
            Cancel
          </button>
          <button
            onClick={generateImage}
            disabled={isGenerating || !logoLoaded}
            className="px-6 py-2 rounded-xl bg-yellow-400 text-black font-bold hover:bg-yellow-500 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isGenerating ? "Creating..." : "Create Story"}
          </button>
        </div>
      </div>
    </div>
  );
}
