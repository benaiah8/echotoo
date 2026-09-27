/**
 * DEV-only launcher: resolve a user → getOrCreate direct conversation → open DM.
 * Not linked from bottom navigation. Production builds do not register this route.
 */

import { useCallback, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import PrimaryPageContainer from "../../components/container/PrimaryPageContainer";
import { getOrCreateDirectConversation } from "../../api/services/messaging";
import { getProfileByIdOrUsername } from "../../api/services/follows";
import { Paths, messagesConversationPath } from "../../router/Paths";

function rpcLikeMessage(error: unknown, fallback: string): string {
  if (typeof (error as { message?: string })?.message === "string") {
    return (error as { message: string }).message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function OpenDmPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = useCallback(async () => {
    const trimmed = identifier.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    try {
      const profile = await getProfileByIdOrUsername(trimmed);
      const otherUserId = profile?.user_id?.trim();
      if (!otherUserId) {
        setError("User not found.");
        return;
      }

      const { data, error: rpcError } =
        await getOrCreateDirectConversation(otherUserId);
      if (rpcError || !data) {
        setError(
          rpcLikeMessage(rpcError, "Could not open direct conversation.")
        );
        return;
      }

      navigate(messagesConversationPath(data.conversation_id), {
        state: { otherUserId: data.other_user_id || otherUserId },
      });
    } catch (e) {
      setError(rpcLikeMessage(e, "Could not open direct conversation."));
    } finally {
      setBusy(false);
    }
  }, [identifier, busy, navigate]);

  if (!import.meta.env.DEV) {
    return <Navigate to={Paths.home} replace />;
  }

  return (
    <PrimaryPageContainer back topSafeArea>
      <div className="mx-auto w-full max-w-[480px] px-3 pt-4 pb-8">
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs font-semibold text-[var(--text)]/80 hover:text-[var(--text)]"
          >
            Back
          </button>
          <h1 className="text-base font-semibold text-[var(--text)]">
            Open DM (dev)
          </h1>
        </div>

        <p className="mb-3 text-[11px] text-[var(--text)]/55">
          Enter a username or user id, then open/create the persistent 1:1
          conversation.{" "}
          <span className="font-mono text-[10px]">{Paths.devOpenDm}</span>
        </p>

        <button
          type="button"
          onClick={() => navigate(Paths.messages)}
          className="mb-4 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/90 px-4 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition-opacity active:opacity-90"
        >
          Open Messages inbox
          <span className="mt-0.5 block text-[11px] font-normal text-[var(--text)]/55">
            {Paths.messages}
          </span>
        </button>

        <label className="mb-1 block text-[11px] font-medium text-[var(--text)]/70">
          Username or user id
        </label>
        <input
          type="text"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleOpen();
            }
          }}
          placeholder="username or uuid"
          disabled={busy}
          className="mb-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text)]/40 focus:outline-none focus:ring-2 focus:ring-amber-400/40 disabled:opacity-60"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        {error ? (
          <p className="mb-3 text-sm text-red-500/90" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleOpen()}
          disabled={busy || !identifier.trim()}
          className="w-full rounded-xl bg-amber-300/90 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition-opacity disabled:pointer-events-none disabled:opacity-45 app-dark:bg-amber-400/80"
        >
          {busy ? "Opening…" : "Open conversation"}
        </button>
      </div>
    </PrimaryPageContainer>
  );
}
