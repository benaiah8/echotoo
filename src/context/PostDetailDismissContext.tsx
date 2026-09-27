import { createContext, useContext } from "react";

export type PostDetailDismissHandleBindings = {
  visible: boolean;
  /** True while pointer is down on the dismiss handle */
  pressed: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) => void;
};

export type PostDetailDismissContextValue = {
  setComposerFocused: (v: boolean) => void;
  dismissHandle: PostDetailDismissHandleBindings;
  /**
   * Post-detail modal only: keyboard overlap (px) for fixed bottom chrome, from
   * {@link useCreateKeyboardInset} — single subscription per modal.
   */
  modalKeyboardInsetPx: number;
  /**
   * PV2B.1: report PublishedMediaFullscreenViewer open/closed so Detail
   * swipe/back/backdrop dismiss stay nested under fullscreen.
   */
  setPublishedMediaFullscreenOpen: (open: boolean) => void;
  /**
   * Register the active fullscreen close callback (local UI only — no route nav).
   * Cleared when fullscreen unmounts / closes.
   */
  registerPublishedMediaFullscreenClose: (
    close: (() => void) | null,
  ) => void;
  /**
   * Arm a short same-gesture click-through guard after fullscreen closes so
   * finishing pointer/click cannot dismiss Post Detail.
   */
  armPublishedMediaFullscreenClickThroughGuard: () => void;
  /**
   * Pass 3E: register sync capture that runs before Detail route close
   * (while Detail player is still mounted).
   */
  registerFeedReturnPlaybackCapture: (capture: (() => void) | null) => void;
};

export const PostDetailDismissContext =
  createContext<PostDetailDismissContextValue | null>(null);

export function usePostDetailDismiss() {
  return useContext(PostDetailDismissContext);
}
