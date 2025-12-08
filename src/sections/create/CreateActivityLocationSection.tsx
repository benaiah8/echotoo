// src/sections/create/CreateActivityLocationSection.tsx
import { useMemo, useState } from "react";
import PrimaryInput from "../../components/input/PrimaryInput";
import { ActivityType } from "../../types/post";
import { IoIosArrowDown } from "react-icons/io";

interface Props {
  activity: ActivityType;
  activityIndex: number; // kept for future use if needed
  handleChange: (field: string, value: any) => void;
}

export default function CreateActivityLocationSection({
  activity,
  handleChange,
}: Props) {
  const [showGoogleMaps, setShowGoogleMaps] = useState(false);

  // Get location notes and Google Maps URL
  const locationNotes = activity.locationNotes || "";
  const locationUrl = activity.locationUrl || "";

  const mapsUrl = useMemo(() => {
    const q = (activity.location || "").trim();
    const base = "https://www.google.com/maps/search/?api=1";
    return q
      ? `${base}&query=${encodeURIComponent(q)}`
      : "https://maps.google.com";
  }, [activity.location]);

  return (
    <section className="w-full mt-3">
      {/* Soft container that matches the activities input look */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3 flex flex-col gap-3">
        {/* 1) Manual address */}
        <PrimaryInput
          label="Address"
          placeholder="Enter address manually"
          value={activity.location || ""}
          onChange={(e) => handleChange("location", e.target.value)}
        />

        {/* 2) Details (parking/floor/room) */}
        <PrimaryInput
          label="Details"
          placeholder="Parking, floor, room, etc."
          value={locationNotes}
          onChange={(e) => handleChange("locationNotes", e.target.value)}
        />

        {/* 3) Google Maps flow - Collapsible */}
        <div className="flex flex-col gap-2">
          <div
            onClick={() => setShowGoogleMaps(!showGoogleMaps)}
            className="flex items-center justify-between w-full cursor-pointer"
          >
            <span className="text-sm text-[var(--text)]">
              Add from Google Maps
            </span>
            <IoIosArrowDown
              className={`transition-all ${showGoogleMaps ? "rotate-180" : ""}`}
            />
          </div>

          {showGoogleMaps && (
            <div className="flex flex-col gap-2">
              <div className="text-[var(--text)]/70 text-xs">
                Tap "Open Google Maps", search/select a place, then copy the
                <span className="font-semibold text-[var(--text)]">
                  {" "}
                  embed link
                </span>{" "}
                and paste it below.
                <br />
                <span className="text-[var(--text)]/60 text-[10px]">
                  💡 Tip: Choose "Embed a map" instead of "Share" for better
                  display in posts
                </span>
              </div>

              {/* Theme-aware button with proper light/dark mode colors */}
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-semibold
                           bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] hover:opacity-90 active:scale-[0.99] transition shadow-sm
                           border border-[var(--border)]"
              >
                Open Google Maps
              </a>

              <PrimaryInput
                label="Paste Google Maps embed link"
                placeholder="Paste Google Maps embed link here (preferred) or share link"
                value={locationUrl}
                onChange={(e) => handleChange("locationUrl", e.target.value)}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
