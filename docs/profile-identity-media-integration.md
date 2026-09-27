# Profile Identity Media — Integration Manual

Handoff for the chat integrating **Pair Up**, **Discover**, **Open Plans**, and **Group Up** surfaces.

This document describes the reusable **`ProfileIdentityMedia`** primitive and how to wire it without N+1 Profile fetches or duplicating Profile storage rules.

---

## Profile system (live today)

**Public Profile identity (live):**

- **0–3 ordered real photos** in `profiles.profile_photos` (array order; index 0 = Primary)
- **`profiles.echo_preset`** — independent Echo companion (`preset:owl_NN`), not a fourth carousel photo
- **`profiles.avatar_url`** — compatibility primary face (DB trigger: `photos[0] ?? echo_preset ?? null`)
- Profile photos are **4:5**; real-photo UI typically uses `object-cover`
- Public Profile cache exists separately (`profileCache`) — **do not** fetch per candidate

**Private (never in People/Group Up payloads):**

- DOB / gender live in **`profile_private`**
- **Never** expose through candidate/list RPCs or this component

---

## P1 migration status

**File:** `supabase/migrations/20260911120000_people_candidate_profile_photos_payload.sql`

| Field | Status |
|-------|--------|
| Review | ✅ Passed provenance / semantic audit |
| Local | ✅ Present in worktree |
| Production | ❌ **NOT APPLIED** |

**Reason not applied:** `apply_migration` was unavailable in the Cursor Supabase MCP session during apply attempts.

**Before integrating:** verify production migration history includes `people_candidate_profile_photos_payload`. Until then, live RPCs effectively return **`avatar_url` only** (plus existing fields). The frontend primitive and parsers are **backward-compatible** either way.

---

## Frontend prep (already in worktree)

Candidate types and parsers accept:

```ts
profile_photos: string[]   // normalized to [] when missing
echo_preset: string | null // normalized to null when missing
avatar_url: string | null  // unchanged
```

**Before P1:** `profile_photos → []`, resolver falls back to `avatar_url` / Echo.

**After P1:** real arrays flow automatically — no parser changes required.

---

## Reusable primitives

| Artifact | Path |
|----------|------|
| Input contract + resolver | `src/lib/profileIdentityMedia.ts` |
| Visual component | `src/components/profile/ProfileIdentityMedia.tsx` |

**Do not use for owner Profile editing.** Keep **`ProfilePhotoHero`** for Edit/Own Profile (Add slots, atmosphere, Echo companion overlap).

### Resolver: `resolveProfileIdentityMedia(source)`

**Priority (strict order):**

1. **Real `profile_photos`** (ordered, max 3) — carousel uses **only** these
2. **`echo_preset`** when zero real photos
3. **Legacy `avatar_url`** (real image or preset token)
4. **Empty** fallback (initial from `display_name` / `username` / `?`)

**Critical:** If photos are `[A, B, C]` and Echo is `owl_04`, carousel is **A → B → C**. Echo is **never** photo #4.

### Component API

```tsx
import ProfileIdentityMedia from "../../components/profile/ProfileIdentityMedia";

// Large person card (Pair Up, Discover, Open Plan browse)
<ProfileIdentityMedia
  source={candidate}
  mode="carousel"
/>

// Compact row (request, member list, group grid)
<ProfileIdentityMedia
  source={member}
  mode="primary"
/>
```

**Props:**

| Prop | Description |
|------|-------------|
| `source` | `ProfileIdentityMediaSource` — minimal public identity fields |
| `mode` | `"primary"` \| `"carousel"` |
| `activeIndex?` | Controlled carousel index (real photos only) |
| `onActiveIndexChange?` | Controlled index callback |
| `showIndicators?` | Dots when `photos.length > 1` (carousel; default `true`) |
| `className?` | Wrapper styling |
| `imageClassName?` | Override photo `img` class (default `object-cover` fill) |
| `withPhoto?` | Skip image load when `false` (off-screen deck slivers) |

**Carousel behavior:** tap / Enter / Space cycles real photos when `photos.length > 1`. Dots reflect **real photos only** — never Echo.

**Echo presentation:** centered circular preset (not full-bleed fake photo).

---

## How consumers should integrate

### Pair Up / Discover card

```tsx
<ProfileIdentityMedia source={candidate} mode="carousel" />
```

Pass the **candidate row** directly (after parser normalization). Do not call `getProfileByUserId`.

### Open Plan browse card

Same media component, but **preserve anonymity** — do not add `display_name`, `username`, `profile_id`, or `creator_id` to the card unless already in the contract.

### Group Up member / participant row

```tsx
<ProfileIdentityMedia source={member} mode="primary" />
```

### Request row (Open Plan incoming, etc.)

```tsx
<ProfileIdentityMedia source={request} mode="primary" />
```

---

## Query efficiency rule

**Do not:**

```
candidate list RPC
  → getProfileByUserId(each candidate)   // N+1
```

**Do:**

```
list RPC JOIN profiles
  → avatar_url, profile_photos, echo_preset
  → pass row to ProfileIdentityMedia
```

**Target:** 1 list RPC, **0** per-card Profile SELECTs.

---

## P1 RPCs (reviewed, not live)

When applied, these RPCs gain **`profile_photos`** and **`echo_preset`** only:

- `list_pair_up_candidates`
- `list_discover_pair_up_candidates`
- `list_open_plan_candidates`
- `list_my_open_plan_requests`

No private fields. **`avatar_url` preserved.**

---

## Open Plan anonymity

Pre-accept Open Plan browse and incoming request rows are **anonymous**.

Adding media fields does **not** authorize exposing:

- `display_name`
- `username`
- `creator_id` / `requester_id`
- `profile_id`

Use supplied **`avatar_url` / `profile_photos` / `echo_preset`** only.

---

## Future: real-photo participation gate (not implemented)

When product ships **≥1 real photo** requirement:

- **Echo alone does not qualify**
- **Frontend:** friendly preflight before join/request
- **Backend:** authoritative RPC guard
- **List RPCs:** filter zero-photo participants from decks

Do not scatter UI-only checks. Grandfather policy for existing opportunities should be confirmed with product before backend migration.

---

## Transition policy (when gate ships)

Recommended rollout:

- Block **new / rejoined** participation without a real photo immediately
- Hide zero-photo users in candidate list RPCs
- Avoid destructive mass deletion of existing `social_opportunities`
- Confirm grandfather behavior with product owner

---

## Profile changes vs opportunities

**Do not snapshot** photos into `social_opportunities`.

List RPCs should **JOIN live `profiles`**. Photo add/remove/reorder, Primary change, and Echo change propagate on the next list/deck refresh.

---

## Group Up guidance

| Surface | Mode |
|---------|------|
| Large participant / discovery card | `carousel` (if multi-photo useful) |
| Compact member grid / list | `primary` |
| Group chat circular avatars | existing `avatar_url` / Primary is fine |

Do not force multi-photo everywhere.

---

## What not to copy

**Do not reuse `ProfilePhotoHero`** for People / Group Up.

Use **`ProfileIdentityMedia`** — no Add slots, atmosphere, Echo overlap, or owner edit behavior.

---

## Integration checklist

- [ ] Backend payload supplies `profile_photos` + `echo_preset` (verify P1 applied)
- [ ] No N+1 Profile reads
- [ ] `avatar_url` preserved for compatibility
- [ ] Carousel uses **only** real photos
- [ ] Echo **not** appended to carousel
- [ ] Compact surfaces use `mode="primary"`
- [ ] Open Plan anonymity preserved
- [ ] DOB / gender absent from payloads
- [ ] Zero-photo fallback remains defensive (legacy `avatar_url`)
- [ ] 1-photo eligibility handled separately (future)
- [ ] `npx tsc --noEmit` + manual mobile test

---

## Tests

Resolver unit tests: `src/lib/profileIdentityMedia.test.ts`

Run: `npm test -- src/lib/profileIdentityMedia.test.ts`
