/**
 * Normalize Instagram / TikTok / Telegram profile inputs to canonical https URLs
 * for storage and in-app opening (web + Capacitor Browser).
 */

export type SocialPlatform = "instagram" | "tiktok" | "telegram";

const IG_RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "tv",
  "accounts",
  "direct",
]);

function trimOrEmpty(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function stripDoubleProtocol(s: string): string {
  return s.replace(/^https?:\/\/(https?:\/\/)+/i, "https://");
}

/** Strip leading @ and slashes; decode path segment safely. */
function cleanHandleSegment(s: string): string {
  let t = s.trim().replace(/^@+/, "").replace(/^\/+|\/+$/g, "");
  try {
    t = decodeURIComponent(t);
  } catch {
    /* keep */
  }
  return t.trim();
}

function isValidInstagramUser(u: string): boolean {
  return /^[a-zA-Z0-9._]{1,30}$/.test(u);
}

function isValidTikTokUser(u: string): boolean {
  return /^[a-zA-Z0-9._]{2,32}$/.test(u);
}

function isValidTelegramUser(u: string): boolean {
  return /^[a-zA-Z0-9_]{5,32}$/.test(u);
}

function isValidHandle(platform: SocialPlatform, u: string): boolean {
  if (!u) return false;
  switch (platform) {
    case "instagram":
      return isValidInstagramUser(u);
    case "tiktok":
      return isValidTikTokUser(u);
    case "telegram":
      return isValidTelegramUser(u);
    default:
      return false;
  }
}

function canonicalInstagram(username: string): string {
  return `https://instagram.com/${username.toLowerCase()}`;
}

function canonicalTikTok(username: string): string {
  const u = username.replace(/^@+/, "");
  return `https://www.tiktok.com/@${u}`;
}

function canonicalTelegram(username: string): string {
  const u = username.replace(/^@+/, "");
  return `https://t.me/${u}`;
}

function buildCanonical(platform: SocialPlatform, username: string): string | null {
  const u = cleanHandleSegment(username);
  if (!u || !isValidHandle(platform, u)) return null;
  switch (platform) {
    case "instagram":
      return canonicalInstagram(u);
    case "tiktok":
      return canonicalTikTok(u);
    case "telegram":
      return canonicalTelegram(u);
    default:
      return null;
  }
}

/** True if string looks like host/path without scheme (instagram.com/foo). */
function needsHttpsPrefix(s: string): boolean {
  const t = s.replace(/^\/+/, "");
  return (
    /^(?:www\.)?instagram\.com\b/i.test(t) ||
    /^(?:www\.)?tiktok\.com\b/i.test(t) ||
    /^t\.me\b/i.test(t) ||
    /^telegram\.me\b/i.test(t)
  );
}

function firstPathSegment(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0].split("?")[0] ?? null;
}

/**
 * Returns canonical https URL, or null if input is empty / unrecognized / invalid handle.
 */
export function normalizeSocialUrl(
  platform: SocialPlatform,
  input: string | null | undefined,
): string | null {
  let s = trimOrEmpty(input);
  if (!s) return null;

  s = stripDoubleProtocol(s);
  if (s.startsWith("//")) s = `https:${s}`;

  if (!/^https?:\/\//i.test(s)) {
    if (needsHttpsPrefix(s)) {
      s = `https://${s.replace(/^\/+/, "")}`;
    } else {
      // Bare @handle or handle (no domain)
      return buildCanonical(platform, s);
    }
  }

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return buildCanonical(platform, s);
  }

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const path = url.pathname.replace(/\/+/g, "/");

  switch (platform) {
    case "instagram": {
      const isIgHost =
        host === "instagram.com" || host.endsWith(".instagram.com");
      if (!isIgHost) {
        return buildCanonical(platform, s);
      }
      const seg = firstPathSegment(path);
      if (!seg || IG_RESERVED.has(seg.toLowerCase())) return null;
      const user = cleanHandleSegment(seg);
      if (!isValidInstagramUser(user)) return null;
      return canonicalInstagram(user);
    }
    case "tiktok": {
      if (host !== "tiktok.com") {
        return buildCanonical(platform, s);
      }
      const parts = path.split("/").filter(Boolean);
      if (parts.length === 0) return null;
      let user = parts[0];
      if (user.startsWith("@")) user = user.slice(1);
      user = cleanHandleSegment(user);
      if (!isValidTikTokUser(user)) return null;
      return canonicalTikTok(user);
    }
    case "telegram": {
      if (host !== "t.me" && host !== "telegram.me") {
        return buildCanonical(platform, s);
      }
      const seg = firstPathSegment(path);
      if (!seg || seg.startsWith("+")) return null;
      const user = cleanHandleSegment(seg);
      if (!isValidTelegramUser(user)) return null;
      return canonicalTelegram(user);
    }
    default:
      return null;
  }
}

/**
 * Best-effort URL for opening a stored profile link (handles legacy bare handles).
 */
export function resolveSocialProfileUrl(
  platform: SocialPlatform,
  stored: string | null | undefined,
): string | null {
  const t = trimOrEmpty(stored);
  if (!t) return null;
  const n = normalizeSocialUrl(platform, t);
  if (n) return n;
  if (/^https?:\/\//i.test(t)) return t;
  return null;
}
