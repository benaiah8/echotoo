import { useEffect } from "react";
import {
  PiAppleLogo,
  PiGooglePlayLogo,
  PiInstagramLogo,
  PiPhone,
} from "react-icons/pi";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
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
    <div className="fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col">
      {/* Header with close button */}
      <div className="flex justify-end p-4 safe-area-inset-top">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text)] hover:bg-[var(--surface)]/80 transition"
        >
          ×
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center items-center px-6">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-semibold text-[var(--text)] mb-6">
            Welcome to Echotoo
          </h2>
          <p className="text-base text-[var(--text)]/80 mb-8 leading-relaxed">
            The only place you need when you go out. Discover local hangouts and
            experiences, connect with friends, and make the most of your social
            life.
          </p>

          {/* Contact Section */}
          <div className="mb-8">
            <p className="text-sm text-[var(--text)]/70 mb-4">
              If you want to reach out to work with us, talk to us, or invest in
              Echotoo, you can contact us:
            </p>

            <div className="flex flex-col gap-3">
              {/* Phone */}
              <a
                href="tel:0902327218"
                className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] hover:bg-[var(--surface)]/80 transition"
              >
                <PiPhone className="text-[var(--brand)] text-lg" />
                <span className="text-[var(--text)]">0902327218</span>
              </a>

              {/* Instagram */}
              <a
                href="https://www.instagram.com/benaiah.a.t/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] hover:bg-[var(--surface)]/80 transition"
              >
                <PiInstagramLogo className="text-[var(--brand)] text-lg" />
                <span className="text-[var(--text)]">@benaiah.a.t</span>
              </a>
            </div>
          </div>

          {/* App Store & Play Store Section */}
          <div className="mb-8">
            <p className="text-sm text-[var(--text)]/70 mb-4">
              Download our mobile app:
            </p>

            <div className="flex flex-col gap-3">
              {/* App Store */}
              <div className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] opacity-60">
                <PiAppleLogo className="text-[var(--brand)] text-lg" />
                <span className="text-[var(--text)]">App Store</span>
                <span className="text-xs text-[var(--text)]/50 ml-auto">
                  Coming Soon
                </span>
              </div>

              {/* Play Store */}
              <div className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] opacity-60">
                <PiGooglePlayLogo className="text-[var(--brand)] text-lg" />
                <span className="text-[var(--text)]">Google Play</span>
                <span className="text-xs text-[var(--text)]/50 ml-auto">
                  Coming Soon
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-[var(--brand)] text-[var(--brand-ink)] py-3 rounded-lg text-sm font-medium hover:brightness-110 transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
