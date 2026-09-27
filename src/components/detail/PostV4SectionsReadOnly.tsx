import PostCaptionText from "../PostCaptionText";

type Props = {
  bodies: string[];
};

/** Published post detail: V4 Section bodies in activity-array order (body-only). */
export default function PostV4SectionsReadOnly({ bodies }: Props) {
  if (bodies.length === 0) return null;

  return (
    <div className="mt-4 space-y-4">
      {bodies.map((body, index) => (
        <div
          key={index}
          className={
            index > 0
              ? "border-t border-[var(--border)]/50 pt-4 app-dark:border-white/10"
              : undefined
          }
        >
          <p className="whitespace-pre-wrap break-words text-[15px] leading-snug text-[var(--text)]/90">
            <PostCaptionText text={body} />
          </p>
        </div>
      ))}
    </div>
  );
}
