import { useEffect, useState } from "react";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import { getPublicFeed, type FeedItem } from "../api/queries/getPublicFeed";

export default function FeedTestPage() {
  const [items, setItems] = useState<FeedItemExtended[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  type FeedItemExtended = FeedItem & {
    activities?: any[] | null;
    activities_count?: { count: number }[] | null;
    author?: { display_name?: string | null; username?: string | null } | null;
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getPublicFeed({ limit: 20 });
        setItems(data as unknown as FeedItemExtended[]);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load feed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PrimaryPageContainer back>
      <div className="max-w-[680px] mx-auto px-4 pt-6">
        <h2 className="text-[var(--text)] text-lg font-semibold mb-4">
          Feed (Test)
        </h2>

        {loading && <div className="text-[var(--text)]/70">Loading…</div>}
        {err && <div className="text-red-400 text-sm">{err}</div>}

        <div className="space-y-4">
          {items.map((p) => {
            const first = (p.activities && p.activities[0]) || null;
            const count =
              (p.activities_count && p.activities_count[0]?.count) ?? 0;
            return (
              <div key={p.id} className="rounded-xl border border-white/10 p-4">
                <div className="text-xs text-[var(--text)]/60">
                  {new Date(p.created_at).toLocaleString()}
                </div>
                <div className="text-[var(--text)] font-semibold mt-1">
                  {p.caption || "(no caption)"}
                </div>
                {p.author && (
                  <div className="text-[var(--text)]/80 text-sm mt-1">
                    by {p.author.display_name || p.author.username || "Unknown"}
                  </div>
                )}
                {first && (
                  <div className="text-[var(--text)]/80 text-sm mt-2">
                    First activity:{" "}
                    <span className="font-medium">
                      {first.title || "(untitled)"}
                    </span>
                  </div>
                )}
                <div className="text-[var(--text)]/60 text-xs mt-1">
                  Activities: {count}
                </div>
              </div>
            );
          })}
          {!loading && !err && items.length === 0 && (
            <div className="text-[var(--text)]/70">No public posts yet.</div>
          )}
        </div>
      </div>
    </PrimaryPageContainer>
  );
}
