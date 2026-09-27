import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import ConfirmDialog from "../ui/ConfirmDialog";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "../ui/FrostedCenterModal";
import { invokeAdminCampaignPush } from "../../api/services/adminCampaignPush";

const DEFAULT_TITLE = "EchoToo";
const DEFAULT_BODY = "Check this out on EchoToo";
const MAX_NOTE_LEN = 200;

type Props = {
  open: boolean;
  onClose: () => void;
  postId: string;
  postType: "hangout" | "experience";
  postCaption?: string | null;
};

type DryRunSnapshot = {
  key: string;
  recipientCount: number;
  deviceCount: number;
  capped: boolean;
  title: string;
  bodyPreview: string;
};

function excerptPushText(raw: string | null | undefined, max: number): string {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function campaignDraftKey(
  title: string,
  note: string,
  postId: string,
  postType: string
): string {
  return `${title.trim() || DEFAULT_TITLE}|${note.trim()}|${postId}|${postType}`;
}

export default function AdminCampaignPushDialog({
  open,
  onClose,
  postId,
  postType,
  postCaption,
}: Props) {
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [note, setNote] = useState("");
  const [dryRun, setDryRun] = useState<DryRunSnapshot | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const captionExcerpt = useMemo(
    () => excerptPushText(postCaption, MAX_NOTE_LEN),
    [postCaption]
  );
  const localPreviewBody =
    excerptPushText(note, MAX_NOTE_LEN) || captionExcerpt || DEFAULT_BODY;
  const localPreviewTitle = excerptPushText(title, 120) || DEFAULT_TITLE;

  const currentKey = useMemo(
    () => campaignDraftKey(title, note, postId, postType),
    [title, note, postId, postType]
  );
  const dryRunMatchesDraft = dryRun != null && dryRun.key === currentKey;
  const canSend = dryRunMatchesDraft && !dryRun.capped;
  const previewTitle = dryRunMatchesDraft ? dryRun.title : localPreviewTitle;
  const previewBody = dryRunMatchesDraft
    ? dryRun.bodyPreview
    : localPreviewBody;

  const reset = useCallback(() => {
    setTitle(DEFAULT_TITLE);
    setNote("");
    setDryRun(null);
    setConfirmOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setDryRun(null);
  };

  const handleNoteChange = (value: string) => {
    setNote(value);
    setDryRun(null);
  };

  const handleDryRun = async () => {
    setSending(true);
    try {
      const result = await invokeAdminCampaignPush({
        title: title.trim() || DEFAULT_TITLE,
        body: note.trim(),
        postId,
        postType,
        dryRun: true,
      });
      if (result.error) {
        setDryRun(null);
        toast.error(result.error);
        return;
      }
      const snapshot: DryRunSnapshot = {
        key: campaignDraftKey(
          title.trim() || DEFAULT_TITLE,
          note.trim(),
          postId,
          postType
        ),
        recipientCount: result.recipientCount ?? 0,
        deviceCount: result.deviceCount ?? 0,
        capped: result.capped === true,
        title: result.title?.trim() || DEFAULT_TITLE,
        bodyPreview: result.bodyPreview?.trim() || localPreviewBody,
      };
      setDryRun(snapshot);
      if (snapshot.capped) {
        toast.error(
          `Too many recipients (${snapshot.recipientCount}). Send is blocked.`
        );
        return;
      }
      toast.success(
        `Dry run: ${snapshot.recipientCount} users / ${snapshot.deviceCount} devices`
      );
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!canSend || !dryRun) {
      toast.error("Run a dry run before sending");
      return;
    }
    setSending(true);
    try {
      const result = await invokeAdminCampaignPush({
        title: title.trim() || DEFAULT_TITLE,
        body: note.trim(),
        postId,
        postType,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Sent to ${result.sent ?? 0} device(s)`);
      handleClose();
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  const confirmMessage = dryRunMatchesDraft
    ? `"${dryRun.title}" — ${dryRun.bodyPreview}\n\nThis sends a native push to ${dryRun.recipientCount} user(s) across ${dryRun.deviceCount} device(s). No Activities inbox row.`
    : "Run a dry run before sending.";

  return (
    <>
      <FrostedCenterModal open={open} onBackdropClick={handleClose}>
        <div
          className={`${frostedModalPanelClassName} w-full max-w-md flex flex-col gap-4 p-5`}
          style={frostedModalPanelStyle}
        >
          <h2 className="text-lg font-semibold text-[var(--text)]">
            Send campaign push
          </h2>
          <p className="text-xs text-[var(--text)]/60">
            Promoting this {postType}. Recipients tap through to the post.
            Push-only — no Activities inbox row.
          </p>
          {captionExcerpt ? (
            <p className="text-xs text-[var(--text)]/70 line-clamp-3">
              Post: {captionExcerpt}
            </p>
          ) : (
            <p className="text-xs text-[var(--text)]/50">
              This post has no caption. Fallback copy will be used if you leave
              the message blank.
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text)]/70">
              Title
            </span>
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[16px]"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              maxLength={120}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text)]/70">
              Push message
            </span>
            <textarea
              className="min-h-[72px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[16px] resize-none"
              value={note}
              onChange={(e) => handleNoteChange(e.target.value)}
              maxLength={MAX_NOTE_LEN}
              placeholder="Optional note for this push…"
            />
            <span className="text-[11px] text-[var(--text)]/50">
              Leave blank to use the post caption.
            </span>
          </label>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-3 py-2">
            <p className="text-[11px] font-medium text-[var(--text)]/50">
              Notification preview
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text)]">
              {previewTitle}
            </p>
            <p className="text-sm text-[var(--text)]/80">{previewBody}</p>
          </div>

          {dryRunMatchesDraft ? (
            <p className="text-xs text-[var(--text)]/70">
              {dryRun.capped
                ? `Dry run capped: ${dryRun.recipientCount} users / ${dryRun.deviceCount} devices. Send is blocked.`
                : `Last dry run: ${dryRun.recipientCount} user(s) / ${dryRun.deviceCount} device(s).`}
            </p>
          ) : (
            <p className="text-xs text-[var(--text)]/50">
              Run a dry run after the title and message are final.
            </p>
          )}

          <div className="flex flex-wrap gap-2 justify-end pt-1">
            <button
              type="button"
              className="rounded-full px-4 py-2 text-xs font-semibold border border-[var(--border)]"
              onClick={handleClose}
              disabled={sending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-2 text-xs font-semibold border border-[var(--border)]"
              onClick={() => void handleDryRun()}
              disabled={sending}
            >
              Dry run
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-2 text-xs font-semibold bg-[var(--brand)] text-[var(--brand-ink)] disabled:opacity-50"
              onClick={() => setConfirmOpen(true)}
              disabled={sending || !canSend}
            >
              Send push
            </button>
          </div>
        </div>
      </FrostedCenterModal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleSend()}
        title="Send campaign push?"
        message={confirmMessage}
        confirmLabel="Send"
        confirmVariant="danger"
        isLoading={sending}
      />
    </>
  );
}
