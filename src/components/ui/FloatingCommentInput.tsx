import React, { useCallback, useEffect, useState, useRef } from "react";
import { createComment } from "../../api/services/comments";
import Avatar from "./Avatar";
import { supabase } from "../../lib/supabaseClient";
import { getViewerAuthUserId } from "../../api/services/follows";
import { imgUrlPublic } from "../../lib/img";
import { uploadImage } from "../../api/services/mediaUpload";
import { PiCaretUp, PiImage, PiPaperPlaneRight, PiX } from "react-icons/pi";
import { usePostDetailDismiss } from "../../context/PostDetailDismissContext";
import {
  POST_DETAIL_GLASS_PILL_MAX_WIDTH_PX,
  POST_DETAIL_GLASS_PILL_WIDTH_CLASS,
} from "../../lib/postDetailGlassUi";
import toast from "react-hot-toast";
import {
  APP_SAFE_BOTTOM_SYNC_EVENT,
  resolveSafeAreaBottomLayoutPx,
} from "../../lib/appSafeAreaBottom";
import {
  scrollCommentsSectionIntoView,
  scrollModalCommentsContentAboveComposer,
  scrollModalReplyTargetIntoView,
  modalReplyRowNeedsKeyboardScroll,
  scheduleStagedModalReplyTargetScroll,
  POST_DETAIL_MODAL_SCROLL_ROOT,
} from "../../lib/postDetailCommentsScroll";
import { MODAL_COMPOSER_PILL_BOTTOM_GAP_PX } from "../../hooks/usePostDetailCommentLayout";
import useAuthActionGate from "../../hooks/useAuthActionGate";
import { mapMediaUploadError } from "../../lib/mapMediaUploadError";
import {
  isAndroid,
  isNativeApp,
} from "../../lib/storage/utils/capacitorDetection";

const COMMENT_IMAGE_UPLOAD_LOG = "[CommentImageUpload]";

/** Align with useCreateKeyboardInset — keyboard "open" for follow-up scroll. */
const KEYBOARD_LIFT_SCROLL_THRESHOLD_PX = 48;

interface Props {
  postId: string;
  parentId?: string | null;
  onComment: (content: string, parentId?: string, commentData?: any) => void;
  /** Modal reply mode: clear when composer blurs safely (no draft). */
  onReplyModeClear?: () => void;
  placeholder?: string;
  /** When true (e.g. post detail modal), ignores BottomTab height and scroll-hide logic */
  isModal?: boolean;
  /** One-shot: programmatically focus composer after mount (explicit opt-in; modal feed comment icon does not use this). */
  autoFocusComposer?: boolean;
  /** Registers imperative focus for sticky bar / parent (cleared on unmount). */
  onFocusComposerReady?: (focus: () => void) => void;
  /**
   * Same-tick focus for Reply tap (user gesture). Skips aggressive modal scroll on the
   * resulting focus event. Registered on mount; cleared on unmount.
   */
  onGestureFocusReady?: (focusFromGesture: () => void) => void;
  /**
   * Modal only: when `layer-absolute`, composer is positioned inside a portal host
   * (sibling to modal scroll) instead of `position: fixed` to the viewport.
   */
  modalComposerLayer?: "viewport-fixed" | "layer-absolute";
}

export default function FloatingCommentInput({
  postId,
  parentId,
  onComment,
  onReplyModeClear,
  placeholder = "This is where we add the comment",
  isModal = false,
  autoFocusComposer = false,
  onFocusComposerReady,
  onGestureFocusReady,
  modalComposerLayer,
}: Props) {
  const { ensureAuthed } = useAuthActionGate();
  const postDetailDismiss = usePostDetailDismiss();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userProfile, setUserProfile] = useState<{
    username: string;
    display_name: string;
    avatar_url?: string;
  } | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Modal + full-page composer text field. */
  const composerInputRef = useRef<HTMLInputElement>(null);
  const didAutoFocusRef = useRef(false);
  /** Tracks IME-open for one follow-up scroll after inset crosses threshold (modal). */
  const prevKeyboardLiftRef = useRef(0);
  /** Skip smooth scroll on the next focus when entering reply mode programmatically. */
  const skipNextFocusScrollRef = useRef(false);
  const blurClearReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const stagedReplyRecheckRef = useRef<{ cancel: () => void } | null>(null);

  const [composerSurfaceFocused, setComposerSurfaceFocused] = useState(false);
  const [safeBottom, setSafeBottom] = useState(0);
  useEffect(() => {
    const sync = () => setSafeBottom(resolveSafeAreaBottomLayoutPx());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener(APP_SAFE_BOTTOM_SYNC_EVENT, sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener(APP_SAFE_BOTTOM_SYNC_EVENT, sync);
    };
  }, []);

  const BAR_H = 60; // visible control bar height
  const OVERLAP = 0; // no overlap - directly attach to bottom tab

  // Measure BottomTab so the bar hugs it perfectly
  const [btHeight, setBtHeight] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = document.getElementById("bottom-tab");
    const measure = () =>
      setBtHeight(el ? Math.round(el.getBoundingClientRect().height) : 0);
    measure();

    // Re-measure on resize & when BottomTab animates
    window.addEventListener("resize", measure);
    const mo = el ? new MutationObserver(measure) : null;
    if (el && mo)
      mo.observe(el, { attributes: true, childList: true, subtree: true });
    const end = () => measure();
    el?.addEventListener("transitionend", end);

    return () => {
      window.removeEventListener("resize", measure);
      mo?.disconnect();
      el?.removeEventListener("transitionend", end);
    };
  }, []);

  // Track scroll to follow bottom tab behavior - disabled in modal mode
  useEffect(() => {
    if (isModal) return;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const current = window.scrollY;
          const shouldHide = current > 30; // more responsive threshold
          setHidden(shouldHide);
          ticking = false;
        });
        ticking = true;
      }
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isModal]);

  // Get current user profile from cache first
  useEffect(() => {
    const getUserProfile = async () => {
      // Try to get from cache first
      const cachedProfile = localStorage.getItem("my_avatar_url");
      const cachedUsername = localStorage.getItem("my_username");
      const cachedDisplayName = localStorage.getItem("my_display_name");

      if (cachedProfile && cachedUsername && cachedDisplayName) {
        setUserProfile({
          username: cachedUsername,
          display_name: cachedDisplayName,
          avatar_url: cachedProfile,
        });
        return;
      }

      // Fallback to API if cache is empty
      const userId = await getViewerAuthUserId();
      if (userId) {
        // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() for caching and deduplication
        // Why: Centralizes profile fetching, reduces duplicate profiles?select=id requests
        const { getProfileByUserId } = await import(
          "../../api/services/follows"
        );
        const profile = await getProfileByUserId(userId);

        if (profile) {
          setUserProfile({
            username: profile.username || "",
            display_name: profile.display_name || "",
            avatar_url: profile.avatar_url || undefined,
          });
        }
      }
    };
    getUserProfile();
  }, []);

  const scheduleComposerViewportScroll = useCallback(
    (
      modal: boolean,
      behavior: ScrollBehavior = "smooth",
      replyParentId?: string | null
    ) => {
      requestAnimationFrame(() => {
        if (modal && replyParentId) {
          scrollModalReplyTargetIntoView(replyParentId, { behavior });
        } else if (modal) {
          scrollModalCommentsContentAboveComposer({ behavior });
        } else {
          scrollCommentsSectionIntoView({
            isModal: modal,
            behavior,
            block: "nearest",
          });
        }
      });
    },
    []
  );

  const focusComposerInput = useCallback(
    (el: HTMLInputElement) => {
      if (isModal) {
        const coarseOrNative =
          isNativeApp() ||
          (typeof window !== "undefined" &&
            window.matchMedia("(pointer: coarse)").matches);
        if (coarseOrNative) {
          el.focus();
          return;
        }
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
        return;
      }
      const preferNativeScroll =
        isNativeApp() ||
        (typeof window !== "undefined" &&
          window.matchMedia("(pointer: coarse)").matches);
      if (preferNativeScroll) {
        el.focus();
      } else {
        el.focus({ preventScroll: true });
      }
    },
    [isModal]
  );

  const focusComposer = useCallback(() => {
    const el = composerInputRef.current;
    if (!el) return;
    focusComposerInput(el);
  }, [focusComposerInput]);

  /** Backup only: if Reply did not focus from CommentList gesture path (rare). */
  useEffect(() => {
    if (!parentId) return;
    const tid = window.setTimeout(() => {
      const el = composerInputRef.current;
      if (!el || document.activeElement === el) return;
      skipNextFocusScrollRef.current = true;
      focusComposerInput(el);
    }, 80);
    return () => clearTimeout(tid);
  }, [parentId, focusComposerInput]);

  useEffect(() => {
    if (!onGestureFocusReady) return;
    const focusFromGesture = () => {
      const el = composerInputRef.current;
      if (!el) {
        return;
      }
      skipNextFocusScrollRef.current = true;
      focusComposerInput(el);
    };
    onGestureFocusReady(focusFromGesture);
    return () => {
      onGestureFocusReady(() => {});
    };
  }, [onGestureFocusReady, focusComposerInput]);

  const handleComposerFocus = useCallback(
    (modal: boolean) => {
      if (modal) {
        postDetailDismiss?.setComposerFocused(true);
        prevKeyboardLiftRef.current =
          postDetailDismiss?.modalKeyboardInsetPx ?? 0;
      }
      setComposerSurfaceFocused(true);
      if (skipNextFocusScrollRef.current) {
        skipNextFocusScrollRef.current = false;
        return;
      }
      if (modal) {
        const replyId = parentId ?? null;
        requestAnimationFrame(() => {
          if (replyId) {
            scrollModalReplyTargetIntoView(replyId, { behavior: "auto" });
          } else {
            scrollModalCommentsContentAboveComposer({ behavior: "auto" });
          }
        });
        return;
      }
      scheduleComposerViewportScroll(modal, "smooth", parentId ?? null);
    },
    [postDetailDismiss, scheduleComposerViewportScroll, parentId]
  );

  const handleModalComposerInputFocus = useCallback(() => {
    handleComposerFocus(true);
  }, [handleComposerFocus]);

  const handleModalComposerInputBlur = useCallback(() => {
    postDetailDismiss?.setComposerFocused(false);
    setComposerSurfaceFocused(false);
    prevKeyboardLiftRef.current = 0;

    if (!onReplyModeClear || !parentId) return;

    if (blurClearReplyTimerRef.current) {
      clearTimeout(blurClearReplyTimerRef.current);
    }
    blurClearReplyTimerRef.current = setTimeout(() => {
      blurClearReplyTimerRef.current = null;
      const el = composerInputRef.current;
      if (el && document.activeElement === el) return;
      const draft = el?.value ?? "";
      if (draft.trim().length > 0) return;
      onReplyModeClear();
    }, 120);
  }, [postDetailDismiss, onReplyModeClear, parentId]);

  useEffect(() => {
    return () => {
      if (blurClearReplyTimerRef.current) {
        clearTimeout(blurClearReplyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!onFocusComposerReady) return;
    onFocusComposerReady(focusComposer);
    return () => {
      onFocusComposerReady(() => {});
    };
  }, [onFocusComposerReady, focusComposer]);

  useEffect(() => {
    if (!autoFocusComposer || didAutoFocusRef.current) return;
    const tid = window.setTimeout(() => {
      const el = composerInputRef.current;
      if (!el) return;
      didAutoFocusRef.current = true;
      skipNextFocusScrollRef.current = true;
      focusComposerInput(el);
    }, 180);
    return () => clearTimeout(tid);
  }, [autoFocusComposer, isModal, focusComposerInput]);

  /** Modal reply: re-position target when keyboard inset / layout settles. */
  useEffect(() => {
    if (!isModal || !parentId || !composerSurfaceFocused) return;

    stagedReplyRecheckRef.current?.cancel();

    const replyId = parentId;
    stagedReplyRecheckRef.current = scheduleStagedModalReplyTargetScroll(
      replyId,
      {
        behavior: "auto",
        isActive: () => {
          if (!document.querySelector(POST_DETAIL_MODAL_SCROLL_ROOT)) return false;
          const el = composerInputRef.current;
          return (
            !!el &&
            (document.activeElement === el || composerSurfaceFocused)
          );
        },
      }
    );

    return () => {
      stagedReplyRecheckRef.current?.cancel();
    };
  }, [
    isModal,
    parentId,
    composerSurfaceFocused,
    postDetailDismiss?.modalKeyboardInsetPx,
  ]);

  /** Modal reply: gentle recheck on visualViewport resize while keyboard animates. */
  useEffect(() => {
    if (!isModal || !parentId || !composerSurfaceFocused) return;
    const vv = window.visualViewport;
    if (!vv) return;

    let rafId = 0;
    const onVvChange = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const replyId = parentId;
        if (!replyId || !modalReplyRowNeedsKeyboardScroll(replyId)) return;
        scrollModalReplyTargetIntoView(replyId, { behavior: "auto" });
      });
    };

    vv.addEventListener("resize", onVvChange);
    vv.addEventListener("scroll", onVvChange);
    return () => {
      vv.removeEventListener("resize", onVvChange);
      vv.removeEventListener("scroll", onVvChange);
      cancelAnimationFrame(rafId);
    };
  }, [isModal, parentId, composerSurfaceFocused]);

  useEffect(() => {
    return () => {
      stagedReplyRecheckRef.current?.cancel();
    };
  }, []);

  const handleImageUpload = async (file: File) => {
    if (!ensureAuthed()) return;
    setIsUploadingImage(true);
    console.log(COMMENT_IMAGE_UPLOAD_LOG, "selection_ok", {
      name: file.name,
      bytes: file.size,
      type: file.type,
    });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        throw new Error("User not authenticated");
      }
      console.log(COMMENT_IMAGE_UPLOAD_LOG, "upload_start", {
        userId: session.user.id,
        bytes: file.size,
      });
      const result = await uploadImage(file, {
        userId: session.user.id,
        kind: "comment",
      });
      setUploadedImage(result);
      console.log(COMMENT_IMAGE_UPLOAD_LOG, "success");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const phase = msg.includes("Supabase Storage")
        ? "upload"
        : msg.includes("not authenticated")
        ? "auth"
        : "preparation_or_unknown";
      console.warn(COMMENT_IMAGE_UPLOAD_LOG, "failed", { phase, message: msg });
      toast.error(mapMediaUploadError(error, "comment"));
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  const removeImage = () => {
    setUploadedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!content.trim() && !uploadedImage) || isSubmitting) return;
    if (!ensureAuthed()) return;

    // Check character limit
    if (content.length > 1000) {
      toast.error("Comment is too long! Maximum 1000 characters allowed.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare images array
      const images = uploadedImage ? [uploadedImage] : [];

      const createdComment = await createComment({
        post_id: postId,
        parent_id: parentId || null,
        content: content.trim(),
        images: images,
      });

      // Notify parent component with comment data
      onComment(content.trim(), parentId || undefined, createdComment);

      // Clear input and image
      setContent("");
      setUploadedImage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error creating comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Non-modal: above BottomTab or flush when scrolled. Modal: floating glass pill (BottomTab-style offset).
  const bottom = isModal ? 0 : hidden ? safeBottom : btHeight + safeBottom;
  const transform = hidden ? "translateY(0)" : "translateY(0)"; // Always visible, just changes position

  /** Fixed aspect in composer so portrait/landscape both crop inside a cornered rectangle (posted comment shows natural aspect). */
  const imagePreviewBlock =
    uploadedImage &&
    (() => {
      const previewSrc =
        imgUrlPublic(uploadedImage) ||
        (uploadedImage.startsWith("blob:") ? uploadedImage : undefined);
      return (
        <div className={`relative w-full ${isModal ? "mt-2" : "mt-3"}`}>
          <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] aspect-[4/3]">
            {previewSrc && (
              <img
                src={previewSrc}
                alt="Comment preview"
                className="h-full w-full object-cover"
              />
            )}
            <button
              type="button"
              onClick={removeImage}
              aria-label="Remove attached image"
              className="absolute right-1.5 top-1.5 z-[1] flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600 transition-colors"
            >
              <PiX size={10} />
            </button>
          </div>
        </div>
      );
    })();

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      onChange={handleFileChange}
      className="hidden"
    />
  );

  if (isModal) {
    const dh = postDetailDismiss?.dismissHandle;
    /** Single source from PostDetailModal: same hook as create flow (vv + Android Capacitor keyboard). */
    const modalKeyboardLiftPx = postDetailDismiss?.modalKeyboardInsetPx ?? 0;
    /**
     * Android WebView already shrinks the modal sheet above the IME — do not lift by raw inset
     * (see BottomDrawer drawerBottomOffsetPx). iOS/non-Android unchanged.
     */
    const liftForBottomChrome = isAndroid()
      ? 0
      : Math.max(0, Math.round(modalKeyboardLiftPx));
    const modalKeyboardOpen =
      modalKeyboardLiftPx >= KEYBOARD_LIFT_SCROLL_THRESHOLD_PX;
    const modalSafeAreaBottom = modalKeyboardOpen
      ? "0px"
      : "var(--safe-area-bottom-layout)";
    const layerMode = modalComposerLayer ?? "viewport-fixed";
    const edgePositionClass =
      layerMode === "layer-absolute"
        ? "absolute left-0 right-0"
        : "fixed left-0 right-0";

    return (
      <>
        <div
          className={`pointer-events-none ${edgePositionClass} bottom-0 z-30`}
          style={{
            bottom: modalKeyboardOpen
              ? "-1px"
              : "calc(-1px + -1 * var(--safe-area-bottom-layout))",
            height: modalKeyboardOpen
              ? `calc(88px + ${liftForBottomChrome}px)`
              : `calc(88px + var(--safe-area-bottom-layout) + ${liftForBottomChrome}px)`,
            width: "100%",
            background: "var(--gradient-from-bottom)",
          }}
          aria-hidden
        />
        <div
          className={`pointer-events-none ${edgePositionClass} z-30 flex flex-col items-center px-2`}
          style={{
            bottom: `calc(${MODAL_COMPOSER_PILL_BOTTOM_GAP_PX}px + ${modalSafeAreaBottom} + ${liftForBottomChrome}px)`,
          }}
        >
          {dh?.visible ? (
            <button
              type="button"
              className={[
                "pointer-events-auto mb-0.5 flex min-w-[48px] items-center justify-center rounded-full touch-none",
                "h-[15px] px-2.5",
                "border border-[color-mix(in_oklab,var(--brand)_45%,var(--border))]",
                "bg-[color-mix(in_oklab,var(--brand)_22%,var(--glass-bg))]",
                "backdrop-blur-[var(--glass-blur)]",
                "shadow-sm",
                "active:scale-[0.97] transition-[transform,box-shadow,filter] duration-150",
                dh.pressed
                  ? "ring-2 ring-[var(--brand)]/50 shadow-md shadow-[var(--brand)]/15 brightness-110"
                  : "hover:brightness-105",
              ].join(" ")}
              style={{ touchAction: "none" }}
              aria-label="Drag up or down to close"
              onPointerDown={dh.onPointerDown}
              onPointerMove={dh.onPointerMove}
              onPointerUp={dh.onPointerUp}
              onPointerCancel={dh.onPointerCancel}
              onLostPointerCapture={dh.onLostPointerCapture}
            >
              <PiCaretUp
                size={11}
                className="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]"
                aria-hidden
              />
            </button>
          ) : null}
          <div
            className={[
              "pointer-events-auto min-w-0 overflow-hidden transition-[box-shadow,filter,border-radius] duration-200",
              POST_DETAIL_GLASS_PILL_WIDTH_CLASS,
              uploadedImage ? "rounded-2xl" : "rounded-full",
              "border border-[var(--bottom-tab-border)]",
              "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
              dh?.pressed
                ? "shadow-lg shadow-black/25 brightness-110 ring-1 ring-[var(--brand)]/30"
                : "shadow-sm",
            ].join(" ")}
            style={{ maxWidth: POST_DETAIL_GLASS_PILL_MAX_WIDTH_PX }}
          >
            <div className="px-1.5 py-1.5 sm:px-2 sm:py-1.5">
              <form onSubmit={handleSubmit} className="min-w-0">
                <div className="grid min-w-0 grid-cols-[auto_1fr_auto_auto] items-center gap-1.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                    {userProfile ? (
                      <Avatar
                        className="inline-flex shrink-0 items-center justify-center leading-none"
                        url={userProfile.avatar_url}
                        name={userProfile.display_name || userProfile.username}
                        size={32}
                      />
                    ) : (
                      <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--text)]/10" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <input
                      ref={composerInputRef}
                      type="text"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={handleModalComposerInputFocus}
                      onBlur={handleModalComposerInputBlur}
                      placeholder={placeholder}
                      className={[
                        "w-full min-w-0 border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] text-base leading-tight text-[var(--text)] placeholder:text-[var(--text)]/45 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40",
                        uploadedImage
                          ? "rounded-xl px-2.5 py-1.5"
                          : "rounded-full px-3 py-1.5",
                      ].join(" ")}
                      maxLength={1000}
                      disabled={isSubmitting}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border)] text-[var(--text)] transition-colors hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUploadingImage ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--text)]/30 border-t-[var(--text)]" />
                    ) : (
                      <PiImage size={18} className="block" />
                    )}
                  </button>
                  <button
                    type="submit"
                    disabled={
                      (!content.trim() && !uploadedImage) || isSubmitting
                    }
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[var(--brand-ink)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send comment"
                  >
                    <PiPaperPlaneRight
                      size={20}
                      className="block shrink-0"
                      aria-hidden
                    />
                  </button>
                </div>
                {hiddenFileInput}
              </form>
              {imagePreviewBlock}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div
      className={`fixed left-0 right-0 z-30 border-t border-[var(--border)] bg-[var(--bg)] transition-all duration-300`}
      style={{
        bottom: `${bottom}px`,
        transform,
      }}
    >
      <div className="px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {userProfile ? (
              <Avatar
                url={userProfile.avatar_url}
                name={userProfile.display_name || userProfile.username}
                size={32}
              />
            ) : (
              <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--text)]/10" />
            )}
          </div>
          <div className="flex-1">
            <input
              ref={composerInputRef}
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => handleComposerFocus(false)}
              onBlur={() => setComposerSurfaceFocused(false)}
              placeholder={placeholder}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              maxLength={1000}
              disabled={isSubmitting}
            />
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingImage}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploadingImage ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--text)]/30 border-t-[var(--text)]" />
            ) : (
              <PiImage size={18} />
            )}
          </button>
          {hiddenFileInput}
          <button
            type="submit"
            disabled={(!content.trim() && !uploadedImage) || isSubmitting}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </form>
        {imagePreviewBlock}
      </div>
    </div>
  );
}
