import type { InviteThreadBundle } from "../../../api/services/inviteThreads";

const expiredBannerShell =
  "mx-auto w-full max-w-md rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-3.5 py-2.5 text-center shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)] app-dark:border-amber-400/32 app-dark:bg-amber-400/[0.1] app-dark:shadow-[inset_0_0_0_1px_rgba(251,191,36,0.08)]";

/** Shown at top of personal/group invite thread scroll when RPC marks thread expired. */
export function InviteThreadExpiredBanner() {
  return (
    <div role="alert" className={expiredBannerShell} aria-live="polite">
      <p className="text-[13px] font-semibold leading-snug text-amber-950/90 app-dark:text-amber-100/95">
        This invite has expired.
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--text)]/72 app-dark:text-[var(--text)]/78">
        You can still read the conversation, but new messages are closed.
      </p>
    </div>
  );
}

/** Composer/footer read-only hint when the viewer cannot send messages. */
export function InviteThreadReadOnlyComposerNotice({
  bundle,
  readOnlyExplanation,
}: {
  bundle: InviteThreadBundle;
  readOnlyExplanation: () => string[];
}) {
  if (bundle.can_compose) return null;

  if (bundle.is_expired) {
    const other = readOnlyExplanation().filter(
      (line) => line !== "This thread has expired.",
    );
    return (
      <div
        role="alert"
        className="pointer-events-auto max-w-lg rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-center app-dark:border-amber-400/28 app-dark:bg-amber-400/[0.08]"
        aria-live="polite"
      >
        <p className="text-[12px] font-semibold leading-snug text-amber-950/88 app-dark:text-amber-100/92">
          New messages are closed for this invite.
        </p>
        {other.length > 0 ? (
          <p className="mt-1 text-[11px] leading-snug text-[var(--text)]/62">
            {other.join(" ")}
          </p>
        ) : null}
      </div>
    );
  }

  const lines = readOnlyExplanation();
  if (lines.length === 0) return null;

  return (
    <p className="pointer-events-auto max-w-lg text-center text-[11px] leading-snug text-[var(--text)]/60">
      {lines.join(" ")}
    </p>
  );
}

/** Inline hint above message list when read-only for a non-expired reason. */
export function InviteThreadReadOnlyScrollHint({
  bundle,
}: {
  bundle: InviteThreadBundle;
}) {
  if (bundle.can_compose || bundle.is_expired) return null;
  return (
    <p className="text-center text-[11px] text-[var(--text)]/45">
      Messaging and reactions are read-only here for now.
    </p>
  );
}
