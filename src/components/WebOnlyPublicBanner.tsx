/**
 * Web-only public banner for Google OAuth verification.
 *
 * Renders only when !isCapacitor(). Shows EchoToo, purpose, Privacy, Terms
 * on first paint for normal web visitors. Does not affect native apps.
 */

import { Link } from "react-router-dom";
import { Paths } from "../router/Paths";
import { isCapacitor } from "../lib/storage/utils/capacitorDetection";

const PURPOSE =
  "Discover local hangouts and experiences, connect with friends.";

export default function WebOnlyPublicBanner() {
  if (isCapacitor()) return null;

  return (
    <header
      className="web-only-public-banner"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9998,
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        padding: "10px 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px 16px",
        fontSize: "13px",
        color: "var(--text)",
      }}
    >
      <span style={{ fontWeight: 600 }}>EchoToo</span>
      <span style={{ color: "var(--muted)" }}>—</span>
      <span style={{ color: "var(--muted)", maxWidth: "280px" }}>
        {PURPOSE}
      </span>
      <span style={{ color: "var(--muted)" }}>|</span>
      <Link
        to={Paths.privacy}
        style={{
          color: "var(--brand)",
          textDecoration: "none",
          fontWeight: 500,
        }}
      >
        Privacy
      </Link>
      <Link
        to={Paths.terms}
        style={{
          color: "var(--brand)",
          textDecoration: "none",
          fontWeight: 500,
        }}
      >
        Terms
      </Link>
    </header>
  );
}
