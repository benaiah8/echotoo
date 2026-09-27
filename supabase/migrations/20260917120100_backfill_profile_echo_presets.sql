-- P5A: Idempotent backfill of profiles.echo_preset for existing users.
-- LOCAL FILE ONLY. Do NOT apply without explicit production approval.
--
-- Goals:
--   * Existing non-null echo_preset values are immutable (WHERE echo_preset IS NULL).
--   * Prefer a valid legacy avatar_url preset:owl_XX when present.
--   * If photos are empty and avatar_url is a real non-preset face, seed
--     profile_photos = ARRAY[avatar_url] in the SAME UPDATE so the live
--     trg_profiles_sync_avatar_url keeps avatar_url = photos[1] (not Echo).
--   * Otherwise assign deterministic FNV-1a(user_id) matching frontend
--     deterministicEchoPresetForIdentity / resolveDisplayEchoPreset.
--   * Idempotent: second run updates 0 rows.
--   * updated_at intentionally changes via existing trg_profiles_updated_at.
--   * 0 Storage I/O — Echo is preset metadata only.
--
-- Parity vectors (TS stableIdentityHash → index → preset), for manual SQL review:
--   00000000-0000-4000-8000-000000000001 → 3480239522 → 2 → preset:owl_03
--   11111111-1111-4111-8111-111111111111 → 3508788259 → 1 → preset:owl_02
--   aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee → 1632803234 → 14 → preset:owl_15
--   f47ac10b-58cc-4372-a567-0e02b2c3d479 → 1533351232 → 10 → preset:owl_11
--   a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11 → 1189721999 → 11 → preset:owl_12

CREATE OR REPLACE FUNCTION public._echotoo_fnv1a_u32_for_echo_backfill(p_input text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path TO public, pg_temp
AS $fn$
DECLARE
  h bigint := 2166136261;
  i integer;
  c integer;
  mod32 bigint := 4294967296;
  prime bigint := 16777619;
BEGIN
  -- Unsigned 32-bit FNV-1a; ASCII UUID text matches JS charCodeAt.
  FOR i IN 1 .. char_length(p_input) LOOP
    c := ascii(substr(p_input, i, 1));
    h := ((h # c) * prime) % mod32;
  END LOOP;
  RETURN h;
END;
$fn$;

COMMENT ON FUNCTION public._echotoo_fnv1a_u32_for_echo_backfill(text) IS
  'Temporary P5A helper — FNV-1a u32 parity with frontend stableIdentityHash. Dropped at end of migration.';

WITH canonical(value) AS (
  VALUES
    ('preset:owl_01'),
    ('preset:owl_02'),
    ('preset:owl_03'),
    ('preset:owl_04'),
    ('preset:owl_05'),
    ('preset:owl_06'),
    ('preset:owl_07'),
    ('preset:owl_08'),
    ('preset:owl_09'),
    ('preset:owl_10'),
    ('preset:owl_11'),
    ('preset:owl_12'),
    ('preset:owl_13'),
    ('preset:owl_14'),
    ('preset:owl_15'),
    ('preset:owl_16'),
    ('preset:owl_17'),
    ('preset:owl_18')
),
owl_ids(idx, stem) AS (
  VALUES
    (0, 'owl_01'),
    (1, 'owl_02'),
    (2, 'owl_03'),
    (3, 'owl_04'),
    (4, 'owl_05'),
    (5, 'owl_06'),
    (6, 'owl_07'),
    (7, 'owl_08'),
    (8, 'owl_09'),
    (9, 'owl_10'),
    (10, 'owl_11'),
    (11, 'owl_12'),
    (12, 'owl_13'),
    (13, 'owl_14'),
    (14, 'owl_15'),
    (15, 'owl_16'),
    (16, 'owl_17'),
    (17, 'owl_18')
)
UPDATE public.profiles AS p
SET
  -- Defensive: empty photos + real non-preset avatar → keep face as Photo 1.
  -- Never rewrite a non-empty profile_photos array.
  profile_photos = CASE
    WHEN cardinality(COALESCE(p.profile_photos, '{}'::text[])) = 0
      AND p.avatar_url IS NOT NULL
      AND btrim(p.avatar_url) <> ''
      AND p.avatar_url NOT LIKE 'preset:%'
    THEN ARRAY[btrim(p.avatar_url)]
    ELSE p.profile_photos
  END,
  echo_preset = CASE
    -- Valid legacy preset avatar → preserve exact Echo.
    WHEN EXISTS (
      SELECT 1 FROM canonical c WHERE c.value = btrim(p.avatar_url)
    ) THEN btrim(p.avatar_url)
    -- Invalid preset:* or anything else → deterministic FNV(user_id).
    ELSE (
      'preset:' || (
        SELECT o.stem
        FROM owl_ids o
        WHERE o.idx = (
          public._echotoo_fnv1a_u32_for_echo_backfill(p.user_id::text) % 18
        )::integer
      )
    )
  END
WHERE p.echo_preset IS NULL;

DROP FUNCTION IF EXISTS public._echotoo_fnv1a_u32_for_echo_backfill(text);
