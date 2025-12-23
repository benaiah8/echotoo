import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import { getPostById } from "../api/queries/getPostById";
import PostDetailBody, { type Post } from "../components/detail/PostDetailBody";
import PostDetailSkeleton from "../components/skeletons/PostDetailSkeleton";
import { loadBatchData, type BatchLoadResult } from "../lib/batchDataLoader";
import { supabase } from "../lib/supabaseClient";

export default function ExperiencePage() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // [OPTIMIZATION: Phase 1 - Batch] Store batched data for components
  const [batchedData, setBatchedData] = useState<BatchLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setError("Missing experience id");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await getPostById(id);
        if (!cancelled) {
          setPost(data as Post);
          setError(data ? null : "Not found");

          // [OPTIMIZATION: Phase 1 - Batch] Load batch data for this post
          if (data) {
            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();
              const currentUserId = session?.user?.id;

              if (currentUserId && data.author_id) {
                const { data: currentUserProfile } = await supabase
                  .from("profiles")
                  .select("id")
                  .eq("user_id", currentUserId)
                  .maybeSingle();

                if (currentUserProfile) {
                  // Get author profile ID
                  const { data: authorProfile } = await supabase
                    .from("profiles")
                    .select("id")
                    .eq("user_id", data.author_id)
                    .maybeSingle();

                  if (authorProfile) {
                    const batchResult = await loadBatchData({
                      postIds: [data.id],
                      authorIds: [authorProfile.id],
                      hangoutPostIds: data.type === "hangout" ? [data.id] : [],
                      currentUserId,
                      currentProfileId: currentUserProfile.id,
                    });

                    if (!cancelled) {
                      setBatchedData(batchResult);
                    }
                  }
                }
              }
            } catch (batchError) {
              console.warn(
                "[ExperiencePage] Failed to load batch data:",
                batchError
              );
              // Don't block page load if batch loading fails
            }
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
      <PostDetailBody post={post} batchedData={batchedData} />
    </PrimaryPageContainer>
  );
}
