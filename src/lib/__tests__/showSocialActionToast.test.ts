import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: {
    custom: vi.fn((..._args: unknown[]) => {
      const opts = _args[1] as { id?: string } | undefined;
      return opts?.id ?? "generated";
    }),
    dismiss: vi.fn(),
  },
}));

import toast from "react-hot-toast";
import {
  SOCIAL_ACTION_TOASTER_ID,
  SOCIAL_ACTION_TOAST_DURATION_MS,
  __hasSocialActionDismissTimerForTests,
  __isSocialActionDismissTimerPausedForTests,
  __resetSocialActionDismissTimersForTests,
  cancelSocialActionAutoDismiss,
  dismissSocialActionToast,
  pauseSocialActionDismissTimer,
  resumeSocialActionDismissTimer,
  showSocialActionToast,
} from "../showSocialActionToast";

const toastCustom = vi.mocked(toast.custom);
const toastDismiss = vi.mocked(toast.dismiss);

type ToastRenderProps = {
  onDismiss?: () => void;
  onSwipeExitStart?: () => void;
  onGestureActiveChange?: (active: boolean) => void;
  primaryAction?: { onClick: () => void };
  dismissAction?: { onClick: () => void };
};

function renderToastProps(id: string): ToastRenderProps {
  const render = toastCustom.mock.calls[0]?.[0] as unknown as (t: {
    id: string;
    visible: boolean;
  }) => { props: ToastRenderProps };
  return render({ id, visible: true }).props;
}

describe("showSocialActionToast independent dismiss timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastCustom.mockClear();
    toastDismiss.mockClear();
    __resetSocialActionDismissTimersForTests();
    toastCustom.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { id?: string } | undefined;
      return opts?.id ?? "generated";
    });
  });

  afterEach(() => {
    __resetSocialActionDismissTimersForTests();
    vi.useRealTimers();
  });

  it("R: auto dismiss after 6500ms", () => {
    showSocialActionToast({ id: "pair-up-join:p1", title: "Hi" });
    vi.advanceTimersByTime(SOCIAL_ACTION_TOAST_DURATION_MS - 1);
    expect(toastDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(toastDismiss).toHaveBeenCalledWith(
      "pair-up-join:p1",
      SOCIAL_ACTION_TOASTER_ID
    );
  });

  it("T: short-duration toast", () => {
    showSocialActionToast({
      id: "group-up-withdrawn:o1",
      title: "Removed",
      durationMs: 2200,
    });
    vi.advanceTimersByTime(2200);
    expect(toastDismiss).toHaveBeenCalledWith(
      "group-up-withdrawn:o1",
      SOCIAL_ACTION_TOASTER_ID
    );
  });

  it("S: replacement resets timer", () => {
    showSocialActionToast({ id: "pair-up-join:p1", title: "One" });
    vi.advanceTimersByTime(4000);
    showSocialActionToast({ id: "pair-up-join:p1", title: "Two" });
    vi.advanceTimersByTime(4000);
    expect(toastDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2500);
    expect(toastDismiss).toHaveBeenCalledTimes(1);
  });

  it("U: manual dismiss clears timer", () => {
    showSocialActionToast({ id: "open-plan-join:p2", title: "Plan" });
    dismissSocialActionToast("open-plan-join:p2");
    expect(__hasSocialActionDismissTimerForTests("open-plan-join:p2")).toBe(
      false
    );
    toastDismiss.mockClear();
    vi.advanceTimersByTime(SOCIAL_ACTION_TOAST_DURATION_MS + 100);
    expect(toastDismiss).not.toHaveBeenCalled();
  });

  it("V: no orphan timer after dismiss", () => {
    showSocialActionToast({ id: "group-up-request:g1", title: "Sent" });
    dismissSocialActionToast("group-up-request:g1");
    expect(__hasSocialActionDismissTimerForTests("group-up-request:g1")).toBe(
      false
    );
  });

  it("W: swipe exit start clears timer; onDismiss dismisses once", () => {
    showSocialActionToast({ id: "pair-up-join:p4", title: "Duo" });
    const props = renderToastProps("pair-up-join:p4");

    props.onSwipeExitStart?.();
    expect(__hasSocialActionDismissTimerForTests("pair-up-join:p4")).toBe(
      false
    );
    expect(toastDismiss).not.toHaveBeenCalled();

    props.onDismiss?.();
    expect(toastDismiss).toHaveBeenCalledTimes(1);
    expect(toastDismiss).toHaveBeenCalledWith(
      "pair-up-join:p4",
      SOCIAL_ACTION_TOASTER_ID
    );
  });

  it("preserves remaining time across pause/resume", () => {
    showSocialActionToast({ id: "pair-up-join:p5", title: "Duo" });
    vi.advanceTimersByTime(2000);
    pauseSocialActionDismissTimer("pair-up-join:p5");
    expect(__isSocialActionDismissTimerPausedForTests("pair-up-join:p5")).toBe(
      true
    );

    vi.advanceTimersByTime(10_000);
    expect(toastDismiss).not.toHaveBeenCalled();

    resumeSocialActionDismissTimer("pair-up-join:p5");
    expect(__isSocialActionDismissTimerPausedForTests("pair-up-join:p5")).toBe(
      false
    );
    vi.advanceTimersByTime(4499);
    expect(toastDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(toastDismiss).toHaveBeenCalledWith(
      "pair-up-join:p5",
      SOCIAL_ACTION_TOASTER_ID
    );
  });

  it("gesture active pause/resume wired from toast props", () => {
    showSocialActionToast({ id: "pair-up-join:p6", title: "Duo" });
    const props = renderToastProps("pair-up-join:p6");
    props.onGestureActiveChange?.(true);
    expect(__isSocialActionDismissTimerPausedForTests("pair-up-join:p6")).toBe(
      true
    );
    props.onGestureActiveChange?.(false);
    expect(__isSocialActionDismissTimerPausedForTests("pair-up-join:p6")).toBe(
      false
    );
  });

  it("cancelSocialActionAutoDismiss does not dismiss toast", () => {
    showSocialActionToast({ id: "pair-up-join:p7", title: "Duo" });
    cancelSocialActionAutoDismiss("pair-up-join:p7");
    expect(__hasSocialActionDismissTimerForTests("pair-up-join:p7")).toBe(
      false
    );
    expect(toastDismiss).not.toHaveBeenCalled();
  });

  it("onDismiss does not run Undo", () => {
    const undo = vi.fn();
    showSocialActionToast({
      id: "pair-up-join:p8",
      title: "Duo",
      dismissAction: { ariaLabel: "Undo", icon: null, onClick: undo },
    });
    renderToastProps("pair-up-join:p8").onDismiss?.();
    expect(undo).not.toHaveBeenCalled();
  });
});
