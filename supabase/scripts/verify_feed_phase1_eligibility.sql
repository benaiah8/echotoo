-- SELECT-only illustrations for Home Feed Phase 1 eligibility.
-- Review artifact. Run against a local stack only after replacing the function locally.
-- Do NOT run as a production migration. Do NOT convert Places/Events rows.

-- Calendar-day vs instant >= now() for Addis midnight ISO (2026-09-07T21:00:00.000Z = Addis 2026-09-08).
-- Instant gate can drop same-day events after UTC midnight; calendar-day keeps them through Addis date.

SELECT
  '2026-09-07T21:00:00.000Z'::timestamptz AS selected_instant,
  ((trim('2026-09-07T21:00:00.000Z'))::timestamptz) >= now() AS instant_gte_now,
  ((trim('2026-09-07T21:00:00.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
    AS addis_event_date,
  (timezone('Africa/Addis_Ababa', now()))::date AS addis_today,
  ((trim('2026-09-07T21:00:00.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
    >= (timezone('Africa/Addis_Ababa', now()))::date AS calendar_day_eligible;

SELECT
  '2026-09-08T21:00:00.000Z'::timestamptz AS tomorrow_addis_midnight,
  ((trim('2026-09-08T21:00:00.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
    >= (timezone('Africa/Addis_Ababa', now()))::date AS calendar_day_eligible;

-- Published hangouts: compare instant vs calendar-day eligibility (read-only).
SELECT
  p.id,
  p.type,
  p.selected_dates,
  p.is_recurring,
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
    WHERE (elem::timestamptz) >= now()
  ) AS instant_eligible,
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
    WHERE NULLIF(trim(elem), '') IS NOT NULL
      AND ((trim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
        >= (timezone('Africa/Addis_Ababa', now()))::date
  ) AS calendar_day_eligible
FROM public.posts p
WHERE p.type = 'hangout'
  AND COALESCE(p.status, 'published') = 'published'
  AND COALESCE(p.is_recurring, false) = false
ORDER BY p.created_at DESC
LIMIT 50;
