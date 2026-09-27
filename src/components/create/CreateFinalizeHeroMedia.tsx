import { useEffect, useMemo, useState } from "react";
import { ActivityType } from "../../types/post";
import { buildFinalizeComposerGallery } from "../../lib/carouselImages";
import { isLocalDraftImageUrl } from "../../lib/createDraftImage/localDraftImageUrl";
import {
  buildEphemeralMediaOrderFromActivities,
  shouldUseCreateLocalAwareHero,
} from "../../lib/createFinalizeMediaPresence";
import {
  createLocalVideoPreviewUrl,
  revokeLocalVideoPreviewUrl,
} from "../../lib/createFinalizeVideoPreview";
import { isBlobPreviewUrl } from "../../lib/createDraftVideo/localVideoAsset";
import { hasActivePostVideo } from "../../lib/createPostVideoUpload";
import MediaCarousel from "../MediaCarousel";
import { useCreateFinalizeMediaChrome } from "./CreateFinalizeMediaChromeContext";
import CreateFinalizeMixedMediaCarousel from "./CreateFinalizeMixedMediaCarousel";
import { useCreatePostMedia } from "./CreatePostMediaProvider";

type Props = {
  activities: ActivityType[];
  heroMediaIndex: number;
  onHeroMediaIndexChange: (index: number) => void;
};

const HERO_FRAME =
  "relative isolate h-full w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-black";

export default function CreateFinalizeHeroMedia({
  activities,
  heroMediaIndex,
  onHeroMediaIndexChange,
}: Props) {
  const { videoJob, mediaOrder, createVideoHeavyMediaExclusive } =
    useCreatePostMedia();
  const { mediaDockExpanded, mediaDragActive } = useCreateFinalizeMediaChrome();
  const hasVideo = hasActivePostVideo(videoJob);

  // Remote-only gallery (no local DraftImage sentinels in the render path).
  // LI1D.1: never feed draft-image/* to MediaCarousel as <img src>.
  const gallery = useMemo(() => {
    const images = buildFinalizeComposerGallery(activities ?? [], 400).images;
    // Mixed/local path owns draft-image/* — never hand sentinels to MediaCarousel.
    return images.filter((u) => !isLocalDraftImageUrl(u));
  }, [activities]);

  // LI1D.2: local DraftImages → mixed carousel + useCreateImagePreviewSrc.
  // Detect locals from mediaOrder OR activities (race-safe).
  const useMixed = shouldUseCreateLocalAwareHero({
    hasVideo,
    mediaOrder,
    activities: activities ?? [],
  });

  const mixedOrder = useMemo(() => {
    if (!useMixed) return mediaOrder;
    if (mediaOrder.length > 0) return mediaOrder;
    // Ephemeral order until provider reconcile catches up — not persisted.
    const videoId = videoJob?.localId?.trim() || null;
    return buildEphemeralMediaOrderFromActivities(activities ?? [], videoId);
  }, [useMixed, mediaOrder, activities, videoJob?.localId]);

  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!useMixed) {
      setVideoObjectUrl((prev) => {
        if (isBlobPreviewUrl(prev)) revokeLocalVideoPreviewUrl(prev);
        return null;
      });
      return;
    }

    const nativeOrStored = videoJob?.localPreviewUrl?.trim() || null;
    if (nativeOrStored) {
      setVideoObjectUrl((prev) => {
        if (prev && prev !== nativeOrStored && isBlobPreviewUrl(prev)) {
          revokeLocalVideoPreviewUrl(prev);
        }
        return nativeOrStored;
      });
      return;
    }

    const file = videoJob?.localFile ?? null;
    if (!file) {
      setVideoObjectUrl((prev) => {
        if (isBlobPreviewUrl(prev)) revokeLocalVideoPreviewUrl(prev);
        return null;
      });
      return;
    }

    const url = createLocalVideoPreviewUrl(file);
    setVideoObjectUrl(url);
    return () => {
      revokeLocalVideoPreviewUrl(url);
    };
  }, [useMixed, videoJob?.localFile, videoJob?.localPreviewUrl]);

  if (useMixed && mixedOrder.length > 0) {
    return (
      <div className={HERO_FRAME}>
        <CreateFinalizeMixedMediaCarousel
          mediaOrder={mixedOrder}
          activeIndex={heroMediaIndex}
          onActiveIndexChange={onHeroMediaIndexChange}
          videoJob={videoJob}
          // Publish prepare owns heavy decode — unmount Create preview player.
          videoObjectUrl={
            createVideoHeavyMediaExclusive ? null : videoObjectUrl
          }
          dockExpanded={mediaDockExpanded || createVideoHeavyMediaExclusive}
          mediaDragActive={mediaDragActive}
        />
      </div>
    );
  }

  // Legacy remote-only Create / Edit gallery (no local sentinels).
  if (!useMixed && gallery.length > 0) {
    return (
      <MediaCarousel
        images={gallery}
        fit="contain"
        enableLightbox
        maxHeight="100%"
        className="h-full"
        autoplay={false}
        interactiveDots
        showDots={false}
        activeIndex={heroMediaIndex}
        onActiveIndexChange={onHeroMediaIndexChange}
      />
    );
  }

  return null;
}
