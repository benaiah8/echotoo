/**
 * Desktop-only split-screen website layout.
 *
 * WEB ONLY: Renders only when !isCapacitor() && width >= DESKTOP_BREAKPOINT.
 * Does not affect Capacitor (Android/iOS) or mobile browser experience.
 *
 * Layout:
 * - Left: App inside a phone-like container
 * - Right: EchoToo info panel (name, purpose, Privacy, Terms, contact)
 */

import { Link } from "react-router-dom";
import { Paths } from "../router/Paths";
import { useIsDesktopLayout } from "../lib/desktopLayoutDetection";
import { getOwlLogoPath } from "../lib/assets";
import { SUPPORT_EMAIL } from "../lib/supportConfig";
import { PiInstagramLogo, PiPhone } from "react-icons/pi";

const APP_PURPOSE =
  "The only place you need when you go out. Discover local hangouts and experiences, connect with friends, and make the most of your social life.";

export default function DesktopShellWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDesktop = useIsDesktopLayout();

  if (!isDesktop) {
    return <>{children}</>;
  }

  return (
    <div
      className="desktop-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg)",
        alignItems: "center",
        justifyContent: "center",
        gap: "48px",
        padding: "24px",
      }}
    >
      {/* Phone frame: app constrained inside a phone-like container */}
      <div
        className="desktop-phone-frame"
        style={{
          width: "390px",
          minHeight: "700px",
          maxHeight: "min(90vh, 844px)",
          borderRadius: "40px",
          border: "12px solid var(--surface-2)",
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.08)",
          overflow: "hidden",
          flexShrink: 0,
          /* Establish containing block for fixed elements inside */
          transform: "translateZ(0)",
          position: "relative",
        }}
      >
        <div
          className="desktop-phone-inner"
          style={{
            width: "100%",
            height: "100%",
            minHeight: "700px",
            maxHeight: "min(90vh, 844px)",
            overflow: "auto",
            background: "var(--bg)",
          }}
        >
          {children}
        </div>
      </div>

      {/* Info panel */}
      <div
        className="desktop-info-panel"
        style={{
          flex: 1,
          maxWidth: "420px",
          padding: "24px 0",
        }}
      >
        <div className="flex flex-col gap-6">
          {/* Logo + name */}
          <div className="flex items-center gap-4">
            <img
              src={getOwlLogoPath()}
              alt="EchoToo"
              style={{ width: 48, height: 48, objectFit: "contain" }}
              draggable={false}
            />
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              EchoToo
            </h1>
          </div>

          {/* App purpose */}
          <p className="text-base text-[var(--text)]/85 leading-relaxed">
            {APP_PURPOSE}
          </p>

          {/* Legal links - required for Google OAuth verification */}
          <div className="flex flex-col gap-2">
            <Link
              to={Paths.privacy}
              className="text-[var(--brand)] hover:underline font-medium"
            >
              Privacy Policy
            </Link>
            <Link
              to={Paths.terms}
              className="text-[var(--brand)] hover:underline font-medium"
            >
              Terms of Service
            </Link>
            <Link
              to={Paths.support}
              className="text-[var(--brand)] hover:underline font-medium"
            >
              Support
            </Link>
          </div>

          {/* Contact - from WelcomeModal / SupportPage */}
          <div className="text-sm text-[var(--muted)]">
            <p className="mb-3">
              Contact us:{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[var(--brand)] hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="tel:0902327218"
                className="flex items-center gap-2 text-[var(--text)]/80 hover:text-[var(--brand)] transition"
              >
                <PiPhone size={14} />
                <span>0902327218</span>
              </a>
              <a
                href="https://www.instagram.com/benaiah.a.t/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[var(--text)]/80 hover:text-[var(--brand)] transition"
              >
                <PiInstagramLogo size={14} />
                <span>@benaiah.a.t</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
