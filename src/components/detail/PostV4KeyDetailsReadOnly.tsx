import { finalizeMetaSurfaceClass } from "../../lib/createFlowFinalizeMetaSurface";

const chipClass = `inline-flex max-w-full items-center rounded-[14px] px-2.5 py-1 text-[12px] font-medium leading-tight text-[var(--text)]/88 ${finalizeMetaSurfaceClass}`;

type Props = {
  values: string[];
};

/** Published post detail: value-only Key Detail chips (no V4KeyInfo marker). */
export default function PostV4KeyDetailsReadOnly({ values }: Props) {
  if (values.length === 0) return null;

  return (
    <div
      className="mt-3 flex w-full min-w-0 flex-wrap gap-1.5"
      aria-label="Key details"
    >
      {values.map((value, index) => (
        <span key={`${index}-${value}`} className={chipClass}>
          {value}
        </span>
      ))}
    </div>
  );
}
