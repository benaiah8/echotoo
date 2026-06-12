import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type PointerEvent,
} from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { getPostByIdOptimized } from "../api/queries/getPostById";
import PostDetailBody, { type Post } from "./detail/PostDetailBody";
import PostDetailSkeleton from "./skeletons/PostDetailSkeleton";
import FeedLoadErrorState from "./ui/FeedLoadErrorState";
import { supabase } from "../lib/supabaseClient";
import { onPostChanged } from "../lib/postEvents";
import { applyPostPatch } from "../lib/applyPostPatch";
import { mergeUiCriticalPostFields } from "../lib/mergeUiCriticalPostFields";
import { PostDetailDismissContext } from "../context/PostDetailDismissContext";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";
import { subscribeAndroidPostDetailModalBack } from "../lib/androidPostDetailModalBack";
import { useCreateKeyboardInset } from "../hooks/useCreateKeyboardInset";
import { useOverlayEdgeSwipeDismiss } from "../hooks/useOverlayEdgeSwipeDismiss";
import { blurActiveEditableFirst } from "../lib/blurActiveEditableFirst";
import type { PostDetailNavigateState } from "../lib/postDetailNavigationState";

export default function PostDetailModal() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as PostDetailNavigateState | null;
  const backgroundLocation = state?.backgroundLocation;
  const initialPost = state?.initialPost;
  const focusCommentComposer = Boolean(state?.focusCommentComposer);

  const hasMatchingInitialPost = !!id && !!initialPost && initialPost.id === id;
  const [post, setPost] = useState<Post | null>(() => {
    if (hasMatchingInitialPost) return initialPost as Post;
    return null;
  });
  const [loading, setLoading] = useState(!hasMatchingInitialPost);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [composerFocused, setComposerFocused] = useState(false);

  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const playAnimatedDismissRef = useRef<() => void>(() => {});
  const composerFocusedRef = useRef(false);
  const blurBackdropClickRef = useRef(false);
  /** One scroll-to-comments per modal open when arriving from feed comment control. */
  const focusCommentsScrollDoneRef = useRef(false);

  const {
    keyboardInsetPx: modalKeyboardInsetPx,
    keyboardOpen,
  } = useCreateKeyboardInset();

  const handleClose = useCallback(() => {
    if (backgroundLocation) {
      // Do not use navigate(-1): after edit→republish the previous history entry is often
      // /create/... — go to the real underlying tab (home/profile) instead.
      const { pathname, search, hash, state: bgState } = backgroundLocation;
      navigate(
        { pathname, search: search ?? "", hash: hash ?? "" },
        { state: bgState, replace: true }
      );
    } else {
      navigate("/", { replace: true });
    }
  }, [navigate, backgroundLocation]);

  useEffect(() => {
    composerFocusedRef.current = composerFocused;
  }, [composerFocused]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  /** Overlay route: keep underlying tab (window scroll) from moving behind the sheet. */
  useEffect(() => {
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, []);

  useEffect(() => {
    closingRef.current = false;
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    focusCommentsScrollDoneRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!focusCommentComposer || !post || focusCommentsScrollDoneRef.current) return;
    focusCommentsScrollDoneRef.current = true;
    const t = window.setTimeout(() => {
      document.querySelector("[data-comments-section]")?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }, 120);
    return () => clearTimeout(t);
  }, [focusCommentComposer, post?.id]);

  const hasMatching = !!id && !!initialPost && initialPost.id === id;
  useEffect(() => {
    setPost(hasMatching ? (initialPost as Post) : null);
    setLoading(!hasMatching);
    setError(null);
  }, [id, initialPost, hasMatching]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id || id.startsWith("draft-")) {
        setLoading(false);
        return;
      }
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const viewerUserId = session?.user?.id || null;
        const result = await getPostByIdOptimized(id, viewerUserId);

        if (!cancelled) {
          if (result.error || !result.data) {
            setError(result.error?.message || "Not found");
            setPost((prev) => (prev?.id === id ? prev : null));
          } else {
            const next = result.data as any;
            setPost((prev) => {
              if (!prev) return result.data as Post;
              const nextHasMedia =
                Array.isArray(next.activities) &&
                next.activities.some((a: any) => (a?.images?.length ?? 0) > 0);
              const prevHasMedia =
                Array.isArray(prev.activities) &&
                prev.activities.some((a: any) => (a?.images?.length ?? 0) > 0);
              const activities = nextHasMedia
                ? next.activities
                : prevHasMedia
                ? prev.activities
                : next.activities ?? prev.activities ?? [];
              const merged = mergeUiCriticalPostFields(prev, next);
              return { ...merged, activities } as Post;
            });
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
  }, [id, loadAttempt]);

  useEffect(() => {
    const cleanup = onPostChanged((e) => {
      const { postId: changedPostId, patch } = e.detail;
      setPost((prev) => {
        if (!prev || prev.id !== changedPostId) return prev;
        return applyPostPatch(prev as Record<string, unknown>, patch) as Post;
      });
    });
    return cleanup;
  }, []);

  const finishDismiss = useCallback(
    (navDelayMs: number = 0) => {
      if (closingRef.current) return;
      closingRef.current = true;
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => {
        const runClose = () => {
          handleClose();
          closingRef.current = false;
        };
        // Native WebViews: let the compositor present the last transition frame before routing.
        if (isNativeApp()) {
          requestAnimationFrame(() => {
            requestAnimationFrame(runClose);
          });
        } else {
          runClose();
        }
      }, navDelayMs);
    },
    [handleClose]
  );

  /**
   * Route-mounted post overlay: no CreateChooser-style `visible` deferral — keep `active` true
   * for the modal’s whole lifetime so the hook does not zero `translateX` while the sheet is
   * still on screen (avoids post-close transform reset glitch).
   */
  const { overlayMotionStyle, edgeStripProps, playAnimatedDismiss } =
    useOverlayEdgeSwipeDismiss({
      active: true,
      engageSwipe: true,
      gestureDisabled: composerFocused || keyboardOpen,
      edgeStripLeftInsetPx: isNativeApp() ? 8 : 12,
      /** Narrow true-edge strip only — do not reuse invite overlay 42vw / 180px (blocks Reply taps). */
      edgeStripZClass: "z-[32]",
      /**
       * Horizontal edge swipe / programmatic dismiss: hook waits COMMIT_NAV_DELAY_MS, then
       * navigate via the same pipeline as before (no upward sheet motion).
       */
      onDismiss: () => finishDismiss(0),
    });

  useEffect(() => {
    playAnimatedDismissRef.current = playAnimatedDismiss;
  }, [playAnimatedDismiss]);

  useEffect(() => {
    return subscribeAndroidPostDetailModalBack(() => {
      if (closingRef.current) return;
      if (composerFocusedRef.current) {
        const ae = document.activeElement as HTMLElement | null;
        if (
          ae &&
          (ae.tagName === "INPUT" ||
            ae.tagName === "TEXTAREA" ||
            ae.isContentEditable)
        ) {
          ae.blur();
          return;
        }
      }
      playAnimatedDismissRef.current();
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        playAnimatedDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playAnimatedDismiss]);

  const noopDismissPointer = useCallback(
    (_e: PointerEvent<HTMLButtonElement>) => {},
    [],
  );

  const dismissContextValue = useMemo(
    () => ({
      setComposerFocused,
      modalKeyboardInsetPx,
      /** Swipe-up handle removed — keep shape so FloatingCommentInput types stay valid. */
      dismissHandle: {
        visible: false,
        pressed: false,
        onPointerDown: noopDismissPointer,
        onPointerMove: noopDismissPointer,
        onPointerUp: noopDismissPointer,
        onPointerCancel: noopDismissPointer,
        onLostPointerCapture: noopDismissPointer,
      },
    }),
    [modalKeyboardInsetPx, noopDismissPointer]
  );

  return (
    <PostDetailDismissContext.Provider value={dismissContextValue}>
      <div
        className="fixed inset-0 z-[120] flex flex-col pointer-events-none"
        style={{
          bottom: "calc(-1 * var(--safe-area-bottom-layout))",
          ...overlayMotionStyle,
        }}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="pointer-events-auto absolute inset-0 z-0 cursor-default"
          style={{
            backgroundColor: "rgba(0,0,0,0.55)",
            opacity: 1,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (closingRef.current) return;
            if (!blurActiveEditableFirst()) return;
            blurBackdropClickRef.current = true;
            e.preventDefault();
          }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (closingRef.current) return;
            if (blurBackdropClickRef.current) {
              blurBackdropClickRef.current = false;
              return;
            }
            playAnimatedDismiss();
          }}
          aria-hidden
        />

        <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 justify-center">
          <div className="pointer-events-auto flex h-full min-h-0 w-full max-w-[640px] flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl bg-[var(--bg)] shadow-xl safe-area-inset-bottom">
              <div
                className="min-h-0 flex-1 overflow-y-auto"
                data-post-detail-modal-scroll
              >
                <div className="relative px-4 pb-6">
                  {(loading || (error && !post)) && (
                    <button
                      type="button"
                      onClick={playAnimatedDismiss}
                      className="absolute top-3 right-3 z-50 h-9 w-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/75"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  )}
                  {loading && !post && <PostDetailSkeleton />}
                  {error && !post && (
                    <FeedLoadErrorState
                      title="We couldn't load this post"
                      body="Check your connection and try again."
                      onRetry={() => {
                        setError(null);
                        setLoading(true);
                        setLoadAttempt((n) => n + 1);
                      }}
                    />
                  )}
                  {post && (
                    <PostDetailBody
                      post={post}
                      onClose={playAnimatedDismiss}
                      autoFocusCommentComposer={focusCommentComposer}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div {...edgeStripProps} />
      </div>
    </PostDetailDismissContext.Provider>
  );
}
