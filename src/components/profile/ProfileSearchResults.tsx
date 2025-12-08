import { useEffect, useState, useRef } from "react";
import {
  searchProfiles,
  type ProfileSearchRow,
} from "../../api/queries/searchProfiles";
import Avatar from "../ui/Avatar";
import FollowButton from "../ui/FollowButton";
import { Link, useNavigate } from "react-router-dom";

export default function ProfileSearchResults({
  query,
  viewerId,
  onClose,
}: {
  query: string;
  viewerId?: string | null;
  onClose?: () => void;
}) {
  const [rows, setRows] = useState<ProfileSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const startY = useRef<number | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const r = await searchProfiles(query, viewerId || undefined);
      if (mounted) setRows(r);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [query, viewerId]);

  // re-run search when follow state changes elsewhere
  useEffect(() => {
    const rerun = () => {
      // simply refetch by setting the same query again
      onClose?.(); // if you’d rather close the panel, keep this
      // or trigger a re-fetch without closing:
      // setRows((r) => [...r]);  // (no-op to force render)
    };
    window.addEventListener("follow:changed", rerun);
    return () => window.removeEventListener("follow:changed", rerun);
  }, []);

  if (!query) return null;

  useEffect(() => {
    const handler = (e: any) => {
      const t = e.detail?.targetId as string | undefined;
      const now = !!e.detail?.nowFollowing;
      if (!t) return;
      setRows((rows) =>
        rows.map((r) => (r.id === t ? { ...r, you_follow: now } : r))
      );
    };
    window.addEventListener("follow:changed", handler);
    return () => window.removeEventListener("follow:changed", handler);
  }, []);

  return (
    <div className="mx-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <div className="text-xs text-[var(--text)]/70">
            Results for “{query}”
          </div>
          <button
            className="text-xs text-[var(--text)]/60 hover:text-[var(--text)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* body */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading && (
            <div className="text-xs text-[var(--text)]/60 py-2 px-1">
              Searching…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="text-xs text-[var(--text)]/60 py-2 px-1">
              No users found.
            </div>
          )}

          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] cursor-pointer select-none"
                  onMouseDown={(e) => {
                    startY.current = e.clientY;
                    moved.current = false;
                  }}
                  onMouseMove={(e) => {
                    if (
                      startY.current !== null &&
                      Math.abs(e.clientY - startY.current) > 6
                    ) {
                      moved.current = true;
                    }
                  }}
                  onMouseUp={() => {
                    startY.current = null;
                  }}
                  onTouchStart={(e) => {
                    startY.current = e.touches[0].clientY;
                    moved.current = false;
                  }}
                  onTouchMove={(e) => {
                    if (
                      startY.current !== null &&
                      Math.abs(e.touches[0].clientY - startY.current) > 6
                    ) {
                      moved.current = true;
                    }
                  }}
                  onTouchEnd={() => {
                    startY.current = null;
                  }}
                  onClick={() => {
                    if (moved.current) return; // treat as scroll, not a click
                    const slug = r.username || r.id;
                    navigate(`/u/${slug}`);
                    onClose?.();
                  }}
                >
                  <Link to={`/u/${r.username || r.id}`} className="shrink-0">
                    <Avatar
                      url={r.avatar_url || undefined}
                      name={r.display_name || r.username || "User"}
                      size={40}
                    />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate">
                      {r.display_name || "Unnamed"}
                    </div>
                    <div className="text-[11px] text-[var(--text)]/60 truncate">
                      @{r.username || "user"}{" "}
                      {r.member_no ? (
                        <span className="ml-1 text-[var(--text)]/40">
                          • Nº {r.member_no}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    <FollowButton
                      targetId={r.id}
                      className="text-[11px] h-6 min-w-[70px] px-2"
                      onChange={(nowFollowing) => {
                        // Update the local state when follow status changes
                        setRows((rows) =>
                          rows.map((x) =>
                            x.id === r.id
                              ? { ...x, you_follow: nowFollowing }
                              : x
                          )
                        );
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
