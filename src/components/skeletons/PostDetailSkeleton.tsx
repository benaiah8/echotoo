export default function PostDetailSkeleton() {
  return (
    <>
      {/* Sticky interaction bar */}
      <div className="fixed top-0 left-0 right-0 z-30 bg-[var(--surface)]/80 backdrop-blur-md border-b border-[var(--border)] px-3 py-3">
        <div className="flex items-center justify-between max-w-[640px] mx-auto">
          <div className="flex items-center gap-6">
            <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
            <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
            <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
            <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
            <div className="h-8 w-24 rounded-full bg-[var(--text)]/10 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Hero carousel skeleton - always show for consistency */}
      <div className="w-full page-content-wide pt-20 mb-2">
        <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="w-full aspect-video bg-[var(--text)]/10 animate-pulse" />
        </div>
      </div>

      {/* Main column */}
      <div className="w-full page-content-wide pt-4">
        {/* Author row */}
        <div className="mt-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--text)]/10 animate-pulse" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-32 rounded bg-[var(--text)]/10 animate-pulse mb-1" />
            <div className="h-3 w-48 rounded bg-[var(--text)]/10 animate-pulse" />
          </div>
          <div className="h-6 w-6 rounded bg-[var(--text)]/10 animate-pulse" />
        </div>

        {/* Caption */}
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full rounded bg-[var(--text)]/10 animate-pulse" />
          <div className="h-4 w-4/5 rounded bg-[var(--text)]/10 animate-pulse" />
          <div className="h-4 w-3/5 rounded bg-[var(--text)]/10 animate-pulse" />
        </div>

        {/* Tags */}
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-6 w-16 rounded-full bg-[var(--text)]/10 animate-pulse"
            />
          ))}
        </div>

        {/* Schedule section */}
        <div className="mt-3">
          <div className="h-3 w-20 rounded bg-[var(--text)]/10 animate-pulse mb-2" />
          <div className="flex flex-wrap gap-2">
            <div className="h-6 w-20 rounded-full bg-[var(--text)]/10 animate-pulse" />
            <div className="h-6 w-20 rounded-full bg-[var(--text)]/10 animate-pulse" />
            <div className="h-6 w-24 rounded-full bg-[var(--text)]/10 animate-pulse" />
          </div>
        </div>

        {/* RSVP section */}
        <div className="mt-3">
          <div className="h-8 w-32 rounded-full bg-[var(--text)]/10 animate-pulse" />
        </div>

        {/* Divider */}
        <div className="mt-4 border-t border-[var(--border)]" />

        {/* Activities section */}
        <div className="mt-3">
          <div className="h-4 w-20 rounded bg-[var(--text)]/10 animate-pulse mb-4" />
          <div className="relative">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-white/12" />
            <div className="space-y-6 pl-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="relative">
                  <div className="absolute left-2 top-3 -translate-x-1/2 w-2 h-2 rounded-full bg-white/70" />
                  <div className="space-y-2">
                    <div className="h-4 w-32 rounded bg-[var(--text)]/10 animate-pulse" />
                    <div className="h-4 w-full rounded bg-[var(--text)]/10 animate-pulse" />
                    <div className="h-4 w-3/4 rounded bg-[var(--text)]/10 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Comments section */}
      <div className="mt-6 border-t border-[var(--border)] pt-4">
        <div className="space-y-4">
          <div className="h-4 w-32 rounded bg-[var(--text)]/10 animate-pulse" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--text)]/10 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-full rounded bg-[var(--text)]/10 animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-[var(--text)]/10 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
