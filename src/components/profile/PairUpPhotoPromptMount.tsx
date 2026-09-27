import { useSyncExternalStore } from "react";
import ProfilePhotoPromptOverlay from "./ProfilePhotoPromptOverlay";
import {
  closePairUpPhotoPrompt,
  continuePairUpPhotoPrompt,
  getPairUpPhotoPromptState,
  isPostJoinPhotoPromptIntent,
  subscribePairUpPhotoPrompt,
  updatePairUpPhotoPromptPhotos,
} from "../../lib/pairUpPhotoPromptStore";
import { SOCIAL_OVERLAY_LAYER } from "../../lib/socialOverlayLayers";

/**
 * App-level singleton mount for social photo encouragement.
 * Wired from AppFloatingChrome; state lives in pairUpPhotoPromptStore.
 *
 * Layer: photoGate (z-150) above Source Groups / Duo sheets (130–140).
 * Underlying social overlays stay mounted; scroll lock is ref-counted.
 */
export default function PairUpPhotoPromptMount() {
  const prompt = useSyncExternalStore(
    subscribePairUpPhotoPrompt,
    getPairUpPhotoPromptState,
  );

  if (!prompt.open || !prompt.profileId || !prompt.userId) {
    return null;
  }

  const postJoin = isPostJoinPhotoPromptIntent(prompt.intentKey);

  return (
    <ProfilePhotoPromptOverlay
      open
      profileId={prompt.profileId}
      userId={prompt.userId}
      photos={prompt.photos}
      title={prompt.title}
      description={prompt.description}
      overlayClassName={SOCIAL_OVERLAY_LAYER.photoGate}
      acquisitionPortalClassName={SOCIAL_OVERLAY_LAYER.photoGateAcquisition}
      continueLabel={postJoin ? "Done" : undefined}
      continueAnywayLabel={postJoin ? "Done" : undefined}
      onPhotosChanged={updatePairUpPhotoPromptPhotos}
      onContinue={continuePairUpPhotoPrompt}
      onClose={closePairUpPhotoPrompt}
    />
  );
}
