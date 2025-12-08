import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import { Paths } from "../router/Paths";
import { supabase } from "../lib/supabaseClient";
import { useDispatch } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";
import toast from "react-hot-toast";
import { discardAllDrafts } from "../lib/drafts";
import { insertPost, saveDraft } from "../api/services/posts";
import PostDetailBody, {
  Post as DetailPost,
} from "../components/detail/PostDetailBody";
import ActionSheet from "../components/ui/ActionSheet";
import InviteDrawer from "../components/ui/InviteDrawer";

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
  typeof v === "string" && /^https?:\/\//.test(v);

const cleanImages = (arr: unknown): string[] =>
  Array.isArray(arr) ? arr.map(String).filter(isHttpUrl) : [];

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

  // derive visibility/is_anonymous for DB
  const dbVisibility =
    finalMeta.visibility === "friends"
      ? "friends"
      : finalMeta.visibility === "anonymous"
      ? "public"
      : "public"; // default public; anon is handled via is_anonymous
  const isAnonymous = finalMeta.visibility === "anonymous";

  const tags = finalMeta.tags || [];

  const [publishing, setPublishing] = useState(false);
  const [showPostedModal, setShowPostedModal] = useState(false);
  const [newPostId, setNewPostId] = useState<string | null>(null);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);

  const handlePublish = async () => {
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

      // 1) Insert or update post
      let post;
      if (isEditMode && editData.postId) {
        // Update existing post
        const { error: updateErr } = await supabase
          .from("posts")
          .update({
            type: postType === "hangout" ? "hangout" : "experience",
            caption: finalMeta.caption || "", // Use empty string for consistency
            visibility: dbVisibility as "public" | "friends" | "private",
            is_anonymous: isAnonymous,
            anonymous_name: finalMeta.anonymousName || null, // NEW: anonymous name
            anonymous_avatar: finalMeta.anonymousAvatar || null, // NEW: anonymous avatar
            rsvp_capacity:
              finalMeta.rsvpCapacity === ""
                ? null
                : finalMeta.rsvpCapacity ?? null,
            selected_dates: (finalMeta.selectedDates || []).length
              ? finalMeta.selectedDates!
              : null,
            is_recurring: finalMeta.isRecurring ?? null,
            recurrence_days: (finalMeta.recurrenceDays || []).length
              ? finalMeta.recurrenceDays!
              : null,
            tags: tags.length ? tags : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editData.postId);

        if (updateErr) throw updateErr;

        // Get the updated post
        const { data: updatedPost, error: fetchErr } = await supabase
          .from("posts")
          .select("*")
          .eq("id", editData.postId)
          .single();

        if (fetchErr) throw fetchErr;
        post = updatedPost;
      } else {
        // Create new post
        post = await insertPost({
          type: postType === "hangout" ? "hangout" : "experience",
          caption: finalMeta.caption || "",
          visibility: dbVisibility as "public" | "friends" | "private",
          is_anonymous: isAnonymous,
          anonymous_name: finalMeta.anonymousName || null, // NEW: anonymous name
          anonymous_avatar: finalMeta.anonymousAvatar || null, // NEW: anonymous avatar
          rsvp_capacity:
            finalMeta.rsvpCapacity === ""
              ? null
              : finalMeta.rsvpCapacity ?? null,
          selected_dates: (finalMeta.selectedDates || []).length
            ? finalMeta.selectedDates!
            : null,
          is_recurring: finalMeta.isRecurring ?? null,
          recurrence_days: (finalMeta.recurrenceDays || []).length
            ? finalMeta.recurrenceDays!
            : null,
          tags: tags.length ? tags : null,
        });
      }

      setNewPostId(post.id);

      // 2) Insert or update activities
      if (sanitizedActivities.length) {
        if (isEditMode && editData.postId) {
          // Delete existing activities and insert new ones
          const { error: deleteErr } = await supabase
            .from("activities")
            .delete()
            .eq("post_id", editData.postId);

          if (deleteErr) throw deleteErr;
        }

        const items = sanitizedActivities.map(
          (a: DraftActivity, i: number) => ({
            post_id: post.id,
            order_idx: i,
            title:
              a.title ||
              a.customActivity ||
              a.activityType ||
              `Activity ${i + 1}`,
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

      // store preview payload (optional)
      try {
        localStorage.setItem(
          "publishedPostLast",
          JSON.stringify({
            id: post.id,
            type: post.type,
            caption: post.caption,
            tags,
            activities: sanitizedActivities,
          })
        );
      } catch {}

      if (isEditMode) {
        // In edit mode, get the return path before clearing
        const editData = read<any>("editPostData", null);
        const returnPath = editData?.returnPath || "/u/me";

        // Clear edit data
        localStorage.removeItem("editPostData");

        // Navigate back to where we came from
        nav(returnPath);
      } else {
        // In create mode, clear draft data
        discardAllDrafts();
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
        is_anonymous: isAnonymous,
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
              a.title ||
              a.customActivity ||
              a.activityType ||
              `Activity ${i + 1}`,
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return nav(Paths.profile);
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle();
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
    // Try to route to /u/:username; fallback to /u/me
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return nav(Paths.profile);
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.username) return nav(`/u/${profile.username}`);
    return nav("/u/me");
  };

  useEffect(() => {
    if (!meta.caption && sanitizedActivities.length === 0) {
      nav(`${Paths.createTitle}?type=${postType}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    display_name?: string;
    username?: string;
    avatar_url?: string;
  }>({
    display_name: localStorage.getItem("my_display_name") || undefined,
    username: localStorage.getItem("my_username") || undefined,
    avatar_url: localStorage.getItem("my_avatar_url") || undefined,
  });

  useEffect(() => {
    const getCurrentUserProfile = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        // Get user profile from profiles table (same as BottomTab)
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("user_id", session.user.id)
          .single();

        if (!error && profile) {
          setCurrentUserProfile(profile);
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
      }
    };
    getCurrentUserProfile();

    // React to profile updates (same as BottomTab)
    const onUpdated = () => getCurrentUserProfile();
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, []);

  // Build a PostDetailBody-compatible object from drafts
  const previewPost: DetailPost = {
    id: "draft",
    type: postType === "hangout" ? "hangout" : "experience",
    caption: meta.caption ?? "",
    created_at: new Date().toISOString(),
    author_id: "me",
    author: {
      display_name: currentUserProfile.display_name ?? "You",
      username: currentUserProfile.username ?? "you",
      avatar_url: currentUserProfile.avatar_url ?? null,
    },
    tags: tags.length ? tags : undefined,
    activities: sanitizedActivities.map((a: DraftActivity, i: number) => ({
      title:
        a.title || a.customActivity || a.activityType || `Activity ${i + 1}`,
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
    // NEW: Add metadata for preview
    visibility:
      finalMeta.visibility === "anonymous" ? "public" : finalMeta.visibility,
    is_anonymous: isAnonymous,
    anonymous_name: finalMeta.anonymousName || null, // NEW: anonymous name
    anonymous_avatar: finalMeta.anonymousAvatar || null, // NEW: anonymous avatar
    rsvp_capacity:
      finalMeta.rsvpCapacity === "" ? null : finalMeta.rsvpCapacity ?? null,
    selected_dates: finalMeta.selectedDates || null,
    is_recurring: finalMeta.isRecurring || null,
    recurrence_days: finalMeta.recurrenceDays || null,
  };

  return (
    <PrimaryPageContainer back>
      {/* Use same max width & padding as detail page */}
      <div
        ref={contentRef}
        className="flex-1 w-full page-content-wide"
        style={{ paddingTop: 12, paddingBottom: 20 }}
      >
        <PostDetailBody post={previewPost} isPreview={true} />
      </div>

      <ActionSheet
        onBack={() => nav(`${Paths.createCategories}?type=${postType}`)}
        onPublish={handlePublish}
        onSaveDraft={undefined} // Disable until database is updated
        publishing={publishing}
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

      {/* Posted modal */}
      {showPostedModal && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-[var(--surface)]/60 backdrop-blur-sm"
            onClick={goToProfile}
          />
          <div className="relative mx-auto px-4">
            <div className="mt-24 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl max-w-[680px]">
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[var(--text)] font-semibold text-base">
                    🎉 Posted!
                  </h3>
                  <button
                    onClick={goToProfile}
                    className="text-[var(--text)]/70 hover:text-[var(--text)] text-sm px-2"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-[var(--text)]/80 text-sm mt-1">
                  Nice! Your post is live.
                </p>
                {/* Subtle separator line */}
                <div className="border-t border-[var(--border)]/30 my-4"></div>
                <div className="space-y-3">
                  {/* First row: Share and Invite */}
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          // Get the current URL for the post
                          const postUrl = window.location.href;
                          const shareData = {
                            title: `Check out this ${
                              postType === "hangout" ? "hangout" : "experience"
                            }`,
                            url: postUrl,
                          };

                          // Try to use the Web Share API if available
                          if (
                            navigator.share &&
                            navigator.canShare &&
                            navigator.canShare(shareData)
                          ) {
                            await navigator.share(shareData);
                          } else {
                            // Fallback: copy to clipboard
                            await navigator.clipboard.writeText(postUrl);
                            console.log("Link copied to clipboard");
                          }
                        } catch (error) {
                          console.error("Error sharing:", error);
                        }
                      }}
                      className="flex-1 bg-white text-black py-2 rounded-full text-sm font-medium hover:bg-gray-100 transition border border-[var(--border)]/50"
                    >
                      Share
                    </button>
                    <button
                      onClick={() => {
                        setShowInviteDrawer(true);
                      }}
                      className="flex-1 bg-[var(--brand)] text-[var(--brand-ink)] py-2 rounded-full text-sm font-medium hover:brightness-110 transition border border-[var(--brand)]"
                    >
                      Invite
                    </button>
                  </div>
                  {/* Subtle separator line */}
                  <div className="border-t border-[var(--border)]/30 my-3"></div>
                  {/* Second row: Done */}
                  <button
                    onClick={goToProfile}
                    className="w-full border border-[var(--border)] text-[var(--text)] py-2 rounded-full text-sm hover:bg-white/5 transition bg-transparent"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
    </PrimaryPageContainer>
  );
}
