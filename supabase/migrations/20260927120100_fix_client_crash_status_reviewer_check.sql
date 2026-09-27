-- Fix set_client_crash_report_status reviewer check.
-- Production helper is public.is_report_reviewer() (no uuid argument).
-- The original crash RPC called is_report_reviewer(uuid), which does not exist live.
-- Do not alter 20260927120000_client_crash_reports.sql (already applied).

CREATE OR REPLACE FUNCTION public.set_client_crash_report_status(
  p_report_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_status text;
  v_id uuid;
  v_out text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_report_reviewer() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Missing crash report id';
  END IF;

  v_status := btrim(COALESCE(p_status, ''));
  IF v_status NOT IN ('open', 'resolved', 'ignored') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.client_crash_reports
  SET
    status = v_status,
    resolved_at = CASE
      WHEN v_status IN ('resolved', 'ignored') THEN now()
      ELSE NULL
    END,
    resolved_by_user_id = CASE
      WHEN v_status IN ('resolved', 'ignored') THEN v_actor
      ELSE NULL
    END
  WHERE id = p_report_id
  RETURNING id, status INTO v_id, v_out;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Crash report not found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'status', v_out
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_client_crash_report_status(uuid, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_client_crash_report_status(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.set_client_crash_report_status(uuid, text) IS
  'Reviewer-only status change. resolved_at / resolved_by_user_id come from the server. ignored uses the same metadata fields.';
