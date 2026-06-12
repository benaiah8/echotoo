/**
 * Personal invite thread drawer (P2): viewer + composer when allowed.
 */

import React, {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import BottomDrawer from "../ui/BottomDrawer";
import {
  getInviteThreadForViewer,
  postInviteThreadMessage,
  toggleInviteMessageReaction,
  type InviteThreadBundle,
} from "../../api/services/inviteThreads";
import { getViewerAuthUserId } from "../../api/services/follows";
import { Paths } from "../../router/Paths";

/** Glass textarea — compact footer variant; matches InviteDrawer message box tokens. */
const glassInputStyle: CSSProperties = {
  backgroundColor: "color-mix(in oklab, var(--glass-bg) 75%, var(--bg))",
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
  borderColor: "var(--glass-active-border, var(--border))",
};

const footerMessageBoxClass =
  "flex-1 min-h-[2.25rem] max-h-[5.25rem] resize-y rounded-xl pl-2.5 pr-16 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text)]/40 focus:outline-none focus:ring-2 focus:ring-primary/25";

const footerMessageBoxStyle: CSSProperties = {
  ...glassInputStyle,
  borderWidth: 1,
  borderStyle: "solid",
  boxShadow: "inset 0 1px 0 color-mix(in oklab, var(--text) 6%, transparent)",
};

/** Inline draft presets; sender still uses Send and server quota/rules. */
const QUICK_REPLY_CHIPS = [
  "I'm in",
  "Maybe",
  "What time?",
  "Send details",
  "Convince me",
] as const;

function rpcLikeMessage(error: unknown, fallback: string): string {
  if (typeof (error as { message?: string })?.message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Must be personal thread id when opening */
  threadId: string | null;
};

export default function PersonalInviteThreadDrawer({
  open,
  onClose,
  threadId,
}: Props) {
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<InviteThreadBundle | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(
    null,
  );
  const [reactionError, setReactionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !threadId) {
      setBundle(null);
      setError(null);
      setLoading(false);
      setDraft("");
      setSubmitError(null);
      setSubmitting(false);
      setReactingMessageId(null);
      setReactionError(null);
      return;
    }

    setDraft("");
    setSubmitError(null);
    setSubmitting(false);
    setReactingMessageId(null);
    setReactionError(null);

    let cancelled = false;
    setLoading(true);
    setError(null);
    setBundle(null);

    (async () => {
      try {
        const uid = await getViewerAuthUserId();
        if (cancelled) return;
        setViewerUserId(uid);
        const { data, error: rpcError } = await getInviteThreadForViewer(
          threadId,
        );
        if (cancelled) return;
        if (rpcError) {
          setError(rpcLikeMessage(rpcError, "Could not load invite chat."));
          setLoading(false);
          return;
        }
        if (!data) {
          setError("Could not load invite chat.");
          setLoading(false);
          return;
        }
        setBundle(data);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not load invite chat.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, threadId]);

  const bodyLimit =
    bundle != null && bundle.thread.max_body_length > 0
      ? bundle.thread.max_body_length
      : 400;

  const trimmedDraft = draft.trim();
  const draftTooLong = draft.length > bodyLimit;
  const sendDisabled =
    submitting ||
    !bundle?.can_compose ||
    trimmedDraft.length === 0 ||
    draftTooLong;

  const handleSend = useCallback(async () => {
    if (!threadId || !bundle?.can_compose || submitting || sendDisabled) return;
    const body = trimmedDraft;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const { error: postErr } = await postInviteThreadMessage(threadId, body);
      if (postErr) {
        setSubmitError(rpcLikeMessage(postErr, "Could not send message."));
        return;
      }

      const { data: refreshed, error: reloadErr } =
        await getInviteThreadForViewer(threadId);
      if (reloadErr) {
        setDraft("");
        setSubmitError(
          rpcLikeMessage(
            reloadErr,
            "Message sent but could not refresh the chat.",
          ),
        );
        return;
      }
      if (!refreshed) {
        setDraft("");
        setSubmitError("Message sent but could not refresh the chat.");
        return;
      }

      setBundle(refreshed);
      setDraft("");
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Could not send message.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [threadId, bundle?.can_compose, submitting, sendDisabled, trimmedDraft]);

  const reactionsInteractive =
    bundle != null &&
    !bundle.is_expired &&
    !bundle.blocked_pair &&
    bundle.thread.closed_at == null;

  const handleReactionToggle = useCallback(
    async (messageId: string) => {
      if (!reactionsInteractive) return;
      setReactionError(null);
      setReactingMessageId(messageId);
      try {
        const { data, error } = await toggleInviteMessageReaction(
          messageId,
          "thumb_up",
        );
        if (error || !data) {
          console.warn(
            "[PersonalInviteThreadDrawer] toggle reaction:",
            error ?? "no data",
          );
          setReactionError(
            rpcLikeMessage(error ?? {}, "Couldn't update reaction."),
          );
          return;
        }

        const targetId = data.message_id;
        setBundle((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === targetId
                ? {
                    ...m,
                    thumb_up_count: data.thumb_up_count,
                    viewer_has_thumb_up: data.viewer_has_thumb_up,
                  }
                : m,
            ),
          };
        });
      } catch (e) {
        console.warn("[PersonalInviteThreadDrawer] toggle reaction:", e);
        setReactionError(
          e instanceof Error ? e.message : "Couldn't update reaction.",
        );
      } finally {
        setReactingMessageId(null);
      }
    },
    [reactionsInteractive],
  );

  const linkToPost = bundle?.post_peek.post_id
    ? `${Paths.experience}/${bundle.post_peek.post_id}`
    : null;

  const readOnlyExplanation = (): string[] => {
    if (!bundle || bundle.can_compose) return [];
    const bits: string[] = [];
    if (bundle.blocked_pair) bits.push("This chat is read-only (restricted).");
    if (bundle.thread.closed_at != null) bits.push("This thread was closed.");
    if (bundle.is_expired) bits.push("This thread has expired.");
    if (bundle.my_messages_remaining <= 0)
      bits.push("You've used all your messages in this chat.");
    if (bits.length === 0) bits.push("This chat is read-only.");
    return Array.from(new Set(bits));
  };

  const footerStatus =
    open && threadId && bundle ? (
      <div className="border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-2)_90%,transparent)] px-4 pt-2 pb-3">
        <div className="space-y-1 pb-2">
          <div className="text-xs text-[var(--text)]/70">
            {bundle.can_compose
              ? `${bundle.my_messages_used} sent · ${
                  bundle.my_messages_remaining
                } message${
                  bundle.my_messages_remaining === 1 ? "" : "s"
                } left · ${bodyLimit} character max`
              : readOnlyExplanation().join(" ")}
          </div>
          {bundle.thread.expires_at && !bundle.is_expired && (
            <div className="text-[10px] text-[var(--text)]/50">
              Ends{" "}
              {formatDistanceToNow(new Date(bundle.thread.expires_at), {
                addSuffix: true,
              })}
            </div>
          )}
          {bundle.is_expired && bundle.thread.expires_at && (
            <div className="text-[10px] text-amber-600/85">
              Expired{" "}
              {formatDistanceToNow(new Date(bundle.thread.expires_at), {
                addSuffix: true,
              })}
            </div>
          )}
        </div>

        {submitError ? (
          <p className="mb-2 text-xs text-red-500/95" role="alert">
            {submitError}
          </p>
        ) : null}

        {bundle.can_compose ? (
          <>
            <div
              className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-0.5 scroll-hide [-webkit-overflow-scrolling:touch]"
              role="toolbar"
              aria-label="Quick replies"
            >
              {QUICK_REPLY_CHIPS.map((label) => (
                <button
                  key={label}
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setDraft(label);
                    setSubmitError(null);
                  }}
                  className="shrink-0 rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-2)_85%,transparent)] px-3 py-1 text-xs text-[var(--text)]/85 hover:bg-[var(--surface-2)] disabled:pointer-events-none disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative flex gap-2 pb-3">
              <div className="relative min-w-0 flex-1">
                <textarea
                  value={draft}
                  disabled={submitting}
                  placeholder="Write a message…"
                  aria-label="Message"
                  rows={2}
                  className={footerMessageBoxClass}
                  style={footerMessageBoxStyle}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (submitError) setSubmitError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey) return;
                    if (sendDisabled) return;
                    e.preventDefault();
                    void handleSend();
                  }}
                />
                <span
                  className="pointer-events-none absolute bottom-2 right-2 tabular-nums text-[10px] text-[var(--text)]/40"
                  aria-live="polite"
                >
                  {draft.length}/{bodyLimit}
                </span>
              </div>
              <button
                type="button"
                disabled={sendDisabled}
                onClick={() => void handleSend()}
                className="mt-auto shrink-0 self-end rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-[var(--brand-ink)] disabled:pointer-events-none disabled:opacity-50"
              >
                {submitting ? "…" : "Send"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    ) : undefined;

  return (
    <BottomDrawer
      open={open}
      onClose={onClose}
      title="Invite chat"
      maxHeight="85vh"
      showCloseButton
      shrinkSheetToContent
      className="!inset-x-1.5 sm:!inset-x-2"
      contentClassName="px-4 pt-2 pb-2 sm:px-5 min-h-0"
      footer={footerStatus}
    >
      {!threadId ? null : loading ? (
        <div className="py-8 text-center text-sm text-[var(--text)]/60">
          Loading…
        </div>
      ) : error ? (
        <div className="py-6 text-center text-sm text-red-500/90">{error}</div>
      ) : bundle ? (
        <div className="flex min-h-0 flex-col gap-3">
          <div
            className="rounded-xl border border-[var(--glass-active-border,var(--border))] bg-[color-mix(in_oklab,var(--glass-bg)_60%,var(--surface-2))] p-3"
            style={{
              backdropFilter: "blur(var(--glass-blur))",
            }}
          >
            <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/45">
              {bundle.post_peek.post_type === "hangout"
                ? "Event"
                : bundle.post_peek.post_type === "experience"
                ? "Experience"
                : "Post"}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-[var(--text)]">
              {bundle.post_peek.post_caption?.trim() || "Untitled"}
            </p>
            {linkToPost && (
              <Link
                to={linkToPost}
                state={{ backgroundLocation: location }}
                className="mt-2 inline-block rounded-full px-3 py-1 text-xs text-blue-500 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                onClick={onClose}
              >
                View Post
              </Link>
            )}
          </div>

          {bundle.invite.invite_note != null &&
          String(bundle.invite.invite_note).trim().length > 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/90 p-3">
              <div className="text-[10px] font-medium text-[var(--text)]/50">
                Invite note
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text)]/85">
                {bundle.invite.invite_note}
              </p>
            </div>
          ) : null}

          <div>
            <div className="mb-2 text-xs font-medium text-[var(--text)]/55">
              Messages
            </div>
            {reactionError ? (
              <p className="mb-2 text-xs text-red-500/95" role="alert">
                {reactionError}
              </p>
            ) : null}
            {bundle.messages.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text)]/50">
                No messages yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {bundle.messages.map((m) => {
                  const mine =
                    viewerUserId != null && m.sender_user_id === viewerUserId;
                  return (
                    <li
                      key={m.id}
                      className={`flex ${
                        mine ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                          mine
                            ? "bg-primary/20 text-[var(--text)] border border-primary/25"
                            : "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {m.body}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-[var(--text)]/45">
                            {formatDistanceToNow(new Date(m.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                          {reactionsInteractive ? (
                            <button
                              type="button"
                              disabled={reactingMessageId === m.id}
                              aria-pressed={m.viewer_has_thumb_up === true}
                              aria-label={
                                (m.thumb_up_count ?? 0) > 0
                                  ? `Thumbs up, ${m.thumb_up_count ?? 0}`
                                  : "Thumbs up"
                              }
                              onClick={() => void handleReactionToggle(m.id)}
                              className={`inline-flex min-h-[1.375rem] items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-opacity disabled:pointer-events-none disabled:opacity-50 ${
                                m.viewer_has_thumb_up
                                  ? "border-primary/45 bg-primary/15 text-[var(--text)]"
                                  : "border-[color-mix(in_oklab,var(--border)_80%,transparent)] bg-[color-mix(in_oklab,var(--surface-2)_70%,transparent)] text-[var(--text)]/60 hover:text-[var(--text)]"
                              }`}
                            >
                              👍
                              {(m.thumb_up_count ?? 0) > 0 ? (
                                <span className="tabular-nums text-[var(--text)]/85">
                                  {m.thumb_up_count}
                                </span>
                              ) : null}
                            </button>
                          ) : typeof m.thumb_up_count === "number" &&
                            m.thumb_up_count > 0 ? (
                            <span className="text-[10px] text-[var(--text)]/45">
                              👍 {m.thumb_up_count}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!bundle.can_compose && (
            <p className="text-center text-xs text-[var(--text)]/50">
              Messaging and reactions are read-only here for now.
            </p>
          )}
        </div>
      ) : null}
    </BottomDrawer>
  );
}
