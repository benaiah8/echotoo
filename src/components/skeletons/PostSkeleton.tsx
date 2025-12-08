export default function PostSkeleton() {
  return (
    <article className="w-full border-t border-[var(--border)] px-0 py-3">
      <div className="flex gap-3">
        {/* avatar */}
        <div className="pt-1">
          <div className="w-10 h-10 rounded-full bg-[var(--text)]/10 animate-pulse" />
        </div>

        {/* right rail */}
        <div className="flex-1 min-w-0">
          {/* name/date row */}
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 rounded bg-[var(--text)]/10 animate-pulse" />
            <div className="h-3 w-16 rounded bg-[var(--text)]/5 animate-pulse" />
          </div>

          {/* caption */}
          <div className="mt-2 space-y-2">
            <div className="h-4 w-4/5 rounded bg-[var(--text)]/10 animate-pulse" />
            <div className="h-4 w-3/5 rounded bg-[var(--text)]/10 animate-pulse" />
          </div>

          {/* media box */}
          <div className="mt-3 rounded-2xl border border-[var(--border)] overflow-hidden">
            <div className="w-full" style={{ height: "44vh" }}>
              <div className="w-full h-full bg-[var(--text)]/5 animate-pulse" />
            </div>
          </div>

          {/* actions row */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-5 h-5 rounded bg-[var(--text)]/10 animate-pulse" />
              <div className="w-5 h-5 rounded bg-[var(--text)]/10 animate-pulse" />
              <div className="w-5 h-5 rounded bg-[var(--text)]/10 animate-pulse" />
            </div>
            {/* right side: save and follow buttons */}
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded bg-[var(--text)]/10 animate-pulse" />
              <div className="h-7 min-w-[92px] rounded-full bg-[var(--text)]/10 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
