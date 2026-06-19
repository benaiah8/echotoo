import { useEffect, type MouseEvent } from "react";
import {
  PiAppleLogo,
  PiConfetti,
  PiGooglePlayLogo,
  PiMapTrifold,
} from "react-icons/pi";
import { useNavigate } from "react-router-dom";
import { getOwlLogoPath } from "../../lib/assets";
import { DESKTOP_POLICY_NAV } from "../../lib/desktopPolicyRoutes";
import { openExternalUrl } from "../../lib/openExternalUrl";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import { APP_STORE_URL, PLAY_STORE_URL } from "../../lib/storeLinks";
import {
  getFeedbackMailto,
  SUPPORT_EMAIL,
} from "../../lib/supportConfig";

export type WelcomeModalCloseSource = "x" | "got-it";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: (source: WelcomeModalCloseSource) => void;
}

export default function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
  const navigate = useNavigate();
  const hideStoreSection = isNativeApp();

  const handleGotItClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onClose("got-it");
  };

  const handleXClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onClose("x");
  };

  const handlePolicyClick = (path: string) => {
    onClose("got-it");
    navigate(path);
  };

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
        <div className="mx-auto w-full max-w-md py-6">
          {/* Hero */}
          <header className="mb-8 text-center">
            <img
              src={getOwlLogoPath()}
              alt=""
              width={48}
              height={48}
              className="mx-auto mb-3 object-contain drop-shadow-[0_4px_24px_rgba(247,208,71,0.22)]"
              draggable={false}
            />
            <h2 className="text-2xl font-semibold text-[var(--text)]">
              Welcome to EchoToo
            </h2>
            <p className="mt-4 text-base text-[var(--text)]/80 leading-relaxed">
              Discover events, experiences, and real-world plans with friends.
              Find what&apos;s happening near you and explore curated stops and
              itineraries — built for showing up, not endless scrolling.
            </p>
          </header>

          {/* Get EchoToo — web only */}
          {!hideStoreSection ? (
            <section
              className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left"
              aria-labelledby="welcome-get-echotoo-heading"
            >
              <h3
                id="welcome-get-echotoo-heading"
                className="text-base font-semibold text-[var(--text)]"
              >
                Get EchoToo
              </h3>
              <p className="mt-1 text-sm text-[var(--text)]/70">
                Download the app for iPhone, iPad, or Android.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => void openExternalUrl(APP_STORE_URL)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-left transition hover:bg-[var(--surface)]/80"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <PiAppleLogo
                      className="shrink-0 text-xl text-[var(--text)]"
                      aria-hidden
                    />
                    <span className="font-medium text-[var(--text)]">
                      App Store
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[var(--brand)]">
                    Open
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void openExternalUrl(PLAY_STORE_URL)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-left transition hover:bg-[var(--surface)]/80"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <PiGooglePlayLogo
                      className="shrink-0 text-xl text-[var(--text)]"
                      aria-hidden
                    />
                    <span className="font-medium text-[var(--text)]">
                      Google Play
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[var(--brand)]">
                    Open
                  </span>
                </button>
              </div>
            </section>
          ) : null}

          {/* What you can do */}
          <section
            className="mb-8 text-left"
            aria-labelledby="welcome-product-heading"
          >
            <h3
              id="welcome-product-heading"
              className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text)]/55"
            >
              What you can do
            </h3>
            <p className="mt-1 mb-3 text-sm text-[var(--text)]/65">
              Two sides of going out — spontaneous plans and places worth the
              trip.
            </p>
            <div className="flex flex-col gap-3">
              <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[rgba(247,208,71,0.07)] text-[var(--brand)]"
                    aria-hidden
                  >
                    <PiConfetti className="text-lg" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text)]">Events</p>
                    <p className="mt-1 text-sm text-[var(--text)]/72 leading-snug">
                      See what&apos;s happening around you — meetups with
                      friends, invites you can accept, and last-minute plans
                      you can drop into or share.
                    </p>
                  </div>
                </div>
              </article>
              <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[rgba(120,160,255,0.06)] text-[var(--text)]"
                    aria-hidden
                  >
                    <PiMapTrifold className="text-lg" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text)]">
                      Experiences
                    </p>
                    <p className="mt-1 text-sm text-[var(--text)]/72 leading-snug">
                      Follow itineraries and stops you care about — from cafés
                      to events — so every outing feels like a small adventure,
                      not a vague maybe.
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </section>

          {/* Policies & safety */}
          <section
            className="mb-8 text-left"
            aria-labelledby="welcome-policies-heading"
          >
            <h3
              id="welcome-policies-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text)]/55"
            >
              Policies &amp; safety
            </h3>
            <nav className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
              {DESKTOP_POLICY_NAV.map(({ path, navLabel }) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => handlePolicyClick(path)}
                  className="block w-full px-4 py-3 text-left text-sm font-medium text-[var(--brand)] transition hover:bg-[var(--bg)]/40 active:bg-[var(--bg)]/60"
                >
                  {navLabel}
                </button>
              ))}
            </nav>
          </section>

          {/* Feedback */}
          <section
            className="mb-8 rounded-xl border border-[var(--brand)]/25 bg-[var(--surface)] p-4 text-left"
            aria-labelledby="welcome-feedback-heading"
          >
            <h3
              id="welcome-feedback-heading"
              className="font-semibold text-[var(--text)]"
            >
              Give us feedback
            </h3>
            <p className="mt-1 text-sm text-[var(--text)]/70 leading-snug">
              Tell us what you think about the app — what helps you go out, what
              feels rough, or what you want next. It helps us improve EchoToo.
            </p>
            <button
              type="button"
              onClick={() => void openExternalUrl(getFeedbackMailto())}
              className="mt-3 w-full rounded-lg border border-[var(--brand)]/35 bg-[rgba(247,208,71,0.08)] py-2.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)]/50 hover:bg-[rgba(247,208,71,0.12)]"
            >
              Send feedback
            </button>
          </section>

          {/* Contact */}
          <section className="mb-8 text-left" aria-labelledby="welcome-contact-heading">
            <h3
              id="welcome-contact-heading"
              className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text)]/55"
            >
              Contact
            </h3>
            <p className="mt-2 text-sm text-[var(--text)]/70">
              Business, partnerships, and general inquiries:
            </p>
            <button
              type="button"
              onClick={() => void openExternalUrl(`mailto:${SUPPORT_EMAIL}`)}
              className="mt-3 flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-center transition hover:bg-[var(--surface)]/80"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/60">
                Email us at
              </span>
              <span className="break-all font-semibold text-[var(--text)] underline underline-offset-2 decoration-[var(--brand-dark)]">
                {SUPPORT_EMAIL}
              </span>
            </button>
          </section>

          <button
            type="button"
            onClick={handleGotItClick}
            className="w-full rounded-lg bg-[var(--brand)] py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:brightness-110"
          >
            Got it
          </button>
        </div>
      </div>

      {/* Bottom-centered close — easy thumb reach */}
      <div className="flex-none flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 px-6 bg-[var(--bg)]">
        <button
          type="button"
          onClick={handleXClick}
          aria-label="Close"
          className="h-12 w-12 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-2xl leading-none text-[var(--text)] hover:bg-[var(--surface)]/80 transition"
        >
          ×
        </button>
      </div>
    </div>
  );
}
