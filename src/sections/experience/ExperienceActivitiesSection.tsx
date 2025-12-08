import React from "react";

type Activity = {
  title: string | null;
  images: string[] | null; // media is shown in HERO to avoid duplication
  order_idx: number | null;
  location_name?: string | null;
  location_desc?: string | null;
};

function ActivityRow({ a, i }: { a: Activity; i: number }) {
  return (
    <li className="relative">
      {/* vertical line aligned to the page’s left edge (same as caption/meta) */}
      <div
        className="absolute left-0 top-0 bottom-0 w-px bg-white/12"
        aria-hidden
      />

      {/* dot for this activity */}
      <span className="absolute left-0 top-4 -translate-x-1/2 w-2 h-2 rounded-full bg-white/60 block" />

      {/* content: give a small left gutter so text doesn’t collide with the line */}
      <div className="pl-6 pr-4">
        {/* separator between items (skip first) */}
        {i > 0 && <div className="border-t border-white/12 mb-3" />}

        {/* header row */}
        <div className="flex items-baseline">
          <h3 className="text-sm font-semibold">
            {a.title || `Activity ${i + 1}`}
          </h3>
        </div>

        {/* location (compact) */}
        {(a.location_name || a.location_desc) && (
          <div className="mt-2">
            {a.location_name && (
              <div className="text-xs font-medium">{a.location_name}</div>
            )}
            {a.location_desc && (
              <div className="text-xs text-[var(--text)]/70 leading-snug mt-1">
                {a.location_desc}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default function ExperienceActivitiesSection({
  activities,
}: {
  activities: Activity[];
}) {
  if (!activities || activities.length === 0) return null;

  return (
    <section className="w-full pt-4 pb-28">
      {/* clear section break from caption/meta */}
      <div className="border-t border-white/12 mb-3" />
      <div className="text-sm font-semibold mb-2 px-0">Activities</div>

      {/* full-width thread; line starts at exact left edge */}
      <div className="relative">
        <div
          className="absolute left-0 top-0 bottom-0 w-px bg-white/12"
          aria-hidden
        />
        <ol className="space-y-6">
          {activities.map((a, i) => (
            <ActivityRow key={i} a={a} i={i} />
          ))}
        </ol>
      </div>
    </section>
  );
}
