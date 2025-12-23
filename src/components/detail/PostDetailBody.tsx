// src/components/detail/PostDetailBody.tsx
import MediaCarousel from "../../components/MediaCarousel";
import Avatar from "../ui/Avatar";
import FollowButton from "../ui/FollowButton";
import GoogleMapsEmbed from "../ui/GoogleMapsEmbed";
import RSVPComponent from "../ui/RSVPComponent";
import PostMenu from "../ui/PostMenu";
import PostActions from "../ui/PostActions";
import StickyPostActions from "../ui/StickyPostActions";
import InviteDrawer from "../ui/InviteDrawer";
import CommentList from "../ui/CommentList";
import { imgUrlPublic } from "../../lib/img";
import { useNavigate } from "react-router-dom";
import { Paths } from "../../router/Paths";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { getPostForEdit, deletePost } from "../../api/services/posts";
import toast from "react-hot-toast";
import { type BatchLoadResult } from "../../lib/batchDataLoader";

// ---- Types the component will accept (all extras are optional) ----
export type Post = {
  id: string;
  type: "experience" | "hangout";
  caption: string | null;
  created_at: string;
  author_id: string;
  status?: "draft" | "published";
  is_anonymous?: boolean; // NEW: anonymous flag
  anonymous_name?: string | null; // NEW: anonymous name
  anonymous_avatar?: string | null; // NEW: anonymous avatar

  // author info
  author?: {
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  };

  // activities (server format)
  activities: {
    title: string | null;
    images: string[] | null;
    order_idx: number | null;
    location_name?: string | null;
    location_desc?: string | null;
    // Google Maps and location details
    location_url?: string | null;
    location_notes?: string | null;
    // optional advanced meta
    additional_info?: { title: string; value: string }[] | null;
    // activity tags (multiple activities within this activity section)
    tags?: string[] | null;
  }[];

  // tags
  tags?: string[];

  // optional visibility/anon (rendered if present)
  visibility?: "public" | "friends" | "private";

  // optional schedule & RSVP (rendered if present)
  selected_dates?: string[] | null; // ISO strings
  is_recurring?: boolean | null;
  recurrence_days?: string[] | null; // e.g., ["Mon","Tue"] or ["MO","TU"]
  rsvp_capacity?: number | null;
};

// Map possible day codes to short labels
const DAY_LABEL: Record<string, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
  Mon: "Mon",
  Tue: "Tue",
  Wed: "Wed",
  Thu: "Thu",
  Fri: "Fri",
  Sat: "Sat",
  Sun: "Sun",
};

function formatDate(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  // Keep DD/MM/YYYY feel to match your screenshots
  return dt.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 py-1 rounded-full text-xs border border-[var(--border)] text-[var(--text)]/90">
      {children}
    </span>
  );
}

export default function PostDetailBody({
  post,
  isPreview = false,
  batchedData,
}: {
  post: Post;
  isPreview?: boolean;
  // [OPTIMIZATION: Phase 1 - Batch] Batched data for components
  batchedData?: BatchLoadResult | null;
}) {
  const navigate = useNavigate();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);

  // Get current user ID to check if it's the author
  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setCurrentUserId(session?.user?.id || null);
    };
    getCurrentUser();
  }, []);

  const isOwner = currentUserId === post.author_id;
  const isDraft = post.status === "draft";

  const handleEdit = async () => {
    try {
      const postData = await getPostForEdit(post.id);
      if (postData) {
        // Store the post data in localStorage for edit mode
        localStorage.setItem("editPostData", JSON.stringify(postData));
        // Navigate to the creation flow
        navigate(Paths.createActivities);
      }
    } catch (error) {
      console.error("Error loading post for edit:", error);
      toast.error("Failed to load post for editing");
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this post?")) {
      try {
        await deletePost(post.id);
        toast.success("Post deleted successfully");
        // Navigate back to home or profile
        navigate(Paths.home);
      } catch (error) {
        console.error("Error deleting post:", error);
        toast.error("Failed to delete post");
      }
    }
  };

  const handleInvite = () => {
    if (!isDraft) {
      setShowInviteDrawer(true);
    }
  };

  const vis = post.visibility || "public";
  const anon = Boolean(post.is_anonymous);

  const displayName =
    anon && post.anonymous_name
      ? post.anonymous_name
      : post.author?.display_name || post.author?.username || "User";

  const goToProfile = () => {
    const slug = post.author?.username || post.author_id || "";
    if (slug) navigate(Paths.user.replace(":username", slug));
  };

  // HERO images (safe URLs)
  const gallery = (post.activities ?? [])
    .flatMap((a) => (Array.isArray(a.images) ? a.images : []))
    .filter(Boolean)
    .map((url) => imgUrlPublic(url) || url) as string[];

  const tags =
    post.tags && post.tags.length > 0
      ? post.tags
      : [post.type === "experience" ? "Experience" : "Hangout"];

  // Normalize weekly recurrence list
  const recurrenceDays = (post.recurrence_days || [])
    .map((d) => DAY_LABEL[d] || d)
    .filter(Boolean);

  const selectedDates = (post.selected_dates || []).map((s) => formatDate(s));

  // --- UI ---
  return (
    <>
      {/* STICKY INTERACTION BAR */}
      <StickyPostActions
        postId={post.id}
        authorId={!anon ? post.author_id : undefined}
        batchedData={batchedData}
      />

      {/* HERO CAROUSEL (contain, lightbox) */}
      {gallery.length > 0 && (
        <div className="w-full page-content-wide pt-20 mb-2">
          <MediaCarousel
            images={gallery}
            fit="contain"
            enableLightbox
            maxHeight="50vh"
          />
        </div>
      )}

      {/* MAIN COLUMN */}
      <div
        className={`w-full page-content-wide ${
          gallery.length === 0 ? "pt-20" : "pt-4"
        }`}
      >
        {/* Author row */}
        <div className="mt-3 flex items-center gap-3">
          <Avatar
            url={anon ? undefined : post.author?.avatar_url || undefined}
            name={anon ? post.anonymous_name || "Anonymous" : displayName}
            size={40}
            onClick={anon ? undefined : goToProfile}
            variant={anon ? "anon" : vis === "friends" ? "friends" : "default"}
            postType={post.type}
            anonymousAvatar={anon ? post.anonymous_avatar : undefined}
          />

          <div className="min-w-0">
            <button
              className="text-sm font-medium hover:underline"
              onClick={anon ? undefined : goToProfile}
            >
              {anon ? post.anonymous_name || "Anonymous" : displayName}
            </button>
            <div className="text-xs text-[var(--text)]/60">
              {anon ? "" : `@${post.author?.username || "user"} · `}
              {new Date(post.created_at).toLocaleDateString()}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {isOwner && (
              <PostMenu
                postId={post.id}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isDraft={isDraft}
              />
            )}
          </div>
        </div>

        {/* Caption */}
        {post.caption && (
          <p className="mt-3 text-[15px] leading-snug text-[var(--text)]/90">
            {post.caption}
          </p>
        )}

        {/* Tags section */}
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((t, i) => (
            <Chip key={`tag-${i}`}>{t}</Chip>
          ))}
        </div>

        {/* Dates & Recurring section */}
        {(selectedDates.length > 0 || recurrenceDays.length > 0) && (
          <div className="mt-3">
            <div className="text-xs text-[var(--text)]/60 mb-2">Schedule</div>
            <div className="flex flex-wrap gap-2">
              {selectedDates.map((date, i) => (
                <Chip key={`date-${i}`}>{date}</Chip>
              ))}
              {recurrenceDays.length > 0 && (
                <Chip>Every {recurrenceDays.join(", ")}</Chip>
              )}
            </div>
          </div>
        )}

        {/* RSVP section */}
        {typeof post.rsvp_capacity === "number" && post.type === "hangout" && (
          <div className="mt-3">
            {/* RSVP Component for hangout posts */}
            <RSVPComponent
              postId={post.id}
              capacity={post.rsvp_capacity}
              className=""
              rsvpData={batchedData?.rsvpData.get(post.id)}
              align="left"
              postAuthor={{
                id: post.author_id,
                username: post.author?.username,
                display_name: post.author?.display_name,
                avatar_url: post.author?.avatar_url,
                is_anonymous: post.is_anonymous,
              }}
            />
          </div>
        )}

        {/* Divider */}
        <div className="mt-4 border-t border-[var(--border)]" />

        {/* Activities */}
        <div className="mt-3 text-sm font-semibold">Activities</div>
        <section className="mt-2">
          <div className="relative">
            {/* vertical rail (light) */}
            <div
              className="absolute left-2 top-0 bottom-0 w-px bg-white/12"
              aria-hidden
            />
            <ol className="space-y-6">
              {(post.activities ?? []).map((a, i) => {
                const extras = (a.additional_info || []) as {
                  title: string;
                  value: string;
                }[];

                const address = a.location_name || "";
                const details = a.location_desc || "";
                const locationNotes = a.location_notes || "";
                const googleMapsUrl = a.location_url || "";

                // Get activity tags (multiple activities within this activity section)
                const activityTags = a.tags || [];

                return (
                  <li key={i} className="relative pl-6">
                    <span
                      className="absolute left-2 top-3 -translate-x-1/2 w-2 h-2 rounded-full bg-white/70"
                      aria-hidden
                    />

                    {/* Show all activities from this section */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      {activityTags.length > 0 ? (
                        activityTags.map((tag: string, tagIndex: number) => (
                          <span
                            key={tagIndex}
                            className="px-2.5 py-1 rounded-full text-xs bg-[var(--surface)]/40 text-[var(--text)]/90 border border-[var(--border)]"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <div className="font-medium text-[var(--text)]/95">
                          {a.title || `Activity ${i + 1}`}
                        </div>
                      )}
                    </div>

                    {/* Location information grouped in single box */}
                    {(address || locationNotes || googleMapsUrl) && (
                      <div className="mt-2 rounded-md border border-[var(--border)] px-3 py-2">
                        <div className="space-y-3">
                          {(address || locationNotes || googleMapsUrl) && (
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-[var(--text)]/60 mb-1">
                                Location (Address & Details)
                              </div>
                              {address && (
                                <div className="text-xs text-[var(--text)]/85 mb-2">
                                  {address}
                                </div>
                              )}
                              {locationNotes && (
                                <div className="text-xs text-[var(--text)]/85 mb-2">
                                  {locationNotes}
                                </div>
                              )}
                            </div>
                          )}
                          {googleMapsUrl && (
                            <GoogleMapsEmbed url={googleMapsUrl} />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Additional info section */}
                    {Array.isArray(extras) &&
                      extras.filter((x) => x?.title && x?.value).length > 0 && (
                        <div className="mt-2 rounded-md border border-[var(--border)] px-3 py-2">
                          <div className="text-[11px] uppercase tracking-wide text-[var(--text)]/60 mb-2">
                            Additional Info
                          </div>
                          <div className="space-y-3">
                            {extras
                              .filter((x) => x?.title && x?.value)
                              .map((x, k) => (
                                <div key={k} className="flex flex-col">
                                  <div className="text-xs text-[var(--text)]/85 font-medium mb-1">
                                    {x.title}:
                                  </div>
                                  <div className="text-xs text-[var(--text)]/85 leading-relaxed">
                                    {x.value}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>

      {/* Comments Section - Only show if not preview */}
      {!isPreview && (
        <div data-comments-section>
          <CommentList postId={post.id} />
        </div>
      )}

      {/* Invite Drawer */}
      <InviteDrawer
        isOpen={showInviteDrawer}
        onClose={() => setShowInviteDrawer(false)}
        postId={post.id}
        postType={post.type}
        postCaption={post.caption || ""}
        onClosingChange={setIsInviteDrawerClosing}
      />
    </>
  );
}
