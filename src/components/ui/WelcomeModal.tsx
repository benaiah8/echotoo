import { useEffect } from "react";
import { PiAppleLogo, PiGooglePlayLogo } from "react-icons/pi";
import { openExternalUrl } from "../../lib/openExternalUrl";
import { isIOS, isNativeApp } from "../../lib/storage/utils/capacitorDetection";

const CONTACT_EMAIL = "blueprtdigital@gmail.com";

const FEEDBACK_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "EchoToo feedback"
)}`;

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
  const hideGooglePlayRow = isNativeApp() && isIOS();

  // Disable body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col min-h-0">
      {/* Scrollable body — extra top inset so content clears the status bar */}
      <div className="flex-1 overflow-y-auto min-h-0 pt-[max(1.25rem,env(safe-area-inset-top))] px-6 pb-4">
        <div className="flex flex-col justify-center items-center min-h-full py-6">
          <div className="text-center max-w-md w-full">
            <h2 className="text-2xl font-semibold text-[var(--text)] mb-6">
              Welcome to Echotoo
            </h2>
            <p className="text-base text-[var(--text)]/80 mb-8 leading-relaxed">
              The only place you need when you go out. Discover local hangouts
              and experiences, connect with friends, and make the most of your
              social life.
            </p>

            {/* Creator monetization teaser */}
            <div className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-xl font-semibold text-[var(--brand-ink)] shadow-sm ring-1 ring-black/10 app-dark:ring-white/15"
                  aria-hidden
                >
                  $
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="font-semibold text-[var(--text)]">
                    Get paid for your content
                  </p>
                  <p className="mt-1 text-sm text-[var(--text)]/70 leading-snug">
                    A creator partnership program is{" "}
                    <span className="font-bold italic text-[var(--text)]/90">
                      coming soon
                    </span>{" "}
                    —{" "}
                    <span className="font-bold italic text-[var(--text)]/90">
                      stay tuned
                    </span>
                    .
                  </p>
                </div>
              </div>
            </div>

            {/* Feedback — same inbox as contact */}
            <div className="mb-8 rounded-xl border border-[var(--brand)]/25 bg-[var(--surface)] p-4 text-left">
              <p className="font-semibold text-[var(--text)]">Give us feedback</p>
              <p className="mt-1 text-sm text-[var(--text)]/70 leading-snug">
                Tell us what you think about the app — what helps you go out,
                what feels rough, or what you want next. It helps us improve
                EchoToo.
              </p>
              <button
                type="button"
                onClick={() => void openExternalUrl(FEEDBACK_MAILTO)}
                className="mt-3 w-full rounded-lg border border-[var(--brand)]/35 bg-[rgba(247,208,71,0.08)] py-2.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)]/50 hover:bg-[rgba(247,208,71,0.12)]"
              >
                Send feedback
              </button>
            </div>

            {/* Contact Section */}
            <div className="mb-8">
              <p className="text-sm text-[var(--text)]/70 mb-4">
                If you want to reach out to work with us, talk to us, or invest
                in Echotoo, you can contact us:
              </p>

              <button
                type="button"
                onClick={() =>
                  void openExternalUrl(`mailto:${CONTACT_EMAIL}`)
                }
                className="flex w-full flex-col items-center justify-center gap-1 p-4 bg-[var(--surface)] rounded-lg border border-[var(--border)] hover:bg-[var(--surface)]/80 transition text-center"
              >
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/60">
                  Email us at
                </span>
                <span className="text-[var(--text)] font-semibold break-all underline underline-offset-2 decoration-[var(--brand-dark)]">
                  {CONTACT_EMAIL}
                </span>
              </button>
            </div>

            {/* App Store (always); Play Store hidden on native iOS to avoid irrelevant store copy in review builds */}
            <div className="mb-8">
              <p className="text-sm text-[var(--text)]/70 mb-4">
                {hideGooglePlayRow
                  ? "EchoToo on the App Store:"
                  : "Download our mobile app:"}
              </p>

              <div className="flex flex-col gap-3">
                {/* App Store */}
                <div className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
                  <PiAppleLogo className="text-[var(--text)] text-xl shrink-0" aria-hidden />
                  <span className="text-[var(--text)]">App Store</span>
                  <span className="text-xs text-[var(--text)]/50 ml-auto">
                    Coming Soon
                  </span>
                </div>

                {!hideGooglePlayRow ? (
                  <div className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
                    <PiGooglePlayLogo
                      className="text-[var(--text)] text-xl shrink-0"
                      aria-hidden
                    />
                    <span className="text-[var(--text)]">Google Play</span>
                    <span className="text-xs text-[var(--text)]/50 ml-auto">
                      Coming Soon
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full bg-[var(--brand)] text-[var(--brand-ink)] py-3 rounded-lg text-sm font-medium hover:brightness-110 transition"
            >
              Got it
            </button>
          </div>
        </div>
      </div>

      {/* Bottom-centered close — easy thumb reach */}
      <div className="flex-none flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 px-6 bg-[var(--bg)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="h-12 w-12 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-2xl leading-none text-[var(--text)] hover:bg-[var(--surface)]/80 transition"
        >
          ×
        </button>
      </div>
    </div>
  );
}
