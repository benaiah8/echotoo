/**
 * Narrow client-side screening for clearly objectionable plain text (Apple 1.2 UGC).
 * Not a substitute for server-side enforcement — bypassable from a modified client.
 */

export const UGC_TEXT_POLICY_ERROR_MESSAGE =
  "That wording isn't allowed on EchoToo. Please edit and try again.";

/** True when `err` is the client UGC filter rejection (same message as {@link UGC_TEXT_POLICY_ERROR_MESSAGE}). */
export function isUgcTextPolicyError(err: unknown): boolean {
  return err instanceof Error && err.message === UGC_TEXT_POLICY_ERROR_MESSAGE;
}

export type UgcPlainTextContext = "default" | "username";

/** Activity-shaped object from create flow / preview drafts. */
export type UgcActivityLike = {
  title?: string;
  activityType?: string;
  customActivity?: string;
  locationDesc?: string;
  location?: string;
  locationNotes?: string;
  locationUrl?: string;
  tags?: string[];
  additionalInfo?: { title: string; value: string }[];
};

function normalizeForScreening(raw: string): string {
  let t = raw.normalize("NFKC").toLowerCase().trim();
  t = t.replace(/[\s_\-.,;:/\\|]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/([a-z0-9])\1{2,}/gi, "$1$1");
  return t;
}

/** Multi-word or high-signal phrases (lowercase, checked with includes). */
const BLOCKED_PHRASES_DEFAULT: readonly string[] = [
  "kill yourself",
  "kill your self",
  "kill urself",
  "hope you die",
  "go die",
  "hang yourself",
  "end your life",
  "child porn",
  "child pornography",
  "child molest",
  "minor sex",
  "preteen sex",
  "sex with minor",
  "rape a child",
  "rape children",
  "school shooter",
  "mass shooting plan",
];

/** Obvious collapsed spellings (spaces removed) — default + username. */
const BLOCKED_COLLAPSED: readonly string[] = [
  "childporn",
  "childporno",
  "preteenporn",
  "killurself",
  "rapechildren",
];

/**
 * Whole-token hate / harassment (English, narrow). Uses boundaries to limit false positives.
 * Intentionally small — extend server-side if you need broader coverage.
 */
const TOKEN_REGEX_DEFAULT: readonly RegExp[] = [
  /\bn[i1l][g6]{2}[e3][r5]?\b/i,
  /\bn[i1l][g6]{2}[a@4]s?\b/i,
  /\bf[a@4]gg[o0]t(s)?\b/i,
  /\bk[i1]k[e3]s?\b/i,
  /\bch[i1]nk(s|y)?\b/i,
  /\bw[e3]tb[a@4]ck(s)?\b/i,
  /\bc[o0][o0]n(s)?\b/i,
  /\bb[e3][a@4]n[e3]r(s)?\b/i,
  /\bsp[i1]c(s)?\b/i,
];

/** Username: skip multi-word phrases; keep token regex + collapsed checks only. */
const TOKEN_REGEX_USERNAME: readonly RegExp[] = TOKEN_REGEX_DEFAULT;

const KYS_REGEX = /\bkys\b/i;

function collapsed(s: string): string {
  return s.replace(/\s+/g, "");
}

function violatesPolicy(
  normalized: string,
  context: UgcPlainTextContext
): boolean {
  const coll = collapsed(normalized);
  for (const frag of BLOCKED_COLLAPSED) {
    if (coll.includes(frag)) return true;
  }

  if (KYS_REGEX.test(normalized)) return true;

  const tokenRes =
    context === "username" ? TOKEN_REGEX_USERNAME : TOKEN_REGEX_DEFAULT;
  for (const re of tokenRes) {
    if (re.test(normalized)) return true;
  }

  if (context !== "username") {
    for (const phrase of BLOCKED_PHRASES_DEFAULT) {
      if (normalized.includes(phrase)) return true;
    }
  }

  return false;
}

export function screenUgcPlainText(
  text: string | null | undefined,
  context: UgcPlainTextContext = "default"
): { ok: true } | { ok: false } {
  if (text == null || String(text).trim() === "") return { ok: true };
  const normalized = normalizeForScreening(String(text));
  if (!normalized) return { ok: true };
  if (violatesPolicy(normalized, context)) return { ok: false };
  return { ok: true };
}

export function assertPlainTextAllowedForUgc(
  text: string | null | undefined,
  context: UgcPlainTextContext = "default"
): void {
  const r = screenUgcPlainText(text, context);
  if (!r.ok) throw new Error(UGC_TEXT_POLICY_ERROR_MESSAGE);
}

export function assertCreateFlowDraftTextAllowed(input: {
  caption: string;
  tags: readonly string[];
  activities: readonly UgcActivityLike[];
}): void {
  assertPlainTextAllowedForUgc(input.caption, "default");
  for (const tag of input.tags) {
    assertPlainTextAllowedForUgc(String(tag ?? ""), "default");
  }
  for (const a of input.activities) {
    assertPlainTextAllowedForUgc(a.title, "default");
    assertPlainTextAllowedForUgc(a.activityType, "default");
    assertPlainTextAllowedForUgc(a.customActivity, "default");
    assertPlainTextAllowedForUgc(a.locationDesc, "default");
    assertPlainTextAllowedForUgc(a.location, "default");
    assertPlainTextAllowedForUgc(a.locationNotes, "default");
    assertPlainTextAllowedForUgc(a.locationUrl, "default");
    if (Array.isArray(a.tags)) {
      for (const t of a.tags) {
        assertPlainTextAllowedForUgc(String(t ?? ""), "default");
      }
    }
    if (Array.isArray(a.additionalInfo)) {
      for (const row of a.additionalInfo) {
        assertPlainTextAllowedForUgc(row?.title, "default");
        assertPlainTextAllowedForUgc(row?.value, "default");
      }
    }
  }
}
