-- LOCAL ONLY — do not apply to production until explicitly approved.
-- Read supabase/MIGRATION_STATUS.md before any production apply.
--
-- People deck browse seen-state (cross-device). Scopes: my_plans, discover,
-- open_plans, groups_new. Groups Yours is excluded.
-- item_id has no FK: opportunity_id or Groups conversation fallback.
-- First-seen within the active 14-day window (no seen_at refresh on recycle).
-- Expired rows (>14d) may restart seen_at on a genuine new mark.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE public.people_deck_seen (
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  scope text NOT NULL,
  item_id uuid NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope, item_id),
  CONSTRAINT people_deck_seen_scope_check CHECK (
    scope IN ('my_plans', 'discover', 'open_plans', 'groups_new')
  )
);

CREATE INDEX people_deck_seen_user_scope_seen_at_idx
  ON public.people_deck_seen (user_id, scope, seen_at DESC);

COMMENT ON TABLE public.people_deck_seen IS
  'Per-user People deck browse seen ids. RPC-only. item_id is opportunity or Groups New deck-row uuid; no FK. First-seen within active 14-day window.';

COMMENT ON COLUMN public.people_deck_seen.item_id IS
  'Browse identity uuid (opportunity_id, or Groups New conversation_id fallback). Intentionally no FK.';

COMMENT ON COLUMN public.people_deck_seen.seen_at IS
  'First-seen timestamp within the active 14-day window. Recycled/reseen cards inside the window do not refresh; expired rows may restart on a new mark.';

-- ---------------------------------------------------------------------------
-- Table security (mirror company_announcement_reads)
-- ---------------------------------------------------------------------------
ALTER TABLE public.people_deck_seen ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.people_deck_seen FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_people_deck_seen — compact 14-day window, cap 1000
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_people_deck_seen(p_scope text)
RETURNS TABLE (
  item_id uuid,
  seen_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := btrim(COALESCE(p_scope, ''));
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF v_scope NOT IN ('my_plans', 'discover', 'open_plans', 'groups_new') THEN
    RAISE EXCEPTION 'invalid scope';
  END IF;

  RETURN QUERY
  SELECT s.item_id, s.seen_at
  FROM public.people_deck_seen s
  WHERE s.user_id = v_uid
    AND s.scope = v_scope
    AND s.seen_at >= now() - interval '14 days'
  ORDER BY s.seen_at DESC
  LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION public.get_people_deck_seen(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_people_deck_seen(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_people_deck_seen(text) IS
  'Compact People deck seen ids for auth.uid() + scope. 14-day window, LIMIT 1000. RPC-only.';

-- ---------------------------------------------------------------------------
-- mark_people_deck_seen — first-seen in active window; refresh only if expired
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.mark_people_deck_seen(
  p_scope text,
  p_item_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := btrim(COALESCE(p_scope, ''));
  v_distinct integer := 0;
  v_affected integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF v_scope NOT IN ('my_plans', 'discover', 'open_plans', 'groups_new') THEN
    RAISE EXCEPTION 'invalid scope';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_distinct
  FROM (
    SELECT DISTINCT u AS id
    FROM unnest(p_item_ids) AS u
    WHERE u IS NOT NULL
  ) d;

  IF v_distinct = 0 THEN
    RETURN 0;
  END IF;

  IF v_distinct > 50 THEN
    RAISE EXCEPTION
      'mark_people_deck_seen: at most 50 distinct item ids per call (got %)',
      v_distinct;
  END IF;

  -- New insert establishes first-seen.
  -- Conflict inside the 14-day window: leave seen_at unchanged.
  -- Conflict after expiry: restart seen_at for a new 14-day cycle.
  -- ROW_COUNT counts inserted rows + rows that actually updated.
  INSERT INTO public.people_deck_seen (user_id, scope, item_id, seen_at)
  SELECT DISTINCT v_uid, v_scope, x.id, now()
  FROM unnest(p_item_ids) AS x(id)
  WHERE x.id IS NOT NULL
  ON CONFLICT (user_id, scope, item_id)
  DO UPDATE
  SET seen_at = EXCLUDED.seen_at
  WHERE public.people_deck_seen.seen_at < now() - interval '14 days';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_people_deck_seen(text, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_people_deck_seen(text, uuid[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.mark_people_deck_seen(text, uuid[]) IS
  'Batch People deck seen mark (auth.uid() only). First-seen within active 14-day window; expired rows may restart seen_at. Rejects >50 distinct ids. Returns rows newly established/refreshed.';
