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
import { scrollCommentsSectionIntoView } from "../../lib/postDetailCommentsScroll";
import useAuthActionGate from "../../hooks/useAuthActionGate";

const COMMENT_IMAGE_UPLOAD_LOG = "[CommentImageUpload]";

/** Align with useCreateKeyboardInset — keyboard "open" for follow-up scroll. */
const KEYBOARD_LIFT_SCROLL_THRESHOLD_PX = 48;

function mapCommentImageUploadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("not authenticated")) return msg;
  if (msg.includes("Supabase Storage"))
    return "Could not upload image. Try again.";
  return "Could not prepare image. Try a different photo.";
}

interface Props {
  postId: string;
  parentId?: string | null;
  onComment: (content: string, parentId?: string, commentData?: any) => void;
  onCancel?: () => void;
  placeholder?: string;
  /** When true (e.g. post detail modal), ignores BottomTab height and scroll-hide logic */
  isModal?: boolean;
  /** One-shot: focus composer after open (e.g. feed comment icon). iOS may still require a tap for IME. */
  autoFocusComposer?: boolean;
  /** Registers imperative focus for sticky bar / parent (cleared on unmount). */
  onFocusComposerReady?: (focus: () => void) => void;
}

export default function FloatingCommentInput({
  postId,
  parentId,
  onComment,
  onCancel,
  placeholder = "This is where we add the comment",
  isModal = false,
  autoFocusComposer = false,
  onFocusComposerReady,
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

  const scheduleScrollCommentsIntoView = useCallback(
    (modal: boolean, behavior: ScrollBehavior = "smooth") => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollCommentsSectionIntoView({
            isModal: modal,
            behavior,
            block: "start",
          });
        });
      });
    },
    []
  );

  const focusComposer = useCallback(() => {
    composerInputRef.current?.focus({ preventScroll: true });
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
      el.focus({ preventScroll: true });
      // scrollIntoView on fixed input does not scroll the sheet; onFocus scrolls comments.
    }, 180);
    return () => clearTimeout(tid);
  }, [autoFocusComposer, isModal]);

  /** Modal: when IME inset crosses "open", snap comments into view (viewport shrank). */
  useEffect(() => {
    if (!isModal || !composerSurfaceFocused) return;
    const lift = postDetailDismiss?.modalKeyboardInsetPx ?? 0;
    const prev = prevKeyboardLiftRef.current;
    prevKeyboardLiftRef.current = lift;
    if (prev >= KEYBOARD_LIFT_SCROLL_THRESHOLD_PX) return;
    if (lift < KEYBOARD_LIFT_SCROLL_THRESHOLD_PX) return;
    const t = window.setTimeout(() => {
      scrollCommentsSectionIntoView({
        isModal: true,
        behavior: "auto",
        block: "start",
      });
    }, 0);
    return () => clearTimeout(t);
  }, [isModal, composerSurfaceFocused, postDetailDismiss?.modalKeyboardInsetPx]);

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
      toast.error(mapCommentImageUploadError(error));
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

    return (
      <>
        <div
          className="pointer-events-none fixed bottom-0 left-0 right-0 z-30"
          style={{
            bottom: "calc(-1px + -1 * var(--safe-area-bottom-layout))",
            height: `calc(88px + var(--safe-area-bottom-layout) + ${modalKeyboardLiftPx}px)`,
            width: "100%",
            background: "var(--gradient-from-bottom)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none fixed left-0 right-0 z-30 flex flex-col items-center px-2 transition-all duration-300"
          style={{
            bottom: `calc(8px + var(--safe-area-bottom-layout) + ${modalKeyboardLiftPx}px)`,
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
                  <div className="flex h-8 items-center justify-center">
                    {userProfile ? (
                      <Avatar
                        className="inline-flex shrink-0 items-center justify-center leading-none"
                        url={userProfile.avatar_url}
                        name={userProfile.display_name || userProfile.username}
                        size={28}
                      />
                    ) : (
                      <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-[var(--text)]/10" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <input
                      ref={composerInputRef}
                      type="text"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={() => {
                        postDetailDismiss?.setComposerFocused(true);
                        setComposerSurfaceFocused(true);
                        prevKeyboardLiftRef.current =
                          postDetailDismiss?.modalKeyboardInsetPx ?? 0;
                        scheduleScrollCommentsIntoView(true, "smooth");
                      }}
                      onBlur={() => {
                        postDetailDismiss?.setComposerFocused(false);
                        setComposerSurfaceFocused(false);
                        prevKeyboardLiftRef.current = 0;
                      }}
                      placeholder={placeholder}
                      className={[
                        "w-full min-w-0 border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] text-sm leading-tight text-[var(--text)] placeholder:text-[var(--text)]/45 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40",
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
              onFocus={() => {
                setComposerSurfaceFocused(true);
                scheduleScrollCommentsIntoView(false, "smooth");
              }}
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
