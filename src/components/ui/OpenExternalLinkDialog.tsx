/**
 * Confirm before opening an external http(s) URL (caption / published text links).
 */
import ConfirmDialog from "./ConfirmDialog";
import { isSafeHttpOrHttpsUrl } from "../../lib/createFlowLocation";
import { openExternalUrl } from "../../lib/openExternalUrl";

type Props = {
  open: boolean;
  href: string | null;
  onClose: () => void;
};

export default function OpenExternalLinkDialog({ open, href, onClose }: Props) {
  const destination = href?.trim() || "";

  const handleConfirm = async () => {
    const next = destination;
    onClose();
    if (!next || !isSafeHttpOrHttpsUrl(next)) return;
    try {
      const u = new URL(next);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      await openExternalUrl(u.href);
    } catch {
      // Invalid URL — do not open.
    }
  };

  return (
    <ConfirmDialog
      open={open && Boolean(destination)}
      onClose={onClose}
      onConfirm={() => void handleConfirm()}
      title="Open external link?"
      message={
        <span className="block text-left">
          <span className="block text-[var(--text)]/80">
            You are about to visit:
          </span>
          <span className="mt-2 block break-all text-[13px] font-medium leading-snug text-[var(--text)]">
            {destination}
          </span>
        </span>
      }
      cancelLabel="Cancel"
      confirmLabel="Open link"
      confirmVariant="primary"
    />
  );
}
