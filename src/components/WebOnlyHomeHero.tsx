/**
 * Web-only homepage hero for Google OAuth branding verification.
 *
 * Renders only when !isCapacitor() AND width >= DESKTOP_BREAKPOINT.
 * Provides a visible H1, purpose paragraph, and Privacy/Terms links for
 * desktop web visitors. Hidden on phone-sized web to preserve app-like UX.
 */

import { Link } from "react-router-dom";
import { Paths } from "../router/Paths";
import { useIsDesktopLayout } from "../lib/desktopLayoutDetection";
import { ECHO_APP_DISPLAY_NAME, ECHO_TAGLINE } from "../lib/marketingCopy";

export default function WebOnlyHomeHero() {
  const isDesktop = useIsDesktopLayout();
  if (!isDesktop) return null;

  return (
    <section
      className="web-only-home-hero"
      style={{
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        padding: "24px 16px 28px",
        textAlign: "center",
      }}
    >
      <h1
        className="text-2xl sm:text-3xl font-semibold text-[var(--text)]"
        style={{ marginBottom: 12 }}
      >
        {ECHO_APP_DISPLAY_NAME}
      </h1>
      <p
        className="text-base text-[var(--text)]/90 leading-relaxed"
        style={{
          maxWidth: 480,
          margin: "0 auto 20px",
          fontSize: "15px",
        }}
      >
        {ECHO_TAGLINE}
      </p>
      <div
        style={{
          display: "flex",
          gap: 16,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Link
          to={Paths.privacy}
          className="font-medium"
          style={{
            color: "var(--brand)",
            textDecoration: "none",
          }}
        >
          Privacy Policy
        </Link>
        <Link
          to={Paths.terms}
          className="font-medium"
          style={{
            color: "var(--brand)",
            textDecoration: "none",
          }}
        >
          Terms of Service
        </Link>
      </div>
    </section>
  );
}
