import type { ReactNode } from "react";

interface PolicyPageProps {
  title: string;
  intro: string;
  children?: ReactNode;
}

export default function PolicyPage({
  title,
  intro,
  children,
}: PolicyPageProps) {
  return (
    <article className="policy-page">
      <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text)] mb-4">
        {title}
      </h1>
      <p className="text-[var(--muted)] text-base leading-relaxed mb-8">
        {intro}
      </p>

      <div
        className="policy-content max-w-none
          [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:text-[var(--text)]
          [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mt-6 [&_h3]:mb-3 [&_h3]:text-[var(--text)]
          [&_p]:text-[var(--text)] [&_p]:leading-relaxed [&_p]:mb-4
          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:space-y-2 [&_ul]:text-[var(--text)]
          [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_ol]:space-y-2 [&_ol]:text-[var(--text)]
          [&_a]:text-[var(--brand)] [&_a]:underline [&_a]:underline-offset-2"
      >
        {children ?? (
          <p className="text-[var(--muted)] text-sm italic">
            Paste policy content here
          </p>
        )}
      </div>
    </article>
  );
}
