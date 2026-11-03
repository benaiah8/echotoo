/**
 * DEV-only presentation harness for Open Plan requester list rows.
 * Local fixtures only — no Supabase, caches, Accept, or production overlay store.
 * Gated by import.meta.env.DEV in AppRouter; returns null outside DEV.
 *
 * Fixture kinds (for visual QA):
 * - named+photo: permitted name + photo
 * - named+echo: permitted name + Echo preset (no photo)
 * - named+missing-avatar: permitted name, no photo/echo → ?
 * - anonymous: intentional privacy (Name hidden, no open key)
 * - disclosed-missing-name: open key present, empty display_name → Someone
 */
import { useMemo, useState } from "react";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import type { OpenPlanRequester } from "../../lib/people/types";
import OpenPlanRequesterDrawerTile from "../../components/messages/OpenPlanRequesterDrawerTile";

/** Exactly 200 chars — Open Plan note max. */
const LONG_NOTE =
  "Would love to join — I can bring snacks and a portable speaker. Happy to meet near the north entrance around four if that still works, and I am fine with rain as long as we have a covered spot nearby.";

const LONG_NOTE_ALT =
  "Anonymous long note should still wrap cleanly across multiple lines so hosts can read the full intent without crowding the Chat control on the identity row above.";

type CountMode = 1 | 5 | 10 | 20;

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const PHOTO_A =
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop";
const PHOTO_B =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop";
const PHOTO_C =
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop";

function fixture(
  partial: OpenPlanRequester & { _kind?: string }
): OpenPlanRequester {
  const { _kind: _ignored, ...row } = partial as OpenPlanRequester & {
    _kind?: string;
  };
  void _ignored;
  return row;
}

/** Newest-first fixture pool (matches list_open_plan_requesters ordering intent). */
const FIXTURE_POOL: OpenPlanRequester[] = [
  // 1 — permitted name + photo + long note
  fixture({
    _kind: "named+photo",
    request_id: "fix-req-01",
    requested_at: hoursAgo(0.5),
    display_name: "Maya Chen",
    profile_open_key: "maya",
    note: LONG_NOTE,
    avatar_url: null,
    profile_photos: [PHOTO_A],
    echo_preset: null,
    bio: null,
  }),
  // 2 — intentional anonymous, no note, ? avatar
  fixture({
    _kind: "anonymous",
    request_id: "fix-req-02",
    requested_at: hoursAgo(2),
    display_name: null,
    profile_open_key: null,
    note: null,
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
  }),
  // 3 — permitted name + Echo preset (no photo)
  fixture({
    _kind: "named+echo",
    request_id: "fix-req-03",
    requested_at: hoursAgo(5),
    display_name: "Jordan",
    profile_open_key: "jordan",
    note: "I'm down!",
    avatar_url: null,
    profile_photos: [],
    echo_preset: "preset:owl_01",
    bio: null,
  }),
  // 4 — intentional anonymous + medium note
  fixture({
    _kind: "anonymous",
    request_id: "fix-req-04",
    requested_at: daysAgo(1),
    display_name: null,
    profile_open_key: null,
    note: "Saw your post — free after 6pm and can bring a friend if that is okay.",
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
  }),
  // 5 — permitted name + photo, missing note
  fixture({
    _kind: "named+photo",
    request_id: "fix-req-05",
    requested_at: daysAgo(1),
    display_name: "Sam Rivera",
    profile_open_key: "sam",
    note: null,
    avatar_url: null,
    profile_photos: [PHOTO_B],
    echo_preset: null,
    bio: null,
  }),
  // 6 — disclosed identity, empty display_name → Someone; Echo avatar
  fixture({
    _kind: "disclosed-missing-name",
    request_id: "fix-req-06",
    requested_at: daysAgo(2),
    display_name: null,
    profile_open_key: "alex-open",
    note: "Short note only.",
    avatar_url: null,
    profile_photos: [],
    echo_preset: "preset:owl_02",
    bio: null,
  }),
  // 7 — intentional anonymous empty
  fixture({
    _kind: "anonymous",
    request_id: "fix-req-07",
    requested_at: daysAgo(3),
    display_name: null,
    profile_open_key: null,
    note: null,
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
  }),
  // 8 — named + photo + long note
  fixture({
    _kind: "named+photo",
    request_id: "fix-req-08",
    requested_at: daysAgo(4),
    display_name: "Priya",
    profile_open_key: "priya",
    note: LONG_NOTE,
    avatar_url: null,
    profile_photos: [PHOTO_C],
    echo_preset: null,
    bio: null,
  }),
  // 9 — named + Echo, no note
  fixture({
    _kind: "named+echo",
    request_id: "fix-req-09",
    requested_at: daysAgo(5),
    display_name: "Chris Park",
    profile_open_key: "chris",
    note: null,
    avatar_url: null,
    profile_photos: [],
    echo_preset: "preset:owl_03",
    bio: null,
  }),
  // 10 — intentional anonymous + long note
  fixture({
    _kind: "anonymous",
    request_id: "fix-req-10",
    requested_at: daysAgo(6),
    display_name: null,
    profile_open_key: null,
    note: LONG_NOTE_ALT,
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
  }),
  // 11 — named + photo
  fixture({
    _kind: "named+photo",
    request_id: "fix-req-11",
    requested_at: daysAgo(7),
    display_name: "Lee Okonkwo",
    profile_open_key: "lee",
    note: "Count me in.",
    avatar_url: null,
    profile_photos: [PHOTO_A],
    echo_preset: null,
    bio: null,
  }),
  // 12 — intentional anonymous with Echo (anonymous may still have echo media)
  fixture({
    _kind: "anonymous",
    request_id: "fix-req-12",
    requested_at: daysAgo(8),
    display_name: null,
    profile_open_key: null,
    note: null,
    avatar_url: null,
    profile_photos: [],
    echo_preset: "preset:owl_04",
    bio: null,
  }),
  // 13 — named, missing avatar/echo → ?
  fixture({
    _kind: "named+missing-avatar",
    request_id: "fix-req-13",
    requested_at: daysAgo(9),
    display_name: "Nina",
    profile_open_key: "nina",
    note: LONG_NOTE,
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
  }),
  // 14 — named + photo short note
  fixture({
    _kind: "named+photo",
    request_id: "fix-req-14",
    requested_at: daysAgo(10),
    display_name: "Omar Haddad",
    profile_open_key: "omar",
    note: "Hi!",
    avatar_url: null,
    profile_photos: [PHOTO_B],
    echo_preset: null,
    bio: null,
  }),
  // 15 — intentional anonymous + note
  fixture({
    _kind: "anonymous",
    request_id: "fix-req-15",
    requested_at: daysAgo(11),
    display_name: null,
    profile_open_key: null,
    note: "Free Sunday morning if you still need one more.",
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
  }),
  // 16 — named + Echo
  fixture({
    _kind: "named+echo",
    request_id: "fix-req-16",
    requested_at: daysAgo(12),
    display_name: "Taylor Brooks",
    profile_open_key: "taylor",
    note: null,
    avatar_url: null,
    profile_photos: [],
    echo_preset: "preset:owl_05",
    bio: null,
  }),
  // 17 — disclosed missing name + photo
  fixture({
    _kind: "disclosed-missing-name",
    request_id: "fix-req-17",
    requested_at: daysAgo(13),
    display_name: null,
    profile_open_key: "ravi-open",
    note: LONG_NOTE_ALT,
    avatar_url: null,
    profile_photos: [PHOTO_C],
    echo_preset: null,
    bio: null,
  }),
  // 18 — intentional anonymous empty
  fixture({
    _kind: "anonymous",
    request_id: "fix-req-18",
    requested_at: daysAgo(14),
    display_name: null,
    profile_open_key: null,
    note: null,
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
  }),
  // 19 — named + Echo + note
  fixture({
    _kind: "named+echo",
    request_id: "fix-req-19",
    requested_at: daysAgo(15),
    display_name: "Elena Rossi",
    profile_open_key: "elena",
    note: "Can arrive 15 minutes early to help set up.",
    avatar_url: null,
    profile_photos: [],
    echo_preset: "preset:owl_01",
    bio: null,
  }),
  // 20 — intentional anonymous + long note
  fixture({
    _kind: "anonymous",
    request_id: "fix-req-20",
    requested_at: daysAgo(18),
    display_name: null,
    profile_open_key: null,
    note: LONG_NOTE,
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
  }),
];

export default function OpenPlanRequestersListPreview() {
  const [count, setCount] = useState<CountMode>(5);
  const rows = useMemo(() => FIXTURE_POOL.slice(0, count), [count]);

  if (!import.meta.env.DEV) return null;

  return (
    <div
      className="mx-auto min-h-dvh w-full max-w-lg bg-[var(--bg)] px-3 py-6 text-[var(--text)]"
      data-open-plan-requesters-list-preview="true"
    >
      <h1 className="text-lg font-semibold">Open Plan requesters (DEV)</h1>
      <p className="mt-1 text-[13px] text-[var(--text)]/55">
        Presentation-only fixtures. Chat / profile are no-ops. No network.
        Compare Name hidden (anonymous) vs Someone (disclosed, missing name) vs
        named+photo / Echo / ? avatar. Check separators and date under name.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {([1, 5, 10, 20] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCount(n)}
            data-preview-count={String(n)}
            className={[
              "inline-flex min-h-10 items-center rounded-full px-3 text-[13px] font-semibold",
              count === n
                ? "bg-[var(--brand)] text-[var(--brand-ink)]"
                : "border border-[var(--border)]/60 bg-[var(--surface)] text-[var(--text)]/80",
            ].join(" ")}
          >
            {n} requester{n === 1 ? "" : "s"}
          </button>
        ))}
      </div>

      <div
        className={`${glassPeoplePanelClass} mt-5 mx-auto flex max-h-[min(82vh,720px)] w-full flex-col`}
      >
        <div className="shrink-0 px-3 pt-3 pb-1.5">
          <p className="truncate text-[15px] font-semibold leading-snug">
            Coffee near campus
          </p>
          <p className="mt-0.5 truncate text-[12.5px] leading-snug text-[var(--text)]/55">
            Fixture plan · {count} synthetic row{count === 1 ? "" : "s"}
          </p>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-3 pt-2"
          style={{ maxHeight: "min(484px, calc(82vh - 7.5rem))" }}
        >
          <div
            className="flex min-w-0 flex-col"
            role="list"
            data-open-plan-requester-list="true"
          >
            {rows.map((row) => (
              <div
                key={row.request_id}
                role="listitem"
                className="group/op-req min-w-0"
              >
                <OpenPlanRequesterDrawerTile
                  request={row}
                  busy={false}
                  onAccept={() => {}}
                  onProfile={() => {}}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
