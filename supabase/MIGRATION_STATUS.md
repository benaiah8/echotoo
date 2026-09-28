# Supabase migration status (read before any production DB work)

**Audience:** every Cursor chat and developer touching production Supabase migrations for this repo.

**Production project:** `otfbgcvxevwtybfltvuf`

## Current state

Local migration files under `supabase/migrations/` and **remote** migration history (`supabase_migrations.schema_migrations`) are **not** a clean one-to-one match. Treat that as known and unresolved until an explicit history audit and reconciliation is completed.

### Known mismatch (Home Feed slot-0)

| Fact | Detail |
|------|--------|
| Hollow remote row | `20260922233023` / `feed_restore_slot0_location_keyinfo` — comments-only payload from a **failed Apply Migration** invocation (no function body). |
| Live correction | Home Feed slot-0 metadata (`slot0_location_name`, `slot0_location_url`, `slot0_key_info`) was later restored successfully via **checksum-gated Execute SQL**. |
| Live status | That production correction is **live** and **visually verified**. |
| History gap | The successful Execute SQL correction is **not** registered as a separate remote migration-history row. |
| Incident docs | `review-artifacts/feed_restore_slot0_location_keyinfo/` |

## Hard prohibitions (while mismatch remains unaudited)

1. **Do not** rerun the Home Feed corrective SQL (`20261014120000_feed_restore_slot0_location_keyinfo_body.sql` or equivalents) merely to create a migration-history entry. The live function already has the fix.
2. **Do not** delete, fabricate, or manually alter migration-history rows simply to make local and remote histories look synchronized.
3. **Do not** run `supabase db push` while this mismatch remains unaudited and unreconciled.

## Required checks before every future production migration

Before applying **any** production database migration:

1. Compare **remote migration history** for project `otfbgcvxevwtybfltvuf`.
2. Inspect **current live schema/function state** relevant to the intended change (live production is the source of truth for whether a local file is still needed or safe).
3. Confirm the **exact intended local migration** file contents (full SQL, name/version) match what was approved.

Then apply **only** the explicitly approved migration — nothing adjacent, nothing “while we’re here,” and nothing solely for history cosmetics.

## Source of truth

When validating whether a local migration is safe to apply: **existing live production state** wins over assumptions from local file names or remote history rows alone.

### Applied: People deck seen-state (cross-device browse history)

| Fact | Detail |
|------|--------|
| Local migration file | `supabase/migrations/20260928140000_people_deck_seen.sql` |
| Production version | `20260928054713` / `people_deck_seen` |
| Live objects | `public.people_deck_seen`, `get_people_deck_seen(text)`, `mark_people_deck_seen(text, uuid[])` |
| Verification | Catalog/RLS/grants/`pg_get_functiondef` verified post-apply (2026-09-28) |
| Candidate RPCs | Unchanged (`list_pair_up_candidates`, `list_discover_pair_up_candidates`, `list_open_plan_candidates`, `list_group_up_candidates`) |
| Note | Production version timestamp differs from local filename (Apply Migration assigned `20260928054713`). Do not rewrite history to force-match. |
