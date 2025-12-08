// PERF: Optimized image upload section (always visible, phone-friendly)
import { useRef, useState } from "react";
import { MdAdd } from "react-icons/md";
import { ActivityType } from "../../types/post";
import { uploadToCloudinary } from "../../api/services/cloudinaryUpload";
import { imgUrlPublic } from "../../lib/img";

interface CreateActivityImagesSectionProps {
  activity: ActivityType;
  handleChange: (field: string, value: any) => void;
}

export default function CreateActivityImagesSection({
  activity,
  handleChange,
}: CreateActivityImagesSectionProps) {
  const [isUploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openLibrary = () => fileInputRef.current?.click();

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || !files.length) return;

    const toUpload = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (!toUpload.length) return;

    try {
      setUploading(true);
      setProgressText(`Uploading ${toUpload.length} image(s)…`);

      const uploaded: string[] = [];
      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i];
        setProgressText(`Uploading ${i + 1} / ${toUpload.length}…`);
        const url = await uploadToCloudinary(file);
        uploaded.push(url);
      }

      const current = Array.isArray(activity?.images) ? activity.images : [];
      const next = Array.from(new Set([...uploaded, ...current]));
      handleChange("images", next);
    } catch (e) {
      console.error("Image upload failed", e);
      alert(
        e instanceof Error
          ? e.message
          : "Image upload failed. Please try again."
      );
    } finally {
      setUploading(false);
      setProgressText(null);
      if (event.target) event.target.value = "";
    }
  };

  const removeAt = (index: number) => {
    const arr = Array.isArray(activity?.images) ? activity.images : [];
    const next = arr.filter((_, i) => i !== index);
    handleChange("images", next);
  };

  return (
    <section className="w-full mt-3">
      {/* Soft container that matches the other inputs (grayish bg + thin border) */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3 flex flex-col gap-3">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageUpload}
        />

        {/* Controls row */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openLibrary}
            disabled={isUploading}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md
                       bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] border border-[var(--border)]
                       text-xs font-semibold hover:opacity-90 active:scale-[0.99]
                       disabled:opacity-60 transition shadow-sm"
            aria-label="Add images"
            title="Add images"
          >
            <MdAdd /> Add Images
          </button>

          {isUploading && (
            <span className="text-xs text-[var(--text)]/80">
              {progressText}
            </span>
          )}
        </div>

        {/* Thumbnails grid (responsive, touch-friendly) */}
        <div className="grid grid-cols-3 gap-2">
          {(activity?.images || []).map((src: string, i: number) => (
            <div
              key={`${i}-${src.slice(0, 24)}`}
              className="relative w-full aspect-square rounded-md overflow-hidden bg-[var(--surface)]/40"
            >
              <img
                src={imgUrlPublic(src) || src}
                className="w-full h-full object-cover"
                alt=""
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full
                           bg-[var(--surface)]/80 text-[var(--text)]
                           text-xs leading-none hover:opacity-90"
                aria-label="Remove image"
                title="Remove image"
              >
                ×
              </button>
            </div>
          ))}

          {/* Empty state */}
          {!activity?.images?.length && (
            <div className="col-span-3 text-xs text-[var(--text)]/60">
              No images yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
