import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FIX =
  "supabase/migrations/20260924120100_feed_hangout_addis_calendar_day_eligibility.sql";
const BOOST =
  "supabase/migrations/20261003120000_social_discovery_boost_and_pair_count.sql";
const RECOVERY =
  "supabase/migrations/20261004120000_social_discovery_feed_payload_recovery.sql";
const RANKING_28 =
  "supabase/migrations/20260928120000_list_rpc_slot0_location_keyinfo.sql";
const RANKING_29 =
  "supabase/migrations/20260929120000_list_rpc_latest_comment_preview.sql";
const ROLLBACK =
  "review-artifacts/feed_hangout_addis_calendar_day/ROLLBACK_restore_live_instant_gte_now.sql";

const LIVE_PROSRC_MD5 = "09bd93149123079ff17537fb6aa6aac7";
const LIVE_PROSRC_LEN = 19056;

const INSTANT = "WHERE (elem::timestamptz) >= now()";
const CALENDAR = [
  "WHERE NULLIF(trim(elem), '') IS NOT NULL",
  "                AND ((trim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date",
  "                  >= (timezone('Africa/Addis_Ababa', now()))::date",
].join("\n");

const ADDIS = "Africa/Addis_Ababa";
const CONFIRMED_STAMP = "2026-09-18T21:00:00.000Z";
const INVESTIGATION_NOW = "2026-09-19T05:19:24.000Z";
const TODAY_STAMP = "2026-09-19T21:00:00.000Z";
const TODAY_NOW = "2026-09-20T02:21:00.000Z";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function extractGetFeed(sql: string): string {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data"
  );
  expect(start).toBeGreaterThanOrEqual(0);
  const endMarker = "$function$;";
  const end = sql.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + endMarker.length);
}

function prosrc(fn: string): string {
  const d = "$function$";
  return fn.slice(fn.indexOf(d) + d.length, fn.lastIndexOf(d));
}

function md5(s: string): string {
  return createHash("md5").update(s, "utf8").digest("hex");
}

function reconstructLiveFn(): string {
  return extractGetFeed(read(RECOVERY))
    .replace(CALENDAR, INSTANT)
    .split("â€”").join("\u2014");
}

function stripHangoutDatePredicate(fn: string): string {
  return fn
    .replace(INSTANT, "<<HANGOUT_DATE_PRED>>")
    .replace(CALENDAR, "<<HANGOUT_DATE_PRED>>");
}

function addisDayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ADDIS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function passesInstant(selectedDates: string[], nowIso: string): boolean {
  const now = new Date(nowIso).getTime();
  return selectedDates.some((raw) => {
    const t = new Date(String(raw).trim()).getTime();
    return Number.isFinite(t) && t >= now;
  });
}

function passesAddisCalendarDay(
  selectedDates: string[],
  nowIso: string
): boolean {
  const today = addisDayKey(nowIso);
  return selectedDates.some((raw) => {
    const trimmed = String(raw).trim();
    if (!trimmed) return false;
    const t = new Date(trimmed);
    if (Number.isNaN(t.getTime())) return false;
    return addisDayKey(trimmed) >= today;
  });
}

/** Mirrors live hangout eligible_base OR-branches (recurrence + empty dates preserved). */
function hangoutEligible(opts: {
  selectedDates?: string[] | null;
  isRecurring?: boolean;
  nowIso: string;
  calendar: boolean;
}): boolean {
  if (opts.isRecurring) return true;
  const dates = opts.selectedDates ?? [];
  if (dates.length === 0) return true;
  return opts.calendar
    ? passesAddisCalendarDay(dates, opts.nowIso)
    : passesInstant(dates, opts.nowIso);
}

describe("20260924120100 hangout Addis calendar-day migration (source)", () => {
  const fix = read(FIX);
  const liveFn = reconstructLiveFn();
  const fixFn = extractGetFeed(fix);
  const rollbackFn = extractGetFeed(read(ROLLBACK));

  it("replaces only the hangout instant predicate on the verified live get_feed body", () => {
    expect(fix).toMatch(/^-- LOCAL ONLY/m);
    expect(fix.match(/CREATE OR REPLACE FUNCTION/g)?.length).toBe(1);
    expect((fixFn.match(new RegExp(CALENDAR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length).toBe(1);
    expect(fixFn).not.toContain(INSTANT);
    expect(liveFn).toContain(INSTANT);
    expect(liveFn).not.toContain(CALENDAR);
    expect((liveFn.split(INSTANT).length - 1)).toBe(1);
    expect(stripHangoutDatePredicate(fixFn)).toBe(
      stripHangoutDatePredicate(liveFn)
    );
  });

  it("reproduces live prosrc when the calendar predicate is restored to instant", () => {
    const liveBody = prosrc(liveFn);
    expect(liveBody.length).toBe(LIVE_PROSRC_LEN);
    expect(md5(liveBody)).toBe(LIVE_PROSRC_MD5);
    expect(rollbackFn).toBe(liveFn);
    expect(md5(prosrc(rollbackFn))).toBe(LIVE_PROSRC_MD5);

    const restored = fixFn.replace(CALENDAR, INSTANT);
    expect(restored).toBe(liveFn);
    expect(md5(prosrc(restored))).toBe(LIVE_PROSRC_MD5);
    expect(restored.split(INSTANT).length - 1).toBe(1);
    expect(restored).not.toContain(CALENDAR);
  });

  it("preserves signature, security, search_path, and does not replace Profile RPC", () => {
    expect(fixFn).toContain(
      "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data(p_type post_type DEFAULT NULL::post_type, p_tags text[] DEFAULT NULL::text[], p_search text DEFAULT NULL::text, p_limit integer DEFAULT 12, p_offset integer DEFAULT 0, p_viewer_user_id uuid DEFAULT NULL::uuid, p_occurs_on date DEFAULT NULL::date, p_occurs_tz text DEFAULT NULL::text, p_friends_only boolean DEFAULT false, p_occurs_from date DEFAULT NULL::date, p_occurs_to date DEFAULT NULL::date)"
    );
    expect(fixFn).toContain("RETURNS jsonb");
    expect(fixFn).toContain("STABLE SECURITY DEFINER");
    expect(fixFn).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(fix).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_user_posts_created_with_related_data/
    );
    expect(fix).not.toMatch(/DROP FUNCTION/i);
    expect(fix).not.toMatch(/^GRANT\b/m);
    expect(fix).not.toMatch(/^REVOKE\b/m);
  });

  it("preserves recurrence and empty-date OR branches without the 20260908 p_type IS NULL extra", () => {
    expect(fixFn).toContain("COALESCE(p.is_recurring, false) = true");
    expect(fixFn).toContain(
      "OR COALESCE(jsonb_array_length(p.selected_dates), 0) = 0"
    );
    expect(fixFn).not.toContain("p_type IS NULL\n              AND COALESCE(jsonb_array_length(p.selected_dates), 0) = 0");
  });

  it("preserves one-post-per-card, counts, pagination, privacy, blocks, pair/boost, media", () => {
    expect(fixFn).toContain("SELECT DISTINCT p.id, p.created_at");
    expect(fixFn).toContain("SELECT COUNT(*)::INTEGER AS cnt FROM eligible_base");
    expect(fixFn).toContain("ORDER BY created_at DESC, id DESC");
    expect(fixFn).toContain("LIMIT p_limit");
    expect(fixFn).toContain("OFFSET p_offset");
    expect(fixFn).toContain("'count', COALESCE(v_true_total, 0)");
    expect(fixFn).toContain("author_profile.is_private = false");
    expect(fixFn).toContain("p.visibility = 'friends'");
    expect(fixFn).toContain("users_are_blocked_pair(p_viewer_user_id, p.author_id)");
    expect(fixFn).toContain("pair_discoverable_counts");
    expect(fixFn).toContain("discoverable_pair_count");
    expect(fixFn).toContain("social_discovery_boosted_at");
    expect(fixFn).toContain("p.media_order AS media_order");
    expect(fixFn).toContain("'media_order', fp.media_order");
    expect(fixFn).toContain("'post_media', fp.post_media");
    expect(fixFn).not.toContain("eligible_ranked");
    expect(fixFn).not.toContain("all_score");
    expect(fixFn).not.toContain("slot0_");
    expect(fix).not.toMatch(/^GRANT\b/m);
    expect((fixFn.split("discoverable_until > now()").length - 1)).toBe(2);
  });
});

describe("hangout eligibility predicate (SQL-equivalent)", () => {
  it("confirmed Event date-only stamp is Addis-today and fails instant >= now", () => {
    expect(addisDayKey(CONFIRMED_STAMP)).toBe("2026-09-19");
    expect(addisDayKey(INVESTIGATION_NOW)).toBe("2026-09-19");
    expect(passesInstant([CONFIRMED_STAMP], INVESTIGATION_NOW)).toBe(false);
    expect(passesAddisCalendarDay([CONFIRMED_STAMP], INVESTIGATION_NOW)).toBe(
      true
    );
    expect(
      hangoutEligible({
        selectedDates: [CONFIRMED_STAMP],
        nowIso: INVESTIGATION_NOW,
        calendar: true,
      })
    ).toBe(true);
    expect(
      hangoutEligible({
        selectedDates: [CONFIRMED_STAMP],
        nowIso: INVESTIGATION_NOW,
        calendar: false,
      })
    ).toBe(false);
  });

  it("keeps today after midnight (UTC) for Addis date-only stamps", () => {
    const now = "2026-09-19T00:30:00.000Z";
    expect(addisDayKey(now)).toBe("2026-09-19");
    expect(passesInstant([CONFIRMED_STAMP], now)).toBe(false);
    expect(passesAddisCalendarDay([CONFIRMED_STAMP], now)).toBe(true);
  });

  it("keeps current Addis Today date-only Event after midnight", () => {
    expect(addisDayKey(TODAY_STAMP)).toBe("2026-09-20");
    expect(addisDayKey(TODAY_NOW)).toBe("2026-09-20");
    expect(passesInstant([TODAY_STAMP], TODAY_NOW)).toBe(false);
    expect(passesAddisCalendarDay([TODAY_STAMP], TODAY_NOW)).toBe(true);
  });

  it("keeps a timed Event already started today", () => {
    const startedToday = "2026-09-19T03:00:00.000Z";
    expect(addisDayKey(startedToday)).toBe("2026-09-19");
    expect(passesInstant([startedToday], INVESTIGATION_NOW)).toBe(false);
    expect(passesAddisCalendarDay([startedToday], INVESTIGATION_NOW)).toBe(true);
  });

  it("keeps tomorrow and excludes yesterday", () => {
    const tomorrow = "2026-09-19T21:00:00.000Z";
    const yesterday = "2026-09-17T21:00:00.000Z";
    expect(addisDayKey(tomorrow)).toBe("2026-09-20");
    expect(addisDayKey(yesterday)).toBe("2026-09-18");
    expect(passesAddisCalendarDay([tomorrow], INVESTIGATION_NOW)).toBe(true);
    expect(passesAddisCalendarDay([yesterday], INVESTIGATION_NOW)).toBe(false);
    expect(passesInstant([tomorrow], INVESTIGATION_NOW)).toBe(true);
    expect(passesInstant([yesterday], INVESTIGATION_NOW)).toBe(false);
  });

  it("respects Addis midnight boundaries", () => {
    const justBefore = "2026-09-18T20:59:59.000Z";
    const exactlyMidnight = "2026-09-18T21:00:00.000Z";
    const justAfter = "2026-09-18T21:00:01.000Z";
    expect(addisDayKey(justBefore)).toBe("2026-09-18");
    expect(addisDayKey(exactlyMidnight)).toBe("2026-09-19");
    expect(addisDayKey(justAfter)).toBe("2026-09-19");
    expect(passesAddisCalendarDay([justBefore], INVESTIGATION_NOW)).toBe(false);
    expect(passesAddisCalendarDay([exactlyMidnight], INVESTIGATION_NOW)).toBe(
      true
    );
    expect(passesAddisCalendarDay([justAfter], INVESTIGATION_NOW)).toBe(true);
  });

  it("keeps multi-date Events when any remaining Addis day is today or later", () => {
    expect(
      passesAddisCalendarDay(
        ["2026-09-17T21:00:00.000Z", CONFIRMED_STAMP],
        INVESTIGATION_NOW
      )
    ).toBe(true);
    expect(
      passesAddisCalendarDay(
        ["2026-09-16T21:00:00.000Z", "2026-09-17T21:00:00.000Z"],
        INVESTIGATION_NOW
      )
    ).toBe(false);
  });

  it("preserves recurring and empty-date hangout eligibility", () => {
    expect(
      hangoutEligible({
        selectedDates: ["2026-09-17T21:00:00.000Z"],
        isRecurring: true,
        nowIso: INVESTIGATION_NOW,
        calendar: true,
      })
    ).toBe(true);
    expect(
      hangoutEligible({
        selectedDates: [],
        isRecurring: false,
        nowIso: INVESTIGATION_NOW,
        calendar: true,
      })
    ).toBe(true);
  });

  it("counts and paginates from the filtered eligible set (one row per post id)", () => {
    const rows = [
      { id: "yesterday", dates: ["2026-09-17T21:00:00.000Z"] },
      { id: "confirmed", dates: [CONFIRMED_STAMP] },
      { id: "tomorrow", dates: ["2026-09-19T21:00:00.000Z"] },
      { id: "recurring", dates: ["2026-09-17T21:00:00.000Z"], recurring: true },
      { id: "empty", dates: [] },
    ];
    const eligible = rows.filter((r) =>
      hangoutEligible({
        selectedDates: r.dates,
        isRecurring: Boolean(r.recurring),
        nowIso: INVESTIGATION_NOW,
        calendar: true,
      })
    );
    expect(eligible.map((r) => r.id)).toEqual([
      "confirmed",
      "tomorrow",
      "recurring",
      "empty",
    ]);
    expect(new Set(eligible.map((r) => r.id)).size).toBe(eligible.length);
    const count = eligible.length;
    const page = eligible.slice(0, 2);
    const page2 = eligible.slice(2, 4);
    expect(count).toBe(4);
    expect(page.map((r) => r.id)).toEqual(["confirmed", "tomorrow"]);
    expect(page2.map((r) => r.id)).toEqual(["recurring", "empty"]);
    expect(page.length + page2.length).toBe(count);
  });
});

describe("future 20261003/04 cannot restore instant hangout eligibility", () => {
  it("keeps pair/boost payload while using the same calendar-day hangout WHERE", () => {
    const boost = read(BOOST);
    const recovery = read(RECOVERY);
    const fixFn = extractGetFeed(read(FIX));
    const boostFn = extractGetFeed(boost);
    const recoveryFn = extractGetFeed(recovery);
    const recoveryDashFixed = recoveryFn.split("â€”").join("\u2014");
    expect(boostFn).toContain(CALENDAR);
    expect(recoveryFn).toContain(CALENDAR);
    expect(boostFn).not.toContain(INSTANT);
    expect(recoveryFn).not.toContain(INSTANT);
    expect(boostFn).toContain("pair_discoverable_counts");
    expect(boostFn).toContain("'social_discovery_boosted_at'");
    expect(recoveryFn).toBe(boostFn);
    expect(fixFn).toContain(CALENDAR);
    expect(fixFn).toContain("discoverable_pair_count");
    expect(fixFn).toContain("social_discovery_boosted_at");
    expect(fixFn).toBe(recoveryDashFixed);
  });

  it("leaves 20260928/29 ranking replacements out of this focused deploy", () => {
    const ranking28 = extractGetFeed(read(RANKING_28));
    const ranking29 = extractGetFeed(read(RANKING_29));
    const fixFn = extractGetFeed(read(FIX));
    expect(ranking28).toContain("eligible_ranked");
    expect(ranking28).toContain("slot0_");
    expect(ranking29).toContain("latest_comment");
    expect(ranking29).toContain("eligible_ranked");
    expect(fixFn).not.toContain("eligible_ranked");
    expect(fixFn).not.toContain("slot0_");
    expect(fixFn).not.toContain("latest_comment");
  });
});
