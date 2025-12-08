import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import { getPostById } from "../api/queries/getPostById";
import PostDetailBody, { type Post } from "../components/detail/PostDetailBody";
import PostDetailSkeleton from "../components/skeletons/PostDetailSkeleton";

export default function ExperiencePage() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <PostDetailBody post={post} />
    </PrimaryPageContainer>
  );
}
