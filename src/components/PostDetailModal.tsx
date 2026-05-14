import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  useParams,
  useLocation,
  useNavigate,
  type Location,
} from "react-router-dom";
import { getPostByIdOptimized } from "../api/queries/getPostById";
import PostDetailBody, { type Post } from "./detail/PostDetailBody";
import PostDetailSkeleton from "./skeletons/PostDetailSkeleton";
import { supabase } from "../lib/supabaseClient";
import { type FeedItem } from "../api/queries/getPublicFeed";
import { onPostChanged } from "../lib/postEvents";
import { applyPostPatch } from "../lib/applyPostPatch";
import { mergeUiCriticalPostFields } from "../lib/mergeUiCriticalPostFields";
import { PostDetailDismissContext } from "../context/PostDetailDismissContext";
import { hapticImpactLight } from "../lib/hapticsLight";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";
import { subscribeAndroidPostDetailModalBack } from "../lib/androidPostDetailModalBack";
import { useCreateKeyboardInset } from "../hooks/useCreateKeyboardInset";
import { blurActiveEditableFirst } from "../lib/blurActiveEditableFirst";
import type { PostDetailNavigateState } from "../lib/postDetailNavigationState";

/** Thumb-sized gesture: small movement arms; short drag commits */
const DISMISS_ARM_PX = 14;
const DISMISS_COMMIT_PX = 72;
/** Visual polish (fade / scale / blur) reaches ~full by this drag distance */
const DISMISS_VISUAL_RANGE_PX = 140;

/** Bottom-handle drag commit — keep in sync with finishDismiss delay (+~20ms buffer) */
const EXIT_MS_DRAG = 420;
const EXIT_NAV_MS_DRAG = 440;
/**
 * Back / backdrop / Escape: slower than drag dismiss; `finishDismiss` adds a buffer so
 * `navigate` runs after CSS finishes (WebViews can lag — see buffers below).
 */
const EXIT_MS_PROGRAMMATIC = 800;
/** Extra ms after transition before `navigate` — browser */
const PROGRAMMATIC_NAV_BUFFER_WEB_MS = 100;
/**
 * iOS WKWebView / Android System WebView often finish compositor work slightly after the
 * nominal transition duration; extra slack avoids popping the route before the sheet settles.
 */
const PROGRAMMATIC_NAV_BUFFER_NATIVE_MS = 260;

function maxDismissDragPx(): number {
  if (typeof window === "undefined") return 480;
  return Math.min(640, Math.round(window.innerHeight * 0.62));
}

function exitTranslatePx(fromOffset: number): number {
  const h = typeof window !== "undefined" ? window.innerHeight : 640;
  const far = Math.round(h * 0.72 + 40);
  return fromOffset <= 0 ? -far : far;
}

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

  const [composerFocused, setComposerFocused] = useState(false);
  const [handlePressed, setHandlePressed] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isPointerDragging, setIsPointerDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const startYRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const armedHapticRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  /** Which exit duration to use for CSS when `isExiting` — set before setState in each path */
  const exitMotionMsRef = useRef(EXIT_MS_DRAG);
  const playExitAnimationRef = useRef<() => void>(() => {});
  const isExitingRef = useRef(false);
  const composerFocusedRef = useRef(false);
  const blurBackdropClickRef = useRef(false);
  /** One scroll-to-comments per modal open when arriving from feed comment control. */
  const focusCommentsScrollDoneRef = useRef(false);

  const { keyboardInsetPx: modalKeyboardInsetPx } = useCreateKeyboardInset();

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
    isExitingRef.current = isExiting;
  }, [isExiting]);

  useEffect(() => {
    composerFocusedRef.current = composerFocused;
  }, [composerFocused]);

  useEffect(() => {
    dragOffsetRef.current = dragOffset;
  }, [dragOffset]);

  useEffect(() => {
    if (!composerFocused) return;
    setDragOffset(0);
    setIsPointerDragging(false);
    setHandlePressed(false);
    pointerActiveRef.current = false;
    armedHapticRef.current = false;
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
    setIsExiting(false);
    setDragOffset(0);
    setIsPointerDragging(false);
    setHandlePressed(false);
    pointerActiveRef.current = false;
    closingRef.current = false;
    exitMotionMsRef.current = EXIT_MS_DRAG;
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
  }, [id]);

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
    (navDelayMs: number = EXIT_NAV_MS_DRAG) => {
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
   * Same exit motion as committing the bottom dismiss drag: translate off-screen, fade/blur, then navigate.
   * Use for back button, backdrop, Escape, and loading/error close — not raw handleClose.
   */
  const playExitAnimation = useCallback(() => {
    if (closingRef.current || isExiting) return;
    setComposerFocused(false);
    pointerActiveRef.current = false;
    setHandlePressed(false);
    setIsPointerDragging(false);
    armedHapticRef.current = false;
    const motionMs = EXIT_MS_PROGRAMMATIC;
    exitMotionMsRef.current = motionMs;
    setIsExiting(true);
    setDragOffset(exitTranslatePx(-1));
    const navBuffer = isNativeApp()
      ? PROGRAMMATIC_NAV_BUFFER_NATIVE_MS
      : PROGRAMMATIC_NAV_BUFFER_WEB_MS;
    finishDismiss(motionMs + navBuffer);
  }, [finishDismiss, isExiting]);

  useEffect(() => {
    playExitAnimationRef.current = playExitAnimation;
  }, [playExitAnimation]);

  useEffect(() => {
    return subscribeAndroidPostDetailModalBack(() => {
      if (closingRef.current || isExitingRef.current) return;
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
      playExitAnimationRef.current();
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isPointerDragging) {
          setDragOffset(0);
          setIsPointerDragging(false);
          setHandlePressed(false);
          pointerActiveRef.current = false;
          return;
        }
        playExitAnimation();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playExitAnimation, isPointerDragging]);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (composerFocused || isExiting) return;
      e.preventDefault();
      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
      pointerActiveRef.current = true;
      startYRef.current = e.clientY;
      armedHapticRef.current = false;
      setHandlePressed(true);
      setIsPointerDragging(true);
    },
    [composerFocused, isExiting]
  );

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!pointerActiveRef.current || isExiting) return;
      const dy = e.clientY - startYRef.current;
      if (!armedHapticRef.current && Math.abs(dy) >= DISMISS_ARM_PX) {
        armedHapticRef.current = true;
        void hapticImpactLight();
      }
      const cap = maxDismissDragPx();
      const clamped = Math.max(-cap, Math.min(cap, dy));
      setDragOffset(clamped);
    },
    [isExiting]
  );

  const endPointerGesture = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!pointerActiveRef.current) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      pointerActiveRef.current = false;
      setHandlePressed(false);
      armedHapticRef.current = false;
      setIsPointerDragging(false);

      if (isExiting) return;

      const last = dragOffsetRef.current;
      if (Math.abs(last) >= DISMISS_COMMIT_PX * 0.92) {
        exitMotionMsRef.current = EXIT_MS_DRAG;
        setIsExiting(true);
        setDragOffset(exitTranslatePx(last));
        finishDismiss(EXIT_NAV_MS_DRAG);
      } else {
        setDragOffset(0);
      }
    },
    [isExiting, finishDismiss]
  );

  const dismissContextValue = useMemo(
    () => ({
      setComposerFocused,
      modalKeyboardInsetPx,
      dismissHandle: {
        visible: !composerFocused,
        pressed: handlePressed,
        onPointerDown: onHandlePointerDown,
        onPointerMove: onHandlePointerMove,
        onPointerUp: endPointerGesture,
        onPointerCancel: endPointerGesture,
        onLostPointerCapture: endPointerGesture,
      },
    }),
    [
      composerFocused,
      modalKeyboardInsetPx,
      handlePressed,
      onHandlePointerDown,
      onHandlePointerMove,
      endPointerGesture,
    ]
  );

  /** Softer ramp for visuals — starts as soon as you move */
  const visualT = Math.min(1, Math.abs(dragOffset) / DISMISS_VISUAL_RANGE_PX);

  const overlayBase = 0.55;
  const overlayOpacity = isExiting
    ? 0
    : Math.max(0.04, overlayBase * (1 - 0.52 * visualT));
  const sheetOpacity = isExiting ? 0 : Math.max(0.78, 1 - 0.14 * visualT);
  const sheetScale = 1 - 0.05 * visualT;
  const sheetBlurPx = visualT * 2.8;

  const motionEase = "cubic-bezier(0.22, 1, 0.32, 1)";
  const motionMs = isExiting ? exitMotionMsRef.current : 380;
  const sheetTransition =
    isPointerDragging && !isExiting
      ? "none"
      : `transform ${motionMs}ms ${motionEase}, opacity ${motionMs}ms ${motionEase}, filter ${motionMs}ms ${motionEase}`;
  const backdropTransition =
    isPointerDragging && !isExiting
      ? "none"
      : `opacity ${motionMs}ms ${motionEase}, backdrop-filter ${motionMs}ms ${motionEase}, -webkit-backdrop-filter ${motionMs}ms ${motionEase}`;

  return (
    <PostDetailDismissContext.Provider value={dismissContextValue}>
      <div
        className="fixed inset-0 z-[120] flex flex-col pointer-events-none"
        style={{
          bottom: "calc(-1 * var(--safe-area-bottom-layout))",
        }}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="pointer-events-auto absolute inset-0 z-0 cursor-default"
          style={{
            backgroundColor: "rgba(0,0,0,0.55)",
            opacity: isExiting ? 0 : overlayOpacity,
            transition: backdropTransition,
            backdropFilter: `blur(${Math.round(visualT * 10)}px)`,
            WebkitBackdropFilter: `blur(${Math.round(visualT * 10)}px)`,
          }}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (isPointerDragging || isExiting) return;
            if (!blurActiveEditableFirst()) return;
            blurBackdropClickRef.current = true;
            e.preventDefault();
          }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (isPointerDragging || isExiting) return;
            if (blurBackdropClickRef.current) {
              blurBackdropClickRef.current = false;
              return;
            }
            playExitAnimation();
          }}
          aria-hidden
        />

        <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 justify-center">
          <div
            className="pointer-events-auto flex h-full min-h-0 w-full max-w-[640px] flex-col"
            style={{
              transform: `translateY(${dragOffset}px) scale(${sheetScale})`,
              opacity: sheetOpacity,
              filter: `blur(${sheetBlurPx}px)`,
              transition: sheetTransition,
              transformOrigin: "50% 45%",
              willChange:
                isPointerDragging || isExiting
                  ? "transform, opacity"
                  : undefined,
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl bg-[var(--bg)] shadow-xl safe-area-inset-bottom">
              <div
                className="min-h-0 flex-1 overflow-y-auto"
                data-post-detail-modal-scroll
              >
                <div className="relative px-4 pb-6">
                  {(loading || (error && !post)) && (
                    <button
                      type="button"
                      onClick={playExitAnimation}
                      className="absolute top-3 right-3 z-50 h-9 w-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/75"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  )}
                  {loading && !post && <PostDetailSkeleton />}
                  {error && !post && (
                    <div className="py-4 text-red-400 text-sm text-center">
                      {error}
                    </div>
                  )}
                  {post && (
                    <PostDetailBody
                      post={post}
                      onClose={playExitAnimation}
                      autoFocusCommentComposer={focusCommentComposer}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PostDetailDismissContext.Provider>
  );
}
