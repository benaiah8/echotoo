import { useEffect, useMemo, useRef } from "react";
import {
  AVATAR_PRESET_PREFIX,
  getAvatarPresets,
  isAvatarPresetValue,
  type AvatarPresetInfo,
} from "../../lib/avatarPresets";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import {
  editProfileEchoContrastRingClass,
  editProfileEchoGapRingClass,
  editProfileEchoStripClass,
} from "../../lib/glassActionSheetStyles";

type Props = {
  /** Current persisted Echo value (`preset:owl_NN`) or null. */
  echoPreset: string | null;
  disabled?: boolean;
  /**
   * Open the full-screen Echo picker.
   * Optional `initialPresetValue` stages that Echo in the picker (no persistence yet).
   */
  onOpenPicker: (initialPresetValue?: string) => void;
};

const PRESETS = getAvatarPresets();

/** Suppress click after a horizontal drag so scroll doesn't open the picker. */
const TAP_MOVE_THRESHOLD_PX = 8;

function indexFromPreset(
  presets: AvatarPresetInfo[],
  value: string | null,
): number {
  if (!value || !isAvatarPresetValue(value)) return 0;
  const id = value.slice(AVATAR_PRESET_PREFIX.length).trim();
  const i = presets.findIndex((p) => p.id === id);
  return i >= 0 ? i : 0;
}

function presetValue(id: string): string {
  return `${AVATAR_PRESET_PREFIX}${id}`;
}

/**
 * Compact inline Echo preview: scrollable strip + larger selected circle overlaid.
 * Taps open the full-screen picker; strip scrolling does not persist selection.
 */
export default function EchoVisualSelector({
  echoPreset,
  disabled = false,
  onOpenPicker,
}: Props) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const pointerStartXRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  const selectedIndex = useMemo(
    () => indexFromPreset(PRESETS, echoPreset),
    [echoPreset],
  );
  const selected = PRESETS[selectedIndex] ?? PRESETS[0] ?? null;
  const selectedSrc =
    selected?.url ??
    (echoPreset ? avatarDisplayUrl(echoPreset) : null) ??
    null;
  const selectedValue = selected
    ? presetValue(selected.id)
    : echoPreset ?? undefined;

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || PRESETS.length === 0) return;
    const el = strip.querySelector<HTMLElement>(
      `[data-echo-strip-index="${selectedIndex}"]`,
    );
    if (!el) return;
    const target =
      el.offsetLeft + el.offsetWidth / 2 - strip.clientWidth / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [selectedIndex]);

  const markPointerStart = (clientX: number) => {
    pointerStartXRef.current = clientX;
    movedRef.current = false;
  };

  const markPointerMove = (clientX: number) => {
    const start = pointerStartXRef.current;
    if (start == null) return;
    if (Math.abs(clientX - start) >= TAP_MOVE_THRESHOLD_PX) {
      movedRef.current = true;
    }
  };

  const openIfTap = (initial?: string) => {
    if (disabled || movedRef.current) return;
    onOpenPicker(initial);
  };

  if (PRESETS.length === 0) return null;

  return (
    <section
      className="mt-1 w-full min-w-0 max-w-full"
      aria-label="Echo"
    >
      {/* Tall enough for 64px avatar + outer gap ring above/below strip */}
      <div className="relative mx-auto flex h-[5.25rem] w-full min-w-0 max-w-full items-center px-0.5">
        {/* FRONT: neutral gap ring + contrast ring + Echo avatar */}
        <button
          type="button"
          disabled={disabled}
          aria-label="Choose your Echo"
          onPointerDown={(e) => markPointerStart(e.clientX)}
          onPointerMove={(e) => markPointerMove(e.clientX)}
          onClick={() => openIfTap(selectedValue)}
          className={[
            "absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2",
            editProfileEchoGapRingClass,
            "transition-[transform,opacity] active:scale-[0.98]",
            "disabled:pointer-events-none disabled:opacity-45",
          ].join(" ")}
        >
          <span className={editProfileEchoContrastRingClass}>
            {selectedSrc ? (
              <img
                src={selectedSrc}
                alt=""
                className="h-full w-full object-cover pointer-events-none"
                draggable={false}
              />
            ) : (
              <span className="text-xs text-[var(--text)]/40">?</span>
            )}
          </span>
        </button>

        {/* BACK: compact chooser track — browse / scroll; tap opens picker */}
        <div
          ref={stripRef}
          role="listbox"
          aria-label="Browse Echo options"
          aria-disabled={disabled}
          className={[
            editProfileEchoStripClass,
            disabled ? "opacity-45" : "",
          ].join(" ")}
          onPointerDown={(e) => markPointerStart(e.clientX)}
          onPointerMove={(e) => markPointerMove(e.clientX)}
        >
          {PRESETS.map((preset, i) => {
            const value = presetValue(preset.id);
            const isSelected = i === selectedIndex;
            return (
              <button
                key={preset.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-echo-strip-index={i}
                disabled={disabled}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  markPointerStart(e.clientX);
                }}
                onPointerMove={(e) => markPointerMove(e.clientX)}
                onClick={() => openIfTap(value)}
                className={[
                  "relative h-[30px] w-[30px] shrink-0 overflow-hidden rounded-full",
                  "border bg-[var(--surface-2)]/70 transition-[opacity,transform]",
                  "active:scale-[0.96] disabled:pointer-events-none",
                  isSelected
                    ? "border-[var(--brand)]/70 opacity-90"
                    : "border-[var(--border)]/45 opacity-75",
                ].join(" ")}
                aria-label={`Browse Echo ${preset.id}`}
              >
                <img
                  src={preset.url}
                  alt=""
                  className="h-full w-full object-cover pointer-events-none"
                  draggable={false}
                />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
