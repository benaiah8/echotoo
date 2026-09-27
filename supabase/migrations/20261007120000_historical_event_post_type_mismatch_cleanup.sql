-- Historical Event/Post type mismatch cleanup (data only).
-- Source: production read-only audit on otfbgcvxevwtybfltvuf (exp platform.),
--         28 published mismatches: 20 experience+schedule, 8 hangout+no-schedule.
--
-- Rules (exact audited IDs only):
--   experience → hangout: type=hangout, rating_enabled=false
--                       preserve ratings, rsvp_capacity, social opportunities
--   hangout → experience: type=experience, rsvp_capacity=null
--                       preserve RSVP responses; do not force ratings on
--
-- Safety:
--   - aborts unless pre-state is exactly these 20 + 8 rows (ID + type + schedule)
--   - no deletes; no social/rating/RSVP-row mutations; no caption/schedule/media edits
--   - does not touch updated_at (feed freshness uses created_at; avoid reordering side effects)
--
-- NULL-safe structured schedule (always TRUE/FALSE, never UNKNOWN):
--   CASE WHEN jsonb_typeof(selected_dates) = 'array'
--        THEN jsonb_array_length(selected_dates) > 0
--        ELSE false END
--   OR COALESCE(cardinality(recurrence_days), 0) > 0
--   OR COALESCE(is_recurring, false) = true
-- (Avoid `jsonb_typeof(...) = 'array' AND ...` — when selected_dates IS NULL that
--  yields NULL, so NOT(...) is NULL and WHERE drops all hangout+no-schedule rows.)
--
-- DO NOT apply until explicitly approved. Verification SQL is comments only (not executed here).

DO $cleanup$
DECLARE
  v_exp_to_hang_ids uuid[] := ARRAY[
    '2a4848b8-4e07-48ec-95ec-6217b728132b'::uuid,
    '1bb13da3-7b81-4fd6-a9c9-37db24a9a7cd'::uuid,
    '2b48e23a-b5ff-421a-9c9e-b0eeacc61479'::uuid,
    '03097419-16aa-41c1-b645-e05cda3854ca'::uuid,
    'ef4adffa-c46e-4a35-8766-3401bde5944f'::uuid,
    'a5478dc7-eb02-4599-98f4-10adeffc348c'::uuid,
    '3c533174-a979-4b94-98c5-19a952204756'::uuid,
    'b716507b-74b4-4be2-b602-f8cf17419822'::uuid,
    '02cb7428-2a3d-4a08-9310-f838104ec923'::uuid,
    'd8e30c7b-51e7-4b1b-9ff9-32b23f7e6f05'::uuid,
    'aa5752ba-200f-40e7-89d3-59fdd20e7643'::uuid,
    'dbf42b4d-626e-40ed-9c52-e91ed185d5cd'::uuid,
    'ec02433c-2dde-488c-bf1a-37f37e32f98b'::uuid,
    '50b38b24-52a6-4267-91b5-e2d491e17607'::uuid,
    '3447fa49-cbd8-4a61-8717-1e4b98d913bf'::uuid,
    'a775ca79-3a52-46c2-9e89-9acd4006d26a'::uuid,
    '3cf04d5e-3bbe-4e36-ab93-4edcb71aba48'::uuid,
    '15733811-6fb6-4dc1-8138-24aba52a7101'::uuid,
    'ef7ed5a7-2f38-4d30-93e6-1de4017e18d3'::uuid,
    '622ea0e1-bca2-4368-839b-cbc4153f61c2'::uuid
  ];
  v_hang_to_exp_ids uuid[] := ARRAY[
    'a9286b7b-7b57-4ae4-b499-7047ff65aae1'::uuid,
    'c8858c88-1a26-4987-9c6e-e8ded98f89d4'::uuid,
    'aeb28d24-dfae-4201-b533-2f62a1d0ef47'::uuid,
    '3a12c5c8-f753-4e55-a88f-193ddfc5cdb4'::uuid,
    '183fa023-23d7-4f83-a121-064fb13ebd19'::uuid,
    '29f51730-3a9d-40d7-96ff-712f9f04a0c9'::uuid,
    '14ced246-9f3b-42c9-b845-a18b97b77580'::uuid,
    'f8e23085-0564-4235-828b-0eba4bfd771b'::uuid
  ];
  v_exp_match int;
  v_hang_match int;
  v_global_a int;
  v_global_b int;
  v_updated_exp int;
  v_updated_hang int;
  v_post_global_a int;
  v_post_global_b int;
BEGIN
  -- Preflight A: exact 20 audited experience + schedule rows.
  SELECT COUNT(*)::int
  INTO v_exp_match
  FROM public.posts p
  WHERE p.id = ANY (v_exp_to_hang_ids)
    AND p.type = 'experience'::public.post_type
    AND COALESCE(p.status, 'published') = 'published'
    AND (
      CASE
        WHEN jsonb_typeof(p.selected_dates) = 'array'
        THEN jsonb_array_length(p.selected_dates) > 0
        ELSE false
      END
      OR COALESCE(cardinality(p.recurrence_days), 0) > 0
      OR COALESCE(p.is_recurring, false) = true
    );

  IF v_exp_match <> 20 THEN
    RAISE EXCEPTION
      'historical Event/Post cleanup aborted: expected 20 experience+schedule IDs, found %',
      v_exp_match;
  END IF;

  -- Preflight B: exact 8 audited hangout + no-schedule rows.
  SELECT COUNT(*)::int
  INTO v_hang_match
  FROM public.posts p
  WHERE p.id = ANY (v_hang_to_exp_ids)
    AND p.type = 'hangout'::public.post_type
    AND COALESCE(p.status, 'published') = 'published'
    AND NOT (
      CASE
        WHEN jsonb_typeof(p.selected_dates) = 'array'
        THEN jsonb_array_length(p.selected_dates) > 0
        ELSE false
      END
      OR COALESCE(cardinality(p.recurrence_days), 0) > 0
      OR COALESCE(p.is_recurring, false) = true
    );

  IF v_hang_match <> 8 THEN
    RAISE EXCEPTION
      'historical Event/Post cleanup aborted: expected 8 hangout+no-schedule IDs, found %',
      v_hang_match;
  END IF;

  -- Preflight global: published mismatches must be exactly these 28 (no extras / no drift).
  SELECT
    COUNT(*) FILTER (
      WHERE p.type = 'experience'::public.post_type
        AND (
          CASE
            WHEN jsonb_typeof(p.selected_dates) = 'array'
            THEN jsonb_array_length(p.selected_dates) > 0
            ELSE false
          END
          OR COALESCE(cardinality(p.recurrence_days), 0) > 0
          OR COALESCE(p.is_recurring, false) = true
        )
    )::int,
    COUNT(*) FILTER (
      WHERE p.type = 'hangout'::public.post_type
        AND NOT (
          CASE
            WHEN jsonb_typeof(p.selected_dates) = 'array'
            THEN jsonb_array_length(p.selected_dates) > 0
            ELSE false
          END
          OR COALESCE(cardinality(p.recurrence_days), 0) > 0
          OR COALESCE(p.is_recurring, false) = true
        )
    )::int
  INTO v_global_a, v_global_b
  FROM public.posts p
  WHERE COALESCE(p.status, 'published') = 'published'
    AND p.type IN ('experience'::public.post_type, 'hangout'::public.post_type);

  IF v_global_a <> 20 OR v_global_b <> 8 THEN
    RAISE EXCEPTION
      'historical Event/Post cleanup aborted: global mismatches are %/% (expected 20/8)',
      v_global_a, v_global_b;
  END IF;

  -- Ensure every global mismatch id is in the audited sets (no surprise rows).
  IF EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE COALESCE(p.status, 'published') = 'published'
      AND (
        (
          p.type = 'experience'::public.post_type
          AND (
            CASE
              WHEN jsonb_typeof(p.selected_dates) = 'array'
              THEN jsonb_array_length(p.selected_dates) > 0
              ELSE false
            END
            OR COALESCE(cardinality(p.recurrence_days), 0) > 0
            OR COALESCE(p.is_recurring, false) = true
          )
          AND NOT (p.id = ANY (v_exp_to_hang_ids))
        )
        OR (
          p.type = 'hangout'::public.post_type
          AND NOT (
            CASE
              WHEN jsonb_typeof(p.selected_dates) = 'array'
              THEN jsonb_array_length(p.selected_dates) > 0
              ELSE false
            END
            OR COALESCE(cardinality(p.recurrence_days), 0) > 0
            OR COALESCE(p.is_recurring, false) = true
          )
          AND NOT (p.id = ANY (v_hang_to_exp_ids))
        )
      )
  ) THEN
    RAISE EXCEPTION
      'historical Event/Post cleanup aborted: unexpected mismatch id outside audited set';
  END IF;

  -- A: experience → hangout (preserve rsvp_capacity; force rating_enabled off)
  UPDATE public.posts p
  SET
    type = 'hangout'::public.post_type,
    rating_enabled = false
  WHERE p.id = ANY (v_exp_to_hang_ids)
    AND p.type = 'experience'::public.post_type
    AND COALESCE(p.status, 'published') = 'published'
    AND (
      CASE
        WHEN jsonb_typeof(p.selected_dates) = 'array'
        THEN jsonb_array_length(p.selected_dates) > 0
        ELSE false
      END
      OR COALESCE(cardinality(p.recurrence_days), 0) > 0
      OR COALESCE(p.is_recurring, false) = true
    );

  GET DIAGNOSTICS v_updated_exp = ROW_COUNT;
  IF v_updated_exp <> 20 THEN
    RAISE EXCEPTION
      'historical Event/Post cleanup aborted: experience→hangout updated % rows (expected 20)',
      v_updated_exp;
  END IF;

  -- B: hangout → experience (null capacity; do not touch rating_enabled)
  UPDATE public.posts p
  SET
    type = 'experience'::public.post_type,
    rsvp_capacity = null
  WHERE p.id = ANY (v_hang_to_exp_ids)
    AND p.type = 'hangout'::public.post_type
    AND COALESCE(p.status, 'published') = 'published'
    AND NOT (
      CASE
        WHEN jsonb_typeof(p.selected_dates) = 'array'
        THEN jsonb_array_length(p.selected_dates) > 0
        ELSE false
      END
      OR COALESCE(cardinality(p.recurrence_days), 0) > 0
      OR COALESCE(p.is_recurring, false) = true
    );

  GET DIAGNOSTICS v_updated_hang = ROW_COUNT;
  IF v_updated_hang <> 8 THEN
    RAISE EXCEPTION
      'historical Event/Post cleanup aborted: hangout→experience updated % rows (expected 8)',
      v_updated_hang;
  END IF;

  -- Post-check: no remaining published experience/hangout mismatches.
  SELECT
    COUNT(*) FILTER (
      WHERE p.type = 'experience'::public.post_type
        AND (
          CASE
            WHEN jsonb_typeof(p.selected_dates) = 'array'
            THEN jsonb_array_length(p.selected_dates) > 0
            ELSE false
          END
          OR COALESCE(cardinality(p.recurrence_days), 0) > 0
          OR COALESCE(p.is_recurring, false) = true
        )
    )::int,
    COUNT(*) FILTER (
      WHERE p.type = 'hangout'::public.post_type
        AND NOT (
          CASE
            WHEN jsonb_typeof(p.selected_dates) = 'array'
            THEN jsonb_array_length(p.selected_dates) > 0
            ELSE false
          END
          OR COALESCE(cardinality(p.recurrence_days), 0) > 0
          OR COALESCE(p.is_recurring, false) = true
        )
    )::int
  INTO v_post_global_a, v_post_global_b
  FROM public.posts p
  WHERE COALESCE(p.status, 'published') = 'published'
    AND p.type IN ('experience'::public.post_type, 'hangout'::public.post_type);

  IF v_post_global_a <> 0 OR v_post_global_b <> 0 THEN
    RAISE EXCEPTION
      'historical Event/Post cleanup aborted: post-check mismatches remain %/% (expected 0/0)',
      v_post_global_a, v_post_global_b;
  END IF;
END;
$cleanup$;

-- ---------------------------------------------------------------------------
-- Read-only post-apply verification (DO NOT run as part of apply; run manually):
--
-- 1) Global mismatch counts → expect 0 / 0
-- WITH base AS (
--   SELECT type::text AS type,
--     (
--       CASE
--         WHEN jsonb_typeof(selected_dates) = 'array'
--         THEN jsonb_array_length(selected_dates) > 0
--         ELSE false
--       END
--       OR COALESCE(cardinality(recurrence_days), 0) > 0
--       OR COALESCE(is_recurring, false) = true
--     ) AS has_sched
--   FROM public.posts
--   WHERE COALESCE(status, 'published') = 'published'
-- )
-- SELECT
--   COUNT(*) FILTER (WHERE type = 'experience' AND has_sched) AS a,
--   COUNT(*) FILTER (WHERE type = 'hangout' AND NOT has_sched) AS b
-- FROM base;
--
-- 2) Audited IDs now have intended types + untouched schedule/author:
-- SELECT id, type::text, author_id, selected_dates, is_recurring, recurrence_days,
--        rating_enabled, rsvp_capacity
-- FROM public.posts
-- WHERE id IN (/* 28 ids */);
--
-- 3) Related rows still present (spot-check counts vs audit):
-- SELECT 'post_ratings' AS t, COUNT(*) FROM public.post_ratings
--   WHERE post_id IN (/* 28 */);
-- SELECT 'rsvp_responses', COUNT(*) FROM public.rsvp_responses
--   WHERE post_id IN (/* 28 */);  -- expect >= 1 for a9286b7b-…
-- SELECT 'social_opportunities', kind, status, COUNT(*)
--   FROM public.social_opportunities
--   WHERE source_post_id IN (/* 28 */)
--   GROUP BY 1,2,3;
--
-- ---------------------------------------------------------------------------
-- Narrow rollback (DO NOT run blindly; only if cleanup must be reverted and
-- rows still match post-cleanup classification — will not restore later edits):
-- Prefer a fresh audited SELECT before any rollback.
-- ---------------------------------------------------------------------------
