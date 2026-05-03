import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { exportAvatarCropToFile } from "../../lib/avatarCropExport";

type Props = {
  open: boolean;
  imageSrc: string | null;
  onCancel: () => void;
  /** Called with cropped square file ready for `uploadImage`. */
  onConfirm: (file: File) => void | Promise<void>;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/** Floating frosted pill — matches home / profile top glass chips. */
const floatingGlassPillClass =
  "rounded-full border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] shadow-[var(--glass-active-shadow)]";

export default function AvatarCropModal({
  open,
  imageSrc,
  onCancel,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const croppedAreaPixelsRef = useRef<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    croppedAreaPixelsRef.current = croppedPixels;
  }, []);

  const handleCancel = useCallback(() => {
    if (busy) return;
    setLocalError(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    croppedAreaPixelsRef.current = null;
    onCancel();
  }, [busy, onCancel]);

  const handleConfirm = useCallback(async () => {
    if (!imageSrc || busy) return;
    const area = croppedAreaPixelsRef.current;
    if (!area) {
      setLocalError("Still loading crop. Try again.");
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      const file = await exportAvatarCropToFile(imageSrc, area);
      await onConfirm(file);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      croppedAreaPixelsRef.current = null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not crop this image.";
      setLocalError(msg);
    } finally {
      setBusy(false);
    }
  }, [imageSrc, busy, onConfirm]);

  if (typeof document === "undefined") return null;
  if (!open || !imageSrc) return null;

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-0 z-[205] flex w-full max-w-full flex-col overflow-x-hidden overflow-y-hidden overscroll-none bg-[var(--bg)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
    >
      {/* Full-bleed cropper — no backdrop tap to dismiss */}
      <div className="absolute inset-0 z-0 min-h-0 w-full max-w-full overflow-hidden">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      {/* Top: compact floating instruction pill (width capped with calc — avoids vw horizontal jank in WebView) */}
      <div
        className="relative z-10 flex w-full max-w-full shrink-0 justify-center px-3 pointer-events-none"
        style={{
          paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
        }}
      >
        <div
          className={`pointer-events-auto box-border w-full max-w-[min(17.5rem,calc(100%-1.5rem))] px-3 py-1.5 ${floatingGlassPillClass}`}
        >
          <h2
            id="avatar-crop-title"
            className="text-center text-xs font-semibold text-[var(--text)] leading-tight tracking-tight"
          >
            Move and zoom
          </h2>
          <p className="text-center text-[10px] leading-snug text-[var(--text)]/65 mt-0.5 px-0.5">
            Pinch or scroll to zoom. Drag to position.
          </p>
          {localError ? (
            <p className="text-center text-[10px] font-medium text-[var(--danger)] mt-1 leading-snug">
              {localError}
            </p>
          ) : null}
        </div>
      </div>

      {/* Bottom: floating action pill — compact controls, stable width (no vw) for Capacitor */}
      <div
        className="relative z-10 mt-auto flex w-full max-w-full shrink-0 justify-center px-3 pointer-events-none"
        style={{
          paddingBottom: "calc(12px + var(--safe-area-bottom-layout))",
        }}
      >
        <div
          className={`pointer-events-auto box-border flex w-full max-w-[min(19.5rem,calc(100%-1.5rem))] items-stretch gap-1.5 p-1.5 ${floatingGlassPillClass}`}
        >
          <button
            type="button"
            className="flex-1 min-w-0 h-10 min-h-[2.5rem] max-h-10 rounded-full px-3 text-xs font-semibold border border-[var(--border)] bg-[var(--surface-2)]/90 text-[var(--text)] backdrop-blur-sm disabled:opacity-50 active:opacity-90 transition-opacity"
            onClick={handleCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex-1 min-w-0 h-10 min-h-[2.5rem] max-h-10 rounded-full px-3 text-xs font-semibold bg-[var(--brand)] text-[var(--brand-ink)] disabled:opacity-50 active:opacity-90 transition-opacity"
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? "Working…" : "Use photo"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
