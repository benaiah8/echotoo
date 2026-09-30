/**
 * Admin help overlay for Internal → App updates.
 * Reuses FrostedCenterModal (same shell as Soft/Hard update + ConfirmDialog).
 */

import { PiXBold } from "react-icons/pi";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "../../components/ui/FrostedCenterModal";

type Props = {
  open: boolean;
  onClose: () => void;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text)]/55">
        {title}
      </h3>
      <div className="text-[12px] leading-relaxed text-[var(--text)]/80 space-y-1.5">
        {children}
      </div>
    </section>
  );
}

export default function AppUpdatesHelpModal({ open, onClose }: Props) {
  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={onClose}
      zTier="dialog"
      role="dialog"
      aria-labelledby="app-updates-help-title"
      containerClassName="items-center sm:items-center"
    >
      <div
        className={`${frostedModalPanelClassName} flex max-h-[min(84vh,640px)] w-full flex-col !p-0 overflow-hidden app-light:shadow-[0_12px_44px_rgba(0,0,0,0.08)] app-dark:shadow-[0_12px_44px_rgba(0,0,0,0.42)]`}
        style={{
          ...frostedModalPanelStyle,
          maxWidth: "min(440px, 92vw)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)]/60 px-4 py-3">
          <h2
            id="app-updates-help-title"
            className="text-sm font-semibold text-[var(--text)] pt-0.5"
          >
            How app updates work
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/60 bg-[var(--surface-2)] text-[var(--text)]/70 hover:text-[var(--text)] hover:opacity-90 active:opacity-80 touch-manipulation"
            aria-label="Close"
          >
            <PiXBold className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4">
          <Section title="Latest version">
            <p>
              The public/display version of the release, for example{" "}
              <span className="font-mono text-[11px]">1.0.1</span>.
            </p>
          </Section>

          <Section title="Latest build">
            <p>
              The actual Android/iOS build number of the newest release. This is
              the primary number used to determine who should be offered the
              update.
            </p>
            <p>
              Example: Latest build ={" "}
              <span className="font-mono text-[11px]">11</span>
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>User on build 11 → already updated, no prompt</li>
              <li>User on build 10 → update prompt can appear</li>
              <li>User on build 9 → update prompt can appear</li>
            </ul>
            <p>
              The app reads the build number from the version actually installed
              on the user&apos;s device. You do not manually select individual
              users.
            </p>
          </Section>

          <Section title="Minimum supported build">
            <p>
              Anything below this build must update when enforcement is enabled.
            </p>
            <p>
              Example: Latest build ={" "}
              <span className="font-mono text-[11px]">11</span>, Minimum
              supported build ={" "}
              <span className="font-mono text-[11px]">10</span>
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Build 11 → no prompt</li>
              <li>Build 10 → optional update when mode is Soft</li>
              <li>Build 9 or lower → required update</li>
            </ul>
          </Section>

          <Section title="Latest version / Minimum supported version">
            <p>
              These remain useful for the human-readable app version and
              legacy/fallback comparison. Build numbers are preferred when
              available.
            </p>
          </Section>

          <Section title="Update modes">
            <p>
              <span className="font-semibold text-[var(--text)]">Off</span> —
              No update prompt is enforced.
            </p>
            <p>
              <span className="font-semibold text-[var(--text)]">Soft</span> —
              Older supported builds receive an optional update prompt with
              “Later” and “Update.” If a build is below Minimum supported build,
              it can still become a required update.
            </p>
            <p>
              <span className="font-semibold text-[var(--text)]">Hard</span> —
              Users below the latest target must update before continuing.
            </p>
          </Section>

          <Section title="Store release ready">
            <p>
              Only turn this on after the new build is actually available for
              users to download from the relevant{" "}
              {__ECHOTOO_IOS_BUILD__ ? "store" : "Play Store/App Store"} location.
              This prevents showing or enforcing an update before the release can
              actually be installed.
            </p>
          </Section>

          <Section title="Store URL">
            <p>
              The Update button sends the user to this platform&apos;s store
              listing.
            </p>
          </Section>

          <Section title="Active">
            <p>
              Controls whether this platform&apos;s update configuration is
              currently active.
            </p>
          </Section>

          <Section title="Recommended admin workflow">
            <ol className="list-decimal pl-4 space-y-1">
              <li>Upload the new Android/iOS build.</li>
              <li>Wait until the release is actually downloadable.</li>
              <li>Enter its Version and Build number here.</li>
              <li>Set Latest build.</li>
              <li>
                Set Minimum supported build only if older builds must be blocked.
              </li>
              <li>Add/verify the store URL.</li>
              <li>Mark Store release ready.</li>
              <li>Choose Soft or Hard.</li>
              <li>Activate the update configuration.</li>
            </ol>
          </Section>

          <div className="rounded-xl border border-[var(--border)]/70 bg-[var(--bg)]/50 app-light:bg-white/40 px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-[var(--text)]/85">
              You do not need to turn the notice off for users who update. Once
              their installed build reaches the Latest build or newer, ECHOTOO
              automatically stops showing the update prompt.
            </p>
          </div>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
