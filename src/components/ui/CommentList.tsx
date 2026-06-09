import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CommentWithDetails } from "../../types/comment";
import {
  getCommentsForPost,
  fetchCommentLikeCounts,
  updateComment,
  deleteComment,
} from "../../api/services/comments";
import Comment from "./Comment";
import FloatingCommentInput from "./FloatingCommentInput";
import { getViewerAuthUserId } from "../../api/services/follows";
import { useCommentThreadRealtime } from "../../hooks/useCommentThreadRealtime";

const COMMENT_REPLY_LOG = "[CommentReply]";
const RECENT_OPTIMISTIC_TTL_MS = 2000;

function devReplyLog(...args: unknown[]) {
  if (import.meta.env.DEV) console.log(COMMENT_REPLY_LOG, ...args);
}

type RecentOptimisticEntry = {
  id: string;
  comment: CommentWithDetails;
  parentId?: string;
  at: number;
};

interface Props {
  postId: string;
  onCommentCountChange?: (count: number) => void;
  isModal?: boolean;
  autoFocusCommentComposer?: boolean;
  /** Parent stores the latest focus() for the modal sticky bar. */
  setFocusComposer?: (focus: () => void) => void;
}

function countCommentsInTree(comments: CommentWithDetails[]): number {
  return comments.reduce(
    (total, comment) =>
      total + 1 + countCommentsInTree(comment.replies || []),
    0
  );
}

function collectAllCommentIds(comments: CommentWithDetails[]): string[] {
  const ids: string[] = [];
  const walk = (list: CommentWithDetails[]) => {
    for (const comment of list) {
      ids.push(comment.id);
      if (comment.replies?.length) walk(comment.replies);
    }
  };
  walk(comments);
  return ids;
}

function mergeLikeCountsIntoTree(
  comments: CommentWithDetails[],
  counts: Record<string, { like_count: number; is_liked: boolean }>
): CommentWithDetails[] {
  return comments.map((comment) => ({
    ...comment,
    like_count: counts[comment.id]?.like_count ?? comment.like_count,
    is_liked: counts[comment.id]?.is_liked ?? comment.is_liked,
    replies: comment.replies
      ? mergeLikeCountsIntoTree(comment.replies, counts)
      : [],
  }));
}

function patchLikeInTree(
  comments: CommentWithDetails[],
  commentId: string,
  liked: boolean,
  count: number
): CommentWithDetails[] {
  return comments.map((comment) => {
    if (comment.id === commentId) {
      return { ...comment, is_liked: liked, like_count: count };
    }
    if (comment.replies?.length) {
      return {
        ...comment,
        replies: patchLikeInTree(comment.replies, commentId, liked, count),
      };
    }
    return comment;
  });
}

function insertCommentInTree(
  comments: CommentWithDetails[],
  newComment: CommentWithDetails,
  parentId?: string
): { tree: CommentWithDetails[]; inserted: boolean } {
  if (!parentId) {
    return { tree: [...comments, newComment], inserted: true };
  }

  let inserted = false;
  const tree = comments.map((comment) => {
    if (comment.id === parentId) {
      inserted = true;
      return {
        ...comment,
        replies: [...(comment.replies || []), newComment],
      };
    }
    if (comment.replies?.length) {
      const child = insertCommentInTree(comment.replies, newComment, parentId);
      if (child.inserted) inserted = true;
      return { ...comment, replies: child.tree };
    }
    return comment;
  });

  return { tree, inserted };
}

function commentExistsInTree(
  comments: CommentWithDetails[],
  commentId: string
): boolean {
  for (const comment of comments) {
    if (comment.id === commentId) return true;
    if (comment.replies?.length && commentExistsInTree(comment.replies, commentId)) {
      return true;
    }
  }
  return false;
}

function pruneRecentOptimistic(entries: RecentOptimisticEntry[]): RecentOptimisticEntry[] {
  const now = Date.now();
  return entries.filter((entry) => now - entry.at < RECENT_OPTIMISTIC_TTL_MS);
}

function mergeRecentOptimisticIntoTree(
  serverTree: CommentWithDetails[],
  recent: RecentOptimisticEntry[]
): CommentWithDetails[] {
  const fresh = pruneRecentOptimistic(recent);
  let tree = serverTree;

  for (const entry of fresh) {
    if (commentExistsInTree(tree, entry.id)) continue;
    const result = insertCommentInTree(tree, entry.comment, entry.parentId);
    if (result.inserted) {
      tree = result.tree;
    } else {
      devReplyLog("merge optimistic fallback root", entry.id, entry.parentId);
      tree = [...tree, entry.comment];
    }
  }

  return tree;
}

function patchContentInTree(
  comments: CommentWithDetails[],
  commentId: string,
  content: string
): CommentWithDetails[] {
  return comments.map((comment) => {
    if (comment.id === commentId) {
      return { ...comment, content, updated_at: new Date().toISOString() };
    }
    if (comment.replies?.length) {
      return {
        ...comment,
        replies: patchContentInTree(comment.replies, commentId, content),
      };
    }
    return comment;
  });
}

function removeCommentFromTree(
  comments: CommentWithDetails[],
  commentId: string
): CommentWithDetails[] {
  return comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) =>
      comment.replies?.length
        ? {
            ...comment,
            replies: removeCommentFromTree(comment.replies, commentId),
          }
        : comment
    );
}

function buildOptimisticCommentAuthor(
  commentData: { author_id?: string },
  userProfile: {
    username?: string;
    display_name?: string;
    avatar_url?: string;
  } | null,
  currentUserId: string | null
): CommentWithDetails["author"] {
  const cachedUsername = localStorage.getItem("my_username") ?? "";
  const cachedDisplayName = localStorage.getItem("my_display_name") ?? "";
  const cachedAvatar = localStorage.getItem("my_avatar_url") ?? undefined;

  return {
    id: commentData.author_id ?? currentUserId ?? "",
    username: userProfile?.username || cachedUsername,
    display_name:
      userProfile?.display_name ||
      cachedDisplayName ||
      userProfile?.username ||
      cachedUsername ||
      "You",
    avatar_url: userProfile?.avatar_url || cachedAvatar,
  };
}

export default function CommentList({
  postId,
  onCommentCountChange,
  isModal = false,
  autoFocusCommentComposer = false,
  setFocusComposer,
}: Props) {
  const [comments, setComments] = useState<CommentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const focusComposerRef = useRef<(() => void) | null>(null);
  const recentOptimisticRef = useRef<RecentOptimisticEntry[]>([]);

  const handleFocusComposerReady = useCallback(
    (fn: () => void) => {
      focusComposerRef.current = fn;
      setFocusComposer?.(fn);
    },
    [setFocusComposer]
  );

  useEffect(() => {
    const getUser = async () => {
      const userId = await getViewerAuthUserId();
      setCurrentUserId(userId);

      const cachedProfile = localStorage.getItem("my_avatar_url");
      const cachedUsername = localStorage.getItem("my_username");
      const cachedDisplayName = localStorage.getItem("my_display_name");

      if (cachedProfile && cachedUsername && cachedDisplayName) {
        setUserProfile({
          username: cachedUsername,
          display_name: cachedDisplayName,
          avatar_url: cachedProfile,
        });
      }
    };
    getUser();
  }, []);

  const loadComments = useCallback(
    async (opts?: { bypassCache?: boolean; silent?: boolean }) => {
      try {
        if (!opts?.silent) {
          setLoading(true);
          setError(null);
        }
        const commentsData = await getCommentsForPost(postId, {
          bypassCache: opts?.bypassCache,
        });

        if (opts?.silent) {
          devReplyLog("silent reload");
          recentOptimisticRef.current = recentOptimisticRef.current.filter(
            (entry) => !commentExistsInTree(commentsData, entry.id)
          );
          recentOptimisticRef.current = pruneRecentOptimistic(
            recentOptimisticRef.current
          );
          const merged = mergeRecentOptimisticIntoTree(
            commentsData,
            recentOptimisticRef.current
          );
          setComments(merged);
          onCommentCountChange?.(countCommentsInTree(merged));
        } else {
          setComments(commentsData);
          onCommentCountChange?.(countCommentsInTree(commentsData));
        }
      } catch (err) {
        console.error("Error loading comments:", err);
        if (!opts?.silent) setError("Failed to load comments");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [postId, onCommentCountChange]
  );

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const commentIds = useMemo(
    () => collectAllCommentIds(comments),
    [comments]
  );

  const reconcileLikeCounts = useCallback(async () => {
    if (commentIds.length === 0) return;
    try {
      const counts = await fetchCommentLikeCounts(commentIds, currentUserId);
      setComments((prev) => mergeLikeCountsIntoTree(prev, counts));
    } catch (err) {
      console.error("Error reconciling comment like counts:", err);
    }
  }, [commentIds, currentUserId]);

  useCommentThreadRealtime({
    postId,
    commentIds,
    enabled: !loading && !error,
    onCommentsChanged: () => {
      void loadComments({ bypassCache: true, silent: true });
    },
    onLikesChanged: () => {
      void reconcileLikeCounts();
    },
  });

  const handleLikeChange = useCallback(
    (commentId: string, liked: boolean, count: number) => {
      setComments((prev) => patchLikeInTree(prev, commentId, liked, count));
    },
    []
  );

  const handleNewComment = (
    content: string,
    parentId?: string,
    commentData?: any
  ) => {
    devReplyLog("handleNewComment parentId", parentId);

    if (commentData) {
      const newComment: CommentWithDetails = {
        ...commentData,
        author: buildOptimisticCommentAuthor(
          commentData,
          userProfile,
          currentUserId
        ),
        like_count: 0,
        is_liked: false,
        replies: [],
      };

      recentOptimisticRef.current = pruneRecentOptimistic([
        ...recentOptimisticRef.current,
        {
          id: newComment.id,
          comment: newComment,
          parentId,
          at: Date.now(),
        },
      ]);

      setComments((prevComments) => {
        const result = insertCommentInTree(prevComments, newComment, parentId);
        let next = result.tree;
        if (parentId && !result.inserted) {
          devReplyLog("insert parent not found", parentId);
          if (import.meta.env.DEV) {
            console.warn(COMMENT_REPLY_LOG, "parent not found, appending at root", parentId);
          }
          next = [...prevComments, newComment];
        } else {
          devReplyLog("insert ok", { parentId, inserted: result.inserted });
        }
        onCommentCountChange?.(countCommentsInTree(next));
        return next;
      });
    }
    setReplyingTo(null);
  };

  const handleEditComment = async (commentId: string, content: string) => {
    try {
      await updateComment(commentId, { content });
      setComments((prevComments) =>
        patchContentInTree(prevComments, commentId, content)
      );
      setEditingComment(null);
    } catch (err) {
      console.error("Error updating comment:", err);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      setComments((prevComments) => {
        const next = removeCommentFromTree(prevComments, commentId);
        onCommentCountChange?.(countCommentsInTree(next));
        return next;
      });
      await deleteComment(commentId);
    } catch (err) {
      console.error("Error deleting comment:", err);
      void loadComments();
    }
  };

  const handleReply = (parentId: string) => {
    devReplyLog("reply clicked", parentId);
    setReplyingTo(parentId);
    focusComposerRef.current?.();
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active?.tagName !== "INPUT" && active?.tagName !== "TEXTAREA") {
        focusComposerRef.current?.();
      }
    }, 0);
  };

  useEffect(() => {
    devReplyLog("replyingTo changed", replyingTo);
    if (replyingTo) {
      focusComposerRef.current?.();
    }
  }, [replyingTo]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--text)]/10 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-[var(--text)]/10 rounded animate-pulse w-1/4" />
                <div className="h-3 bg-[var(--text)]/10 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-[var(--text)]/10 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 border-t border-[var(--border)]">
        <div className="p-4 pb-24 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => void loadComments()}
            className="mt-2 px-3 py-1 text-xs bg-[var(--primary)] text-[var(--primaryText)] rounded-lg hover:bg-[var(--primary)]/90"
          >
            Try Again
          </button>
        </div>

        <FloatingCommentInput
          postId={postId}
          onComment={handleNewComment}
          placeholder="Write a comment..."
          isModal={isModal}
          autoFocusComposer={autoFocusCommentComposer}
          onFocusComposerReady={handleFocusComposerReady}
        />
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-[var(--border)]">
      <div className="p-4 pb-24">
        {comments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--text)]/60">No comments yet</p>
            <p className="text-xs text-[var(--text)]/40 mt-1">
              Be the first to comment!
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {comments.map((comment) => (
              <Comment
                key={comment.id}
                comment={comment}
                onReply={handleReply}
                onEdit={handleEditComment}
                onDelete={handleDeleteComment}
                onLikeChange={handleLikeChange}
                currentUserId={currentUserId || undefined}
              />
            ))}
          </div>
        )}
      </div>

      <FloatingCommentInput
        postId={postId}
        parentId={replyingTo}
        onComment={handleNewComment}
        onCancel={replyingTo ? () => setReplyingTo(null) : undefined}
        placeholder={replyingTo ? "Write a reply..." : "Write a comment..."}
        isModal={isModal}
        autoFocusComposer={autoFocusCommentComposer}
        onFocusComposerReady={handleFocusComposerReady}
      />
    </div>
  );
}
