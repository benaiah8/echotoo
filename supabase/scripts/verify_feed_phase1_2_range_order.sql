-- SELECT-only illustrations for Home Feed Phase 1.2 range ordering.
-- Review artifact. Do NOT run as a production migration.
-- Weekend = Saturday + Sunday. One post = one row (earliest matching day).
-- Matched-day uses MIN over a UNION, not Postgres LEAST (NULL-unsafe).

-- This Weekend window on Addis Tuesday 2026-09-08: Sat 2026-09-12 .. Sun 2026-09-13.

-- Saturday+Sunday selected dates → earliest weekend match is Saturday.
SELECT MIN(match_day) AS sat_sun_earliest
FROM (
  SELECT '2026-09-12'::date AS match_day
  UNION ALL
  SELECT '2026-09-13'::date
) matches;

-- Union of selected + recurring days still collapses to one earliest day.
SELECT MIN(match_day) AS earliest_match_day
FROM (
  SELECT '2026-09-12'::date AS match_day
  UNION ALL
  SELECT '2026-09-13'::date
  UNION ALL
  SELECT '2026-09-12'::date
) matches;

-- Sunday-only is still inside the weekend window.
SELECT
  '2026-09-13'::date BETWEEN '2026-09-12'::date AND '2026-09-13'::date
    AS sunday_only_in_weekend;

-- Recurring SU weekday in Sat–Sun generate_series includes Sunday.
SELECT EXISTS (
  SELECT 1
  FROM generate_series(
    '2026-09-12'::timestamp,
    '2026-09-13'::timestamp,
    interval '1 day'
  ) AS gs(d)
  WHERE CASE EXTRACT(ISODOW FROM gs.d::date)::int
    WHEN 6 THEN 'SA'
    WHEN 7 THEN 'SU'
  END = 'SU'
) AS recurring_sunday_in_weekend;
