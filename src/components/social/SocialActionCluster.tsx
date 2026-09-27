import { useCallback, useRef } from "react";
import SocialDuoPill from "./SocialDuoPill";
import SocialGroupPill from "./SocialGroupPill";
import { useDuoSocialAction } from "../../hooks/useDuoSocialAction";
import { useGroupSocialAction } from "../../hooks/useGroupSocialAction";
import { useSocialActionAttention } from "../../hooks/useSocialActionAttention";
import { markSocialSourceNoticedThisSession } from "../../lib/social/socialActionAttention";
import type { GroupUpSourceScheduleContext } from "../../lib/groupUpActiveOverlayStore";
import type { FeedItem } from "../../api/queries/getPublicFeed";
import {
  socialContrastShelfClassName,
  socialContrastShelfClusterClassName,
  socialContrastShelfRowClassName,
  socialRailBareRowClassName,
} from "../../lib/socialActionUi";
import {
  socialShelfSurfaceAllowsBleed,
  type SocialShelfSurface,
} from "../../lib/social/socialShelfSurface";
import { useSocialShelfSurface } from "../../lib/social/socialShelfSurfaceContext";

/**
 * Shared Duo + Group cluster. Feed + Detail share the same hooks/stores.
 * Pills stay mounted while resolving (stable footprint); plate may shimmer.
 *
 * Presentation: TWO separate yellow pills on one inverse contrast shelf.
 * Feed + Profile: decorative right-edge bleed (::after + app-container clip).
 * Detail: local shelf only.
 */
export default function SocialActionCluster({
  postId,
  postType,
  post,
  sourceCaption,
  sourceSchedule,
  variant = "feed",
  className = "",
}: {
  postId: string;
  postType?: "experience" | "hangout" | null;
  post?: FeedItem | null;
  sourceCaption?: string | null;
  sourceSchedule?: GroupUpSourceScheduleContext | null;
  variant?: "feed" | "detailDock" | "compact";
  className?: string;
}) {
  const clusterRef = useRef<HTMLDivElement>(null);
  const shelfSurfaceCtx = useSocialShelfSurface();
  const duo = useDuoSocialAction({
    postId,
    postType,
    post,
    origin: variant,
  });
  const group = useGroupSocialAction({
    postId,
    postType,
    post,
    sourceCaption,
    sourceSchedule,
  });

  const shelfResolving =
    (duo.visible && duo.resolving) || (group.visible && group.resolving);
  const bothReal =
    (!duo.visible || !duo.resolving) && (!group.visible || !group.resolving);
  const attentionEnabled =
    (variant === "feed" || variant === "detailDock") &&
    duo.visible &&
    group.visible &&
    bothReal &&
    !duo.resolving &&
    !group.resolving;

  useSocialActionAttention({
    enabled: attentionEnabled,
    sourceId: postId,
    clusterRef,
  });

  const onDuoPress = useCallback(() => {
    markSocialSourceNoticedThisSession(postId);
    void duo.onPress();
  }, [duo, postId]);

  const onGroupPress = useCallback(() => {
    markSocialSourceNoticedThisSession(postId);
    group.onPress();
  }, [group, postId]);

  if (!duo.visible && !group.visible) return null;

  const size =
    variant === "compact"
      ? "compact"
      : variant === "detailDock"
        ? "dock"
        : "feed";

  const shelfSurface: SocialShelfSurface =
    variant === "detailDock" ? "detail" : shelfSurfaceCtx;
  const edgeBleed = socialShelfSurfaceAllowsBleed(shelfSurface);
  /** Detail dock: full capsule; Feed/Profile: open-right bleed shelf. */
  const shelfPill = !edgeBleed;
  const rowCompact = variant === "detailDock" || variant === "compact";
  /** Home Event rail: pills only — no inverse white/black shelf plate. */
  const bareRail = shelfSurface === "rail";

  return (
    <div
      ref={clusterRef}
      className={socialContrastShelfClusterClassName(className)}
      data-social-action-cluster={variant}
      data-social-shelf-surface={shelfSurface}
      data-social-contrast-shelf={
        bareRail ? "none" : edgeBleed ? "bleed" : "pill"
      }
      data-tour-target={variant === "feed" ? "duo-group" : undefined}
    >
      {bareRail ? null : (
        <span
          className={socialContrastShelfClassName({ bleed: edgeBleed })}
          aria-hidden
          data-social-contrast-shelf-plate
          data-social-shelf-resolving={shelfResolving ? "true" : undefined}
        />
      )}

      <div
        className={
          bareRail
            ? socialRailBareRowClassName()
            : socialContrastShelfRowClassName({
                compact: rowCompact,
                pill: shelfPill,
              })
        }
      >
        {duo.visible ? (
          <SocialDuoPill
            active={duo.active}
            resolving={duo.resolving}
            onPress={onDuoPress}
            size={size}
          />
        ) : null}
        {group.visible ? (
          <SocialGroupPill
            displayCount={group.displayCount}
            active={group.ownsActive}
            resolving={group.resolving}
            onPress={onGroupPress}
            size={size}
          />
        ) : null}
      </div>
    </div>
  );
}
