import { useEffect, useState } from "react";
import { useParams, Navigate, useLocation } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import { getPostByIdOptimized } from "../api/queries/getPostById";
import PostDetailBody, { type Post } from "../components/detail/PostDetailBody";
import PostDetailSkeleton from "../components/skeletons/PostDetailSkeleton";
import { supabase } from "../lib/supabaseClient";
import type { PostDetailNavigateState } from "../lib/postDetailNavigationState";
// [OPTIMIZATION: Phase 3.4] Removed batch loader - PostgreSQL function provides all data

export default function ExperiencePage() {
  const location = useLocation();
  const navState = location.state as PostDetailNavigateState | null;
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // [OPTIMIZATION: Phase 3.4] Removed batchedData - PostgreSQL function provides all data

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setError("Missing experience id");
        setLoading(false);
        return;
      }
      if (id.startsWith("draft-")) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);

        // [OPTIMIZATION: Phase 3.4] Get viewer user ID for PostgreSQL function
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const viewerUserId = session?.user?.id || null;

        // [OPTIMIZATION: Phase 3.4] Use optimized PostgreSQL function (includes all related data)
        const result = await getPostByIdOptimized(id, viewerUserId);

        if (!cancelled) {
          if (result.error || !result.data) {
            setError(result.error?.message || "Not found");
            setPost(null);
          } else {
            setPost(result.data as Post);
            setError(null);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (id?.startsWith("draft-")) {
    return <Navigate to="/create/finalize?type=experience" replace />;
  }
  if (loading) {
    return (
      <PrimaryPageContainer>
        <PostDetailSkeleton />
      </PrimaryPageContainer>
    );
  }
  if (error || !post) {
    return (
      <PrimaryPageContainer>
        <div className="px-3 py-4 text-red-400 text-sm">
          {error || "Not found"}
        </div>
      </PrimaryPageContainer>
    );
  }

  return (
    <PrimaryPageContainer>
      <PostDetailBody
        post={post}
        autoFocusCommentComposer={Boolean(navState?.focusCommentComposer)}
      />
    </PrimaryPageContainer>
  );
}
