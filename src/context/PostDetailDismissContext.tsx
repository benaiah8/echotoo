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
};

export const PostDetailDismissContext =
  createContext<PostDetailDismissContextValue | null>(null);

export function usePostDetailDismiss() {
  return useContext(PostDetailDismissContext);
}
