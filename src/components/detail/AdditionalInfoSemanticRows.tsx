import {
  additionalInfoIconWrapClasses,
  additionalInfoToneRowClasses,
  getAdditionalInfoDisplayLabel,
  resolveAdditionalInfoEntry,
  type AdditionalInfoTone,
} from "../../lib/activityAdditionalInfoRegistry";
import { PiDotsThree } from "react-icons/pi";

type Row = { title: string; value: string };

export function AdditionalInfoSemanticRows({ items }: { items: Row[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((x, k) => {
        const meta = resolveAdditionalInfoEntry(x.title);
        const tone: AdditionalInfoTone = meta?.tone ?? "neutral";
        const Icon = meta?.Icon ?? PiDotsThree;
        const label = getAdditionalInfoDisplayLabel(x.title);
        return (
          <div
            key={`${x.title}-${k}`}
            className={[
              "flex gap-3 rounded-xl border px-3 py-2.5",
              additionalInfoToneRowClasses(tone),
            ].join(" ")}
          >
            <span
              className={[
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                additionalInfoIconWrapClasses(tone),
              ].join(" ")}
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text)]/70">
                {label}
              </div>
              <div className="mt-0.5 text-sm text-[var(--text)]/88 leading-snug whitespace-pre-wrap">
                {x.value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
