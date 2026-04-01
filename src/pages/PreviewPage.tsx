import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateFlowKeyboardShell, {
  createFlowPreviewColumnStyle,
} from "../components/create/CreateFlowKeyboardShell";
import { Paths, postDetailPath } from "../router/Paths";
import { supabase } from "../lib/supabaseClient";
import { useDispatch } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";
import { getViewerAuthUserId } from "../api/services/follows";
import toast from "react-hot-toast";
import { discardAllDrafts } from "../lib/drafts";
import { saveDraft } from "../api/services/posts";
import PostDetailBody, {
  Post as DetailPost,
} from "../components/detail/PostDetailBody";
import { useCreatePostMedia } from "../components/create/CreatePostMediaProvider";
import ActionSheet from "../components/ui/ActionSheet";
import PreviewUploadOverlayPill from "../components/ui/PreviewUploadOverlayPill";
import InviteDrawer from "../components/ui/InviteDrawer";
import PostedSuccessModal from "../components/ui/PostedSuccessModal";
import { executeCreateFlowPublish } from "../lib/createFlowPublish";

const BOTTOM_NAV_H = 56;
const GAP_BELOW_ACTIONS = 4;

type DraftMeta = {
  caption?: string;
  tags?: string[];
  visibility?: "public" | "friends" | "anonymous"; // UI uses 'anonymous'
  rsvpCapacity?: number | null | "";
  selectedDates?: string[]; // ISO
  isRecurring?: boolean;
  recurrenceDays?: string[]; // ["MO","TU",...]
  anonymousName?: string; // NEW: anonymous name for anonymous posts
  anonymousAvatar?: string; // NEW: anonymous avatar (letter/number/emoji)
};

type DraftActivity = {
  title?: string;
  activityType?: string;
  customActivity?: string;
  locationDesc?: string;
  location?: string;
  locationNotes?: string;
  locationUrl?: string;
  tags?: string[];
  images?: unknown[];
  additionalInfo?: { title: string; value: string }[];
};

function read<T>(key: string, def: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : def;
  } catch {
    return def;
  }
}

const isHttpUrl = (v: unknown): v is string =>
  typeof v === "string" &&
  (/^https?:\/\//.test(v) || (v.includes("/") && v.includes(".")));

const isCloudinaryUrl = (u: string) => u.includes("res.cloudinary.com");

/**
 * Prepare images for storage in activities.images.
 * Drops Cloudinary URLs (causing 401s); keeps Supabase and other non-Cloudinary.
 * If dropping Cloudinary would leave empty, log warning and return [].
 */
const cleanImages = (arr: unknown): string[] => {
  const valid = Array.isArray(arr) ? arr.map(String).filter(isHttpUrl) : [];
  const nonCloudinary = valid.filter((u) => !isCloudinaryUrl(u));
  const hadCloudinary = valid.some(isCloudinaryUrl);
  if (hadCloudinary && nonCloudinary.length === 0) {
    console.warn(
      "[PreviewPage] Dropping Cloudinary-only images (would store empty); backfill later",
      { droppedCount: valid.length, first: valid[0]?.substring(0, 80) }
    );
    return [];
  }
  return hadCloudinary ? nonCloudinary : valid;
};

export default function PreviewPage() {
  const nav = useNavigate();
  const dispatch = useDispatch();
  const [q] = useSearchParams();

  // Check if we're in edit mode first
  const editData = read<any>("editPostData", null);
  const isEditMode = editData !== null;

  // Determine post type - use edit data if available, otherwise use URL param
  const postType = isEditMode
    ? ((editData.type || "experience").toLowerCase() as
        | "experience"
        | "hangout")
    : ((q.get("type") || "experience").toLowerCase() as
        | "experience"
        | "hangout");

  // meta & activities
  const meta = read<DraftMeta>("draftMeta", {});
  const activities = read<DraftActivity[]>("draftActivities", []);

  // Use edit data if available, otherwise use draft data
  const finalMeta = isEditMode
    ? {
        caption: editData.caption ?? "", // Use nullish coalescing to preserve empty strings
        tags: editData.tags || [],
        visibility: editData.visibility || "public",
        rsvpCapacity: editData.rsvp_capacity || null,
        selectedDates: editData.selected_dates || [],
        isRecurring: editData.is_recurring || false,
        recurrenceDays: editData.recurrence_days || [],
        anonymousName: editData.anonymous_name || undefined,
        anonymousAvatar: editData.anonymous_avatar || undefined,
      }
    : meta;

  const finalActivities = isEditMode ? editData.activities || [] : activities;

  // sanitize images once
  const sanitizedActivities = useMemo(
    () =>
      (finalActivities || []).map((a: DraftActivity, i: number) => ({
        ...a,
        images: cleanImages(a?.images),
        _idx: i,
      })),
    [finalActivities]
  );

  // derive visibility for DB (public | friends | private)
  const dbVisibility =
    finalMeta.visibility === "friends" ? "friends" : "public";

  const tags = finalMeta.tags || [];

  // [LAUNCH] Defensive: always submit as non-anonymous; anonymous posting disabled
  const ANONYMOUS_GUARD = {
    is_anonymous: false,
    anonymous_name: null as string | null,
    anonymous_avatar: null as string | null,
  };

  const [publishing, setPublishing] = useState(false);
  const [showPostedModal, setShowPostedModal] = useState(false);
  const [newPostId, setNewPostId] = useState<string | null>(null);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);

  const { hasPendingUploads, jobs } = useCreatePostMedia();

  const previewUploadingCount = useMemo(
    () => jobs.filter((j) => j.status === "uploading").length,
    [jobs]
  );

  const handlePublish = async () => {
    if (hasPendingUploads) {
      console.log("[PreviewPage] publish blocked: post image uploads pending");
      toast.error("Images are still uploading. Please wait before publishing.");
      return;
    }
    setPublishing(true);
    try {
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      if (!session) {
        dispatch?.(setAuthModal(true));
        toast?.error?.("Please sign in to continue");
        return;
      }

      const rsvpCap =
        finalMeta.rsvpCapacity === "" ? null : finalMeta.rsvpCapacity ?? null;

      const { post } = await executeCreateFlowPublish({
        postType: postType === "hangout" ? "hangout" : "experience",
        caption: finalMeta.caption || "",
        tags,
        visibility: dbVisibility === "friends" ? "friends" : "public",
        rsvpCapacity: typeof rsvpCap === "number" ? rsvpCap : null,
        selectedDatesIso: (finalMeta.selectedDates || []).length
          ? finalMeta.selectedDates!
          : [],
        isRecurring: !!finalMeta.isRecurring,
        recurrenceDays: finalMeta.recurrenceDays || [],
        activities: sanitizedActivities as DraftActivity[],
        isEditMode,
        editPostId: isEditMode ? editData.postId : undefined,
      });

      setNewPostId(post.id);

      if (isEditMode) {
        localStorage.removeItem("draftMeta");
        localStorage.removeItem("draftActivities");
        discardAllDrafts();

        const editDataAfter = read<any>("editPostData", null);
        const returnPath = editDataAfter?.returnPath || "/u/me";
        localStorage.removeItem("editPostData");
        nav(returnPath);
      } else {
        console.log("[PreviewPage] posted success modal opened");
        setShowPostedModal(true);
      }
    } catch (err) {
      console.error("[Preview] Publish failed", err);
      toast?.error?.("Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (hasPendingUploads) {
      console.log(
        "[PreviewPage] save draft blocked: post image uploads pending"
      );
      toast.error(
        "Images are still uploading. Please wait before saving your draft."
      );
      return;
    }
    setPublishing(true);
    try {
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      if (!session) {
        dispatch?.(setAuthModal(true));
        toast?.error?.("Please sign in to continue");
        return;
      }

      // Save as draft (always create new, never update existing)
      const post = await saveDraft({
        type: postType === "hangout" ? "hangout" : "experience",
        caption: finalMeta.caption || "",
        visibility: dbVisibility as "public" | "friends" | "private",
        ...ANONYMOUS_GUARD,
        rsvp_capacity:
          finalMeta.rsvpCapacity === "" ? null : finalMeta.rsvpCapacity ?? null,
        selected_dates: (finalMeta.selectedDates || []).length
          ? finalMeta.selectedDates!
          : null,
        is_recurring: finalMeta.isRecurring ?? null,
        recurrence_days: (finalMeta.recurrenceDays || []).length
          ? finalMeta.recurrenceDays!
          : null,
        tags: tags.length ? tags : null,
        status: "draft", // Explicitly set as draft
      });

      // Insert activities for draft
      if (sanitizedActivities.length) {
        const items = sanitizedActivities.map(
          (a: DraftActivity, i: number) => ({
            post_id: post.id,
            order_idx: i,
            title:
              a.title || a.customActivity || a.activityType || `Stop ${i + 1}`,
            activity_type: a.activityType ?? null,
            custom_activity: a.customActivity ?? null,
            location_name: a.location ?? null,
            location_desc: a.locationDesc ?? null,
            location_url: a.locationUrl ?? null,
            location_notes: a.locationNotes ?? null,
            additional_info: a.additionalInfo ?? null,
            tags: a.tags ?? null,
            images: cleanImages(a.images),
          })
        );
        const { error: actErr } = await supabase
          .from("activities")
          .insert(items);
        if (actErr) throw actErr;
      }

      // Clear draft data after saving
      if (isEditMode) {
        localStorage.removeItem("editPostData");
      } else {
        discardAllDrafts();
      }

      toast?.success?.("Draft saved successfully!");
      // Navigate to profile to see the saved draft
      const userId = await getViewerAuthUserId();
      if (!userId) return nav(Paths.profile);

      // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() for caching and deduplication
      const { getProfileByUserId } = await import("../api/services/follows");
      const profile = await getProfileByUserId(userId);
      if (profile?.username) return nav(`/u/${profile.username}`);
      return nav("/u/me");
    } catch (err) {
      console.error("[Preview] Save draft failed", err);
      toast?.error?.("Save draft failed");
    } finally {
      setPublishing(false);
    }
  };

  const goToProfile = async () => {
    setShowPostedModal(false);
    try {
      localStorage.removeItem("draftMeta");
      localStorage.removeItem("draftActivities");
      discardAllDrafts();
      console.log(
        "[PreviewPage] create-flow draft cleared after posted modal dismissal"
      );
    } catch {
      /* ignore */
    }
    // Try to route to /u/:username; fallback to /u/me
    const userId = await getViewerAuthUserId();
    if (!userId) return nav(Paths.profile);

    // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() for caching and deduplication
    const { getProfileByUserId } = await import("../api/services/follows");
    const profile = await getProfileByUserId(userId);
    if (profile?.username) return nav(`/u/${profile.username}`);
    return nav("/u/me");
  };

  // measure sheet width with the column
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentW, setContentW] = useState<number | null>(null);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => setContentW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const SHEET_H = 64;

  // Get current user profile using same efficient strategy as BottomTab
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    id?: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  }>({
    display_name: localStorage.getItem("my_display_name") || undefined,
    username: localStorage.getItem("my_username") || undefined,
    avatar_url: localStorage.getItem("my_avatar_url") || undefined,
  });

  /** Auth user id for preview post.author_id (never use sentinel "me" — breaks profiles.user_id queries) */
  const [viewerAuthUserId, setViewerAuthUserId] = useState<string | null>(null);

  useEffect(() => {
    const getCurrentUserProfile = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authId = session?.user?.id ?? null;
      setViewerAuthUserId(authId);

      if (!session?.user) {
        return;
      }

      // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() for caching and deduplication
      const { getProfileByUserId } = await import("../api/services/follows");
      const profile = await getProfileByUserId(session.user.id);

      if (profile) {
        setCurrentUserProfile({
          id: profile.id,
          display_name: profile.display_name ?? undefined,
          username: profile.username ?? undefined,
          avatar_url: profile.avatar_url ?? undefined,
        });
        // Cache for next mount to avoid flicker (same as BottomTab)
        if (profile.display_name) {
          localStorage.setItem("my_display_name", profile.display_name);
        }
        if (profile.username) {
          localStorage.setItem("my_username", profile.username);
        }
        if (profile.avatar_url) {
          localStorage.setItem("my_avatar_url", profile.avatar_url);
        }
      }
    };
    getCurrentUserProfile();

    // React to profile updates (same as BottomTab)
    const onUpdated = () => getCurrentUserProfile();
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, []);

  const captionTrimmed = (finalMeta.caption ?? "").trim();
  const captionMissing = captionTrimmed.length === 0;

  useEffect(() => {
    if (captionMissing) {
      nav(`${Paths.createCategories}?type=${postType}`, { replace: true });
    }
  }, [captionMissing, postType, nav]);

  if (captionMissing) {
    return (
      <PrimaryPageContainer back capacitorNotchScrim>
        <CreateFlowKeyboardShell>
          <div
            className="flex min-h-[50vh] w-full items-center justify-center px-4 text-center text-sm text-[var(--text)]/65"
            aria-live="polite"
          >
            Taking you back to add a caption…
          </div>
        </CreateFlowKeyboardShell>
      </PrimaryPageContainer>
    );
  }

  // Build a PostDetailBody-compatible object from drafts
  const previewPost: DetailPost = {
    id: "draft",
    type: postType === "hangout" ? "hangout" : "experience",
    caption: finalMeta.caption ?? "",
    created_at: new Date().toISOString(),
    author_id: viewerAuthUserId ?? "",
    author: {
      id: currentUserProfile.id ?? "",
      display_name: currentUserProfile.display_name ?? "You",
      username: currentUserProfile.username ?? "you",
      avatar_url: currentUserProfile.avatar_url ?? null,
    },
    tags: tags.length ? tags : undefined,
    activities: sanitizedActivities.map((a: DraftActivity, i: number) => ({
      title: a.title || a.customActivity || a.activityType || `Stop ${i + 1}`,
      images: Array.isArray(a.images) ? (a.images as string[]) : [],
      order_idx: i,
      location_name: a.location ?? null,
      location_desc: a.locationDesc ?? null,
      // NEW: Google Maps and location details
      location_url: a.locationUrl || null,
      location_notes: a.locationNotes || null,
      // NEW: additional_info from draft
      additional_info: a.additionalInfo || null,
      // NEW: activity tags (multiple activities within this activity section)
      tags: a.tags || null,
    })),
    // [LAUNCH] Preview always non-anonymous; anonymous posting disabled
    visibility: dbVisibility,
    is_anonymous: false,
    anonymous_name: null,
    anonymous_avatar: null,
    rsvp_capacity:
      finalMeta.rsvpCapacity === "" ? null : finalMeta.rsvpCapacity ?? null,
    selected_dates: finalMeta.selectedDates || null,
    is_recurring: finalMeta.isRecurring || null,
    recurrence_days: finalMeta.recurrenceDays || null,
  };

  return (
    <PrimaryPageContainer back capacitorNotchScrim>
      <CreateFlowKeyboardShell>
        {/* Use same max width & padding as detail page */}
        <div
          ref={contentRef}
          className="flex-1 w-full page-content-wide"
          style={createFlowPreviewColumnStyle}
        >
          <PostDetailBody
            post={previewPost}
            isPreview={true}
            previewHeroOverlay={
              previewUploadingCount > 0 ? (
                <PreviewUploadOverlayPill
                  uploadingCount={previewUploadingCount}
                />
              ) : undefined
            }
          />
        </div>

        <ActionSheet
          onBack={() => nav(`${Paths.createCategories}?type=${postType}`)}
          onPublish={handlePublish}
          onSaveDraft={undefined} // Disable until database is updated
          publishing={publishing}
          lockActionsWhilePendingUploads={hasPendingUploads}
          backText="Back"
          publishText={isEditMode ? "Republish" : "Publish"}
          isEditMode={isEditMode}
          onExit={
            isEditMode
              ? () => {
                  // Get the return path before clearing edit data
                  const editData = read<any>("editPostData", null);
                  const returnPath = editData?.returnPath || "/u/me";

                  // Clear edit data
                  localStorage.removeItem("editPostData");

                  // Navigate back
                  nav(returnPath);
                }
              : undefined
          }
        />

        <PostedSuccessModal
          open={showPostedModal}
          onDismiss={() => void goToProfile()}
          onShareClick={async () => {
            try {
              if (!newPostId) return;
              const postUrl = `${window.location.origin}${postDetailPath(
                postType === "hangout" ? "hangout" : "experience",
                newPostId
              )}`;
              const shareData = {
                title: `Check out this ${
                  postType === "hangout" ? "hangout" : "experience"
                }`,
                url: postUrl,
              };

              if (
                navigator.share &&
                navigator.canShare &&
                navigator.canShare(shareData)
              ) {
                await navigator.share(shareData);
              } else {
                await navigator.clipboard.writeText(postUrl);
                console.log("Link copied to clipboard");
              }
            } catch (error) {
              console.error("Error sharing:", error);
            }
          }}
          onInviteClick={() => setShowInviteDrawer(true)}
        />

        {/* Invite Drawer */}
        {newPostId && (
          <InviteDrawer
            isOpen={showInviteDrawer}
            onClose={() => setShowInviteDrawer(false)}
            postId={newPostId}
            postType={postType === "hangout" ? "hangout" : "experience"}
            postCaption={finalMeta.caption || "Untitled"}
            onClosingChange={setIsInviteDrawerClosing}
          />
        )}
      </CreateFlowKeyboardShell>
    </PrimaryPageContainer>
  );
}
