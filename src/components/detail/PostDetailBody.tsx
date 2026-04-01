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
import { buildCarouselImages } from "../../lib/carouselImages";
import { useNavigate } from "react-router-dom";
import { Paths } from "../../router/Paths";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabaseClient";
import { emitPostChanged } from "../../lib/postEvents";
import { getPostForEdit, deletePost } from "../../api/services/posts";
import toast from "react-hot-toast";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import {
  formatDateSummary,
  formatFinalizeRecurrenceSummaryLine,
  formatFinalizeSelectedDatesSummaryLine,
} from "../../lib/createFlowDateSummary";
import { visibleActivityTagLines } from "../../lib/createFlowLimitUtils";
import { ReadOnlyActivityTagLine } from "./ReadOnlyActivityTagLine";
import { PiListBullets, PiMapPin } from "react-icons/pi";
// [OPTIMIZATION: Phase 3.4] Removed BatchLoadResult - PostgreSQL function provides all data

// ---- Types the component will accept (all extras are optional) ----
// [OPTIMIZATION: Phase 3.4] Post type now extends FeedItem for consistency
export type Post = FeedItem & {
  status?: "draft" | "published";
  visibility?: "public" | "friends" | "private";
  rsvp_capacity?: number | null;
  is_recurring?: boolean | null;
  recurrence_days?: string[] | null;
  // activities (server format) - included in FeedItem but explicitly typed here
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
};

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
  onClose,
  previewHeroOverlay,
  /**
   * Create-flow merged final step: hide the sticky post action bar and post menu;
   * use create-flow top chrome instead. Keeps hero/main layout aligned with `topOffset` 0.
   */
  composeFinalizeShell = false,
  /**
   * Create finalize step: inline caption editor in the post caption slot (replaces static caption).
   */
  composeFinalizeCaption,
  /** Create finalize: metadata row + shared panel (rendered below caption, above inline preview chips). */
  composeFinalizeBelowCaption,
  composeFinalizeStripPreviewMeta = false,
}: {
  post: Post;
  isPreview?: boolean;
  onClose?: () => void;
  /** When `isPreview`, optional node fixed over the hero carousel (e.g. upload status pill). */
  previewHeroOverlay?: ReactNode;
  composeFinalizeShell?: boolean;
  composeFinalizeCaption?: {
    value: string;
    onChange: (next: string) => void;
    /** Hard cap (e.g. finalize publish limit); enforced in onChange + maxLength. */
    maxLength?: number;
    /** Matches create-flow caption-required notice highlight */
    highlight?: boolean;
    /** Brief landing emphasis (fades when parent clears) */
    entryPulse?: boolean;
    /** When false, hero/author/below stay at full prominence (e.g. user tapped outside caption). Default: dim. */
    surroundingDeemphasize?: boolean;
    onCaptionFocusChange?: (focused: boolean) => void;
    /** Rendered inside the caption card below the textarea (e.g. tags field on finalize). */
    belowCaption?: ReactNode;
  };
  composeFinalizeBelowCaption?: ReactNode;
  /** Hide inline tags / schedule / RSVP preview rows (finalize uses caption + metadata row instead). */
  composeFinalizeStripPreviewMeta?: boolean;
  // [OPTIMIZATION: Phase 3.4] Removed batchedData - PostgreSQL function provides all data in post object
}) {
  const navigate = useNavigate();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);

  // Emit post:changed when follow:changed fires for this post's author (sync feed + modal)
  useEffect(() => {
    const handleFollowChange = (e: Event) => {
      const { targetId, status } = (e as CustomEvent).detail || {};
      const authorProfileId = post.author?.id;
      if (!authorProfileId) return;
      if (targetId === authorProfileId && status) {
        emitPostChanged(post.id, { viewerFollowStatus: status });
      }
    };
    window.addEventListener(
      "follow:changed",
      handleFollowChange as EventListener
    );
    return () =>
      window.removeEventListener(
        "follow:changed",
        handleFollowChange as EventListener
      );
  }, [post.id, post.author?.id]);

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

  // HERO images: same URL/order as feed for cache continuity when opening from feed
  const { images: gallery } = buildCarouselImages(post.activities ?? [], 400);

  const tags =
    post.tags && post.tags.length > 0
      ? post.tags
      : [post.type === "experience" ? "Experience" : "Hangout"];

  // Clearance below sticky actions (floating glass bar is shorter than legacy full-width bar).
  // Create finalize step uses CreateFlowTopBar + notice stack instead of StickyPostActions.
  const topOffset = composeFinalizeShell ? "0px" : "46px";
  /** Modal only: small gap so the hero is not flush against the floating pill */
  const heroBelowBarGap = onClose ? "12px" : "0px";

  const finalizeSurroundingsDim =
    composeFinalizeCaption != null &&
    composeFinalizeCaption.surroundingDeemphasize !== false;

  const scheduleDates = (post.selected_dates || []).map((s) => new Date(s));
  const recurrenceCodes = (post.recurrence_days || [])
    .map(String)
    .filter(Boolean);
  const recurringForDisplay =
    Boolean(post.is_recurring) || recurrenceCodes.length > 0;
  const scheduleGroups = formatDateSummary(scheduleDates);
  const scheduleSummaryLine = formatFinalizeSelectedDatesSummaryLine(
    scheduleGroups,
    scheduleDates
  );
  const recurrenceSummaryLine = formatFinalizeRecurrenceSummaryLine(
    recurringForDisplay,
    recurrenceCodes
  );
  const showScheduleBlock =
    (scheduleSummaryLine != null && scheduleSummaryLine.length > 0) ||
    (recurrenceSummaryLine != null && recurrenceSummaryLine.length > 0);

  // --- UI ---
  return (
    <>
      {/* STICKY INTERACTION BAR (hidden on create merged final step — use CreateFlowTopBar) */}
      {!composeFinalizeShell ? (
        <StickyPostActions
          postId={post.id}
          authorId={!anon ? post.author_id : undefined}
          post={post}
          barVariant={onClose ? "floatingGlass" : "default"}
          onClose={onClose}
          postType={post.type}
          caption={post.caption ?? null}
          postImageUrl={gallery.length > 0 ? gallery[0] : null}
          postAuthor={
            !anon && post.author
              ? {
                  id: post.author_id,
                  username: post.author.username ?? null,
                  display_name: post.author.display_name ?? null,
                  avatar_url: post.author.avatar_url ?? null,
                  is_anonymous: false,
                }
              : undefined
          }
          onInvite={handleInvite}
        />
      ) : null}

      {/* Preview: upload pill when hero is empty but images are still uploading */}
      {isPreview && gallery.length === 0 && previewHeroOverlay ? (
        <div
          className={[
            composeFinalizeShell
              ? "relative w-full page-content-wide mb-[0.45rem]"
              : "relative w-full page-content-wide mb-2",
            finalizeSurroundingsDim
              ? "opacity-[0.80] transition-opacity duration-300"
              : "",
          ].join(" ")}
          style={{
            paddingTop: `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap} + 8px)`,
            minHeight: "44px",
          }}
        >
          <div className="pointer-events-none flex justify-center px-2">
            {previewHeroOverlay}
          </div>
        </div>
      ) : null}

      {/* HERO CAROUSEL (contain, lightbox) - aspect-ratio reserves space to avoid layout shift */}
      {gallery.length > 0 && (
        <div
          className={[
            composeFinalizeShell
              ? "relative w-full page-content-wide mb-[0.45rem] min-h-0"
              : "relative w-full page-content-wide mb-2 min-h-0",
            finalizeSurroundingsDim
              ? "opacity-[0.80] transition-opacity duration-300"
              : "",
          ].join(" ")}
          style={{
            aspectRatio: "4/5",
            maxHeight: "50vh",
            paddingTop: `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap})`,
          }}
        >
          <div
            className="absolute left-0 right-0 bottom-0 z-0"
            style={{
              top: `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap})`,
            }}
          >
            <MediaCarousel
              images={gallery}
              fit="contain"
              enableLightbox={!isPreview}
              maxHeight="100%"
              className="h-full"
              autoplay={false}
              interactiveDots={!isPreview}
            />
          </div>
          {isPreview && previewHeroOverlay ? (
            <div
              className="pointer-events-none absolute left-1/2 z-[25] flex w-full max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center px-2"
              style={{
                top: `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap} + 10px)`,
              }}
            >
              {previewHeroOverlay}
            </div>
          ) : null}
        </div>
      )}

      {/* MAIN COLUMN */}
      <div
        className="w-full page-content-wide"
        style={{
          paddingTop:
            gallery.length === 0
              ? `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap})`
              : composeFinalizeShell
              ? "0.9rem"
              : "1rem",
        }}
      >
        {/* Author row */}
        <div
          className={[
            composeFinalizeShell
              ? "mt-[0.675rem] flex items-center gap-3"
              : "mt-3 flex items-center gap-3",
            finalizeSurroundingsDim
              ? "opacity-[0.82] transition-opacity duration-300"
              : "",
          ].join(" ")}
        >
          <Avatar
            url={anon ? undefined : post.author?.avatar_url || undefined}
            name={anon ? post.anonymous_name || "Anonymous" : displayName}
            size={40}
            onClick={anon ? undefined : goToProfile}
            variant={anon ? "anon" : vis === "friends" ? "friends" : "default"}
            postType={post.type}
            anonymousAvatar={anon ? post.anonymous_avatar : undefined}
            userId={anon ? null : post.author_id || null} // [OPTIMIZATION: Phase 3.2] Pass userId for cache lookup
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

          {!composeFinalizeShell ? (
            <div className="ml-auto flex items-center gap-2">
              <PostMenu
                postId={post.id}
                isOwner={isOwner}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isDraft={isDraft}
              />
            </div>
          ) : null}
        </div>

        {/* Caption (read-only, or inline editor on create finalize) */}
        {composeFinalizeCaption ? (
          <section
            id="create-finalize-caption-anchor"
            className={[
              "relative z-[1] mt-[1.125rem] rounded-xl px-3.5 py-4 transition-[box-shadow,ring] duration-700 ease-out",
              composeFinalizeCaption.highlight
                ? "border border-[var(--brand)]/55 shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_35%,transparent),0_0_28px_rgba(247,208,71,0.2),0_12px_36px_rgba(0,0,0,0.35)]"
                : composeFinalizeCaption.entryPulse
                ? "border border-[var(--brand)]/40 shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_28%,transparent),0_0_48px_-4px_rgba(247,208,71,0.22),0_16px_44px_-8px_rgba(0,0,0,0.55)] ring-2 ring-[var(--brand)]/20"
                : [
                    "border border-[var(--border)]/55 bg-[var(--surface)]/24",
                    "shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_18%,transparent),0_2px_14px_rgba(0,0,0,0.05)]",
                    "dark:border-white/32 dark:shadow-[0_4px_24px_rgba(0,0,0,0.32)]",
                  ].join(" "),
            ].join(" ")}
            style={{
              scrollMarginTop:
                "calc(var(--create-flow-top-bar-total, 0px) + var(--create-flow-notice-stack-height, 0px) + 48px)",
            }}
          >
            <label
              htmlFor="create-finalize-caption"
              className="mb-3 block text-[12px] font-semibold tracking-wide text-[var(--text)]/88 dark:text-white/92"
            >
              Write your caption{" "}
              <span className="text-[var(--brand)]" aria-hidden>
                *
              </span>
            </label>
            <div className="relative">
              <textarea
                id="create-finalize-caption"
                value={composeFinalizeCaption.value}
                maxLength={composeFinalizeCaption.maxLength}
                onChange={(e) => {
                  let v = e.target.value;
                  const cap = composeFinalizeCaption.maxLength;
                  if (typeof cap === "number" && v.length > cap) {
                    v = v.slice(0, cap);
                  }
                  composeFinalizeCaption.onChange(v);
                }}
                onFocus={() =>
                  composeFinalizeCaption.onCaptionFocusChange?.(true)
                }
                onBlur={() =>
                  composeFinalizeCaption.onCaptionFocusChange?.(false)
                }
                rows={4}
                placeholder="Say what this is about…"
                className="w-full min-h-[5.75rem] resize-y rounded-lg border border-[var(--border)]/70 bg-[var(--surface)]/10 px-3 pb-7 pt-3 pr-3 text-[15px] leading-snug text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text)]/42 dark:border-white dark:bg-[color-mix(in_oklab,var(--surface)_12%,transparent)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] focus:border-[var(--brand)]/60 focus:shadow-[0_0_0_2px_color-mix(in_oklab,var(--brand)_22%,transparent),0_0_0_1px_rgba(255,255,255,0.08)] dark:focus:border-[var(--brand)]/65 dark:focus:shadow-[0_0_0_2px_color-mix(in_oklab,var(--brand)_24%,transparent),inset_0_1px_0_rgba(255,255,255,0.08)] whitespace-pre-wrap"
                aria-describedby={
                  typeof composeFinalizeCaption.maxLength === "number"
                    ? "create-finalize-caption-count"
                    : undefined
                }
              />
              {typeof composeFinalizeCaption.maxLength === "number" ? (
                <div
                  id="create-finalize-caption-count"
                  className="pointer-events-none absolute bottom-2 right-2.5 text-[10px] tabular-nums text-[var(--text)]/45 dark:text-white/50"
                  aria-live="polite"
                >
                  {composeFinalizeCaption.value.length}/
                  {composeFinalizeCaption.maxLength}
                </div>
              ) : null}
            </div>
            {composeFinalizeCaption.belowCaption}
          </section>
        ) : post.caption ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-snug text-[var(--text)]/90">
            {post.caption}
          </p>
        ) : null}

        {/* Date / Visibility / RSVP: keep full opacity when caption de-emphasizes surroundings */}
        {composeFinalizeBelowCaption ? (
          <div className="mt-3 w-full">{composeFinalizeBelowCaption}</div>
        ) : null}

        <div
          className={
            finalizeSurroundingsDim
              ? "opacity-[0.76] transition-opacity duration-300"
              : "contents"
          }
        >
          {!composeFinalizeStripPreviewMeta ? (
            <>
              {/* Tags section */}
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((t, i) => (
                  <Chip key={`tag-${i}`}>{t}</Chip>
                ))}
              </div>

              {/* Dates & Recurring — same human-readable rules as Finalize (createFlowDateSummary) */}
              {showScheduleBlock && (
                <div className="mt-3">
                  <div className="text-xs text-[var(--text)]/60 mb-2">
                    Schedule
                  </div>
                  {scheduleSummaryLine ? (
                    <p className="text-[11px] leading-snug text-[var(--text)]/75">
                      {scheduleSummaryLine}
                    </p>
                  ) : null}
                  {recurrenceSummaryLine ? (
                    <p
                      className={
                        scheduleSummaryLine
                          ? "mt-1 text-[11px] leading-snug text-[var(--text)]/52"
                          : "text-[11px] leading-snug text-[var(--text)]/52"
                      }
                    >
                      {recurrenceSummaryLine}
                    </p>
                  ) : null}
                </div>
              )}

              {/* RSVP section */}
              {typeof post.rsvp_capacity === "number" &&
                post.type === "hangout" && (
                  <div className="mt-3">
                    <RSVPComponent
                      postId={post.id}
                      capacity={post.rsvp_capacity}
                      className=""
                      rsvpData={post.rsvp_data || undefined}
                      align="left"
                      postAuthor={
                        anon
                          ? { id: post.author_id, is_anonymous: true }
                          : post.author
                          ? {
                              id: post.author_id,
                              username: post.author.username ?? null,
                              display_name: post.author.display_name ?? null,
                              avatar_url: post.author.avatar_url ?? null,
                              is_anonymous: false,
                            }
                          : undefined
                      }
                      post={
                        {
                          tags: post.tags || null,
                          author_id: post.author_id,
                          type: post.type,
                          is_recurring: post.is_recurring ?? null,
                        } as any
                      }
                    />
                  </div>
                )}
            </>
          ) : null}

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

                  // Per-stop lines (exclude "custom" sentinel; matches ActivitiesTagsInput)
                  const activityTagLines = visibleActivityTagLines(
                    Array.isArray(a.tags) ? a.tags : []
                  );

                  const extrasFiltered = Array.isArray(extras)
                    ? extras.filter((x) => x?.title && x?.value)
                    : [];
                  const hasExtras = extrasFiltered.length > 0;
                  const hasLocation = !!(
                    address ||
                    locationNotes ||
                    googleMapsUrl
                  );

                  return (
                    <li key={i} className="relative min-w-0 pl-6">
                      <span
                        className="absolute left-2 top-3 -translate-x-1/2 w-2 h-2 rounded-full bg-white/70"
                        aria-hidden
                      />

                      {/* Stacked lines: pills when short; full-width blocks when long (matches composer) */}
                      <div className="flex w-full min-w-0 flex-col items-start gap-2">
                        {activityTagLines.length > 0 ? (
                          activityTagLines.map(
                            (tag: string, tagIndex: number) => (
                              <ReadOnlyActivityTagLine
                                key={tagIndex}
                                text={tag}
                                isFirst={tagIndex === 0}
                              />
                            )
                          )
                        ) : (
                          <ReadOnlyActivityTagLine
                            text={a.title || `Stop ${i + 1}`}
                            isFirst
                          />
                        )}
                      </div>

                      {/* Location — larger gap from activities */}
                      {hasLocation && (
                        <div className="mt-8 rounded-md border border-[var(--border)] px-3 py-2">
                          <div className="space-y-3">
                            <div>
                              <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text)]/60">
                                <PiMapPin
                                  className="h-3.5 w-3.5 shrink-0 text-[var(--brand)] drop-shadow-[0_0_8px_color-mix(in_oklab,var(--brand)_45%,transparent)]"
                                  aria-hidden
                                />
                                <span>Location (Address & Details)</span>
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
                            {googleMapsUrl && (
                              <GoogleMapsEmbed url={googleMapsUrl} />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Additional info — tighter gap from location than activities→location */}
                      {hasExtras && (
                        <div
                          className={[
                            "rounded-md border border-[var(--border)] px-3 py-2",
                            hasLocation ? "mt-4" : "mt-8",
                          ].join(" ")}
                        >
                          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text)]/60">
                            <PiListBullets
                              className="h-3.5 w-3.5 shrink-0 text-[var(--brand)] drop-shadow-[0_0_8px_color-mix(in_oklab,var(--brand)_45%,transparent)]"
                              aria-hidden
                            />
                            <span>Additional Info</span>
                          </div>
                          <div className="space-y-3">
                            {extrasFiltered.map((x, k) => (
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
      </div>

      {/* Comments Section - Only show if not preview */}
      {!isPreview && (
        <div data-comments-section>
          <CommentList postId={post.id} isModal={!!onClose} />
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
