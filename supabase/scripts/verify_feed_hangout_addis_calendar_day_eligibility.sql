-- SELECT-only illustrations for the 20260924120100 hangout Addis calendar-day gate.
-- Local stack only. Do NOT run against production. Do NOT apply as a migration.

-- Confirmed Event stamp: 2026-09-18T21:00:00.000Z = Addis 2026-09-19 date-only midnight.
-- Investigation now: 2026-09-19T05:19:24Z / 08:19 Addis.

SELECT
  '2026-09-18T21:00:00.000Z'::timestamptz AS confirmed_instant,
  ((trim('2026-09-18T21:00:00.000Z'))::timestamptz) >= timestamptz '2026-09-19T05:19:24Z' AS instant_gte_now,
  ((trim('2026-09-18T21:00:00.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date AS addis_event_date,
  (timezone('Africa/Addis_Ababa', timestamptz '2026-09-19T05:19:24Z'))::date AS addis_today,
  ((trim('2026-09-18T21:00:00.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
    >= (timezone('Africa/Addis_Ababa', timestamptz '2026-09-19T05:19:24Z'))::date AS calendar_day_eligible;

SELECT
  'today after UTC midnight' AS case_id,
  ((trim('2026-09-18T21:00:00.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
    >= (timezone('Africa/Addis_Ababa', timestamptz '2026-09-19T00:30:00Z'))::date AS calendar_day_eligible,
  ((trim('2026-09-18T21:00:00.000Z'))::timestamptz) >= timestamptz '2026-09-19T00:30:00Z' AS instant_gte_now
UNION ALL
SELECT
  'timed already started today',
  ((trim('2026-09-19T03:00:00.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
    >= (timezone('Africa/Addis_Ababa', timestamptz '2026-09-19T05:19:24Z'))::date,
  ((trim('2026-09-19T03:00:00.000Z'))::timestamptz) >= timestamptz '2026-09-19T05:19:24Z'
UNION ALL
SELECT
  'tomorrow',
  ((trim('2026-09-19T21:00:00.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
    >= (timezone('Africa/Addis_Ababa', timestamptz '2026-09-19T05:19:24Z'))::date,
  ((trim('2026-09-19T21:00:00.000Z'))::timestamptz) >= timestamptz '2026-09-19T05:19:24Z'
UNION ALL
SELECT
  'yesterday',
  ((trim('2026-09-17T21:00:00.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
    >= (timezone('Africa/Addis_Ababa', timestamptz '2026-09-19T05:19:24Z'))::date,
  ((trim('2026-09-17T21:00:00.000Z'))::timestamptz) >= timestamptz '2026-09-19T05:19:24Z'
UNION ALL
SELECT
  'addis just before midnight',
  ((trim('2026-09-18T20:59:59.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
    >= (timezone('Africa/Addis_Ababa', timestamptz '2026-09-19T05:19:24Z'))::date,
  ((trim('2026-09-18T20:59:59.000Z'))::timestamptz) >= timestamptz '2026-09-19T05:19:24Z'
UNION ALL
SELECT
  'addis exactly midnight',
  ((trim('2026-09-18T21:00:00.000Z'))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
    >= (timezone('Africa/Addis_Ababa', timestamptz '2026-09-19T05:19:24Z'))::date,
  ((trim('2026-09-18T21:00:00.000Z'))::timestamptz) >= timestamptz '2026-09-19T05:19:24Z';
