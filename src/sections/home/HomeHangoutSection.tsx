import { type FeedItem } from "../../api/queries/getPublicFeed";
import Hangout from "../../components/Hangout";

/** Some feeds include extra fields; make them optional here */
type FeedItemExtended = FeedItem & {
  activities_count?: { count: number }[];
  author?: { display_name?: string | null; username?: string | null } | null;
  isOwner?: boolean;
  status?: "draft" | "published";
};

type Props = {
  items: any[]; // keep your existing item typing
  loading?: boolean; // <-- add this
  onDelete?: (postId: string) => void; // NEW: callback when hangout is deleted
};

export default function HomeHangoutSection({
  items = [],
  loading,
  onDelete,
}: Props) {
  // Skeleton while loading (horizontal cards)
  if (loading) {
    return (
      <div className="mt-2 -mx-3 px-3">
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scroll-hide">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0"
            >
              <div className="relative overflow-visible ui-card p-3 flex flex-col gap-2 mb-3">
                {/* bookmark badge: bottom-left (skeleton style) */}
                <div
                  className="absolute -bottom-3 -left-3 z-10 grid place-items-center h-8 w-8 rounded-full bg-[var(--surface)]/80 border border-[var(--border)] shadow-lg"
                  aria-hidden
                >
                  <div className="w-4 h-4 rounded bg-[var(--text)]/20 animate-pulse" />
                </div>

                {/* header (avatar + two lines) */}
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[var(--text)]/10 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <div className="h-3 w-24 rounded bg-[var(--text)]/10 animate-pulse mb-1" />
                  </div>
                  <div className="h-3 w-12 rounded bg-[var(--text)]/10 animate-pulse" />
                </div>

                {/* caption (3 lines to match clamp) */}
                <div className="mt-1 space-y-2">
                  <div className="h-4 w-[92%] rounded bg-[var(--text)]/10 animate-pulse" />
                  <div className="h-4 w-[78%] rounded bg-[var(--text)]/10 animate-pulse" />
                  <div className="h-4 w-[60%] rounded bg-[var(--text)]/10 animate-pulse" />
                </div>

                {/* footer row: RSVP component skeleton */}
                <div className="pt-1 flex items-center justify-end">
                  <div className="flex items-center">
                    {/* User avatars (overlapping circles) - Creator on right, others to left */}
                    <div className="flex items-center">
                      {[0, 1, 2].map((index) => (
                        <div
                          key={index}
                          className="relative"
                          style={{
                            zIndex: index + 1, // Creator (index 0) = z-index 1, middle (index 1) = z-index 2, rightmost (index 2) = z-index 3
                            marginLeft: index > 0 ? "-4px" : "0px", // Reduced overlap
                          }}
                        >
                          <div
                            className="w-6 h-6 rounded-full bg-[var(--text)]/10 border border-[var(--border)] animate-pulse"
                            style={{ width: "20px", height: "20px" }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* RSVP pill - same height as circles, overlapping, on top */}
                    <div
                      className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] animate-pulse"
                      style={{
                        marginLeft: "-4px", // Reduced overlap with the last circle
                        zIndex: 4, // Highest z-index so pill appears on top
                      }}
                    >
                      <div className="h-3 w-8 rounded bg-[var(--text)]/20 animate-pulse" />
                      <div className="h-3 w-6 rounded bg-[var(--text)]/20 animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const data = (items as FeedItemExtended[]) || [];

  return (
    <div className="overflow-x-auto scroll-hide py-2">
      <div className="flex gap-3 w-max rail-pad">
        {data.map((p) => {
          const locationsCount = p.activities_count?.[0]?.count ?? 0;
          // if you later want to show author:
          // const authorHandle = p.author?.display_name || p.author?.username || "Unknown";
          const authorHandle = p.is_anonymous
            ? p.anonymous_name || "Anonymous"
            : p.author?.display_name || p.author?.username || "Unknown";
          const avatarUrl = p.author?.avatar_url ?? null;

          return (
            <Hangout
              key={p.id}
              id={p.id}
              caption={p.caption || "Untitled hangout"}
              createdAt={p.created_at}
              authorHandle={authorHandle}
              avatarUrl={avatarUrl}
              authorId={p.author_id}
              isAnonymous={p.is_anonymous || false}
              capacity={20} // Default capacity
              isOwner={p.isOwner || false} // Pass isOwner prop
              onDelete={() => onDelete?.(p.id)} // Pass onDelete callback
              status={p.status || "published"} // Default to published if status not available
              selectedDates={p.selected_dates} // Pass selected dates for priority sorting
              type={p.type} // Pass post type for avatar indicator
            />
          );
        })}
      </div>
    </div>
  );
}
