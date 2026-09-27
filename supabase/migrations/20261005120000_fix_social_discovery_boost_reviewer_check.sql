-- LOCAL ONLY — do not apply to production until explicitly approved.
-- Fix set_post_social_discovery_boost reviewer check.
-- Production helper is public.is_report_reviewer() (no uuid argument).
-- Live RPC calls is_report_reviewer(uuid), which does not exist on production.
-- Same mismatch/repair as 20260927120100_fix_client_crash_status_reviewer_check.
-- Does NOT alter column, feed RPC, helpers, or report_reviewers.

CREATE OR REPLACE FUNCTION public.set_post_social_discovery_boost(
  p_post_id uuid,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_type text;
  v_boosted_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_report_reviewer() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing post id';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Missing enabled flag';
  END IF;

  SELECT p.type::text
  INTO v_type
  FROM public.posts p
  WHERE p.id = p_post_id
  FOR UPDATE;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_type <> 'hangout' THEN
    RAISE EXCEPTION 'Only Event posts can be prioritized for social discovery';
  END IF;

  IF p_enabled THEN
    UPDATE public.posts
    SET social_discovery_boosted_at = now()
    WHERE id = p_post_id
    RETURNING social_discovery_boosted_at INTO v_boosted_at;
  ELSE
    UPDATE public.posts
    SET social_discovery_boosted_at = NULL
    WHERE id = p_post_id
    RETURNING social_discovery_boosted_at INTO v_boosted_at;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'post_id', p_post_id,
    'enabled', p_enabled,
    'social_discovery_boosted_at', v_boosted_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_post_social_discovery_boost(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_post_social_discovery_boost(uuid, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.set_post_social_discovery_boost(uuid, boolean) IS
  'Reviewer-only: set/clear posts.social_discovery_boosted_at for Event (hangout) social-discovery rail priority.';
