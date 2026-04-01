/**
 * Reusable Confirmation Bottom Drawer
 *
 * Features:
 * - Consistent frosted glass styling
 * - Configurable z-index for nested scenarios
 * - Customizable title, message, and button labels
 * - Loading state support
 * - Theme-aware (light/dark mode)
 *
 * Z-index Strategy:
 * - Normal (z-[100]): For confirmations from main page
 * - Higher (z-[110]): For confirmations FROM within another drawer
 */

interface ConfirmBottomDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "primary" | "warning";
  isLoading?: boolean;
  higherZIndex?: boolean; // Use z-[110] when opened from another drawer
}

export default function ConfirmBottomDrawer({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  isLoading = false,
  higherZIndex = false,
}: ConfirmBottomDrawerProps) {
  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isLoading) {
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (isLoading) return;
    await onConfirm();
  };

  // Determine z-index based on context
  const zIndex = higherZIndex ? "z-[110]" : "z-[100]";

  // Determine button styling based on variant
  const getConfirmButtonClass = () => {
    const base =
      "flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50";
    switch (confirmVariant) {
      case "danger":
        return `${base} bg-red-500 text-white hover:bg-red-600`;
      case "primary":
        return `${base} bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-90`;
      case "warning":
        return `${base} bg-yellow-500 text-black hover:bg-yellow-600`;
      default:
        return `${base} bg-red-500 text-white hover:bg-red-600`;
    }
  };

  return (
    <div className={`fixed inset-0 ${zIndex}`} onClick={handleBackdropClick}>
      {/* Backdrop with frosted glass effect */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "var(--drawer-backdrop, rgba(0, 0, 0, 0.5))",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
        }}
      />

      {/* Drawer sheet */}
      <div
        className="absolute left-0 right-0 bottom-0 mx-auto max-w-[640px] rounded-t-2xl border-t p-4 safe-area-inset-bottom"
        style={{
          backgroundColor: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
          borderColor: "var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="text-sm font-semibold mb-1 text-[var(--text)]">
          {title}
        </div>

        {/* Message */}
        <p className="text-xs text-[var(--text)]/70 mb-3">{message}</p>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--text)] hover:bg-[var(--surface)]/80 transition disabled:opacity-50"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            className={getConfirmButtonClass()}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
