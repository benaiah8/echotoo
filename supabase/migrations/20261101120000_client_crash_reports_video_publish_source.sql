-- LOCAL ONLY until explicitly approved for production apply.
-- R3A: allow client_crash_reports.source = 'video_publish' for future
-- recoverable video-publish diagnostics (frontend wiring is a later pass).
--
-- Intentional diff vs 20260927120000_client_crash_reports.sql:
--   1) source CHECK adds video_publish
--   2) report_client_crash allowlist adds video_publish
-- Fingerprint, debounce, upsert, RLS, grants, columns unchanged.
--
-- Baseline: report_client_crash was last defined in
-- 20260927120000_client_crash_reports.sql. The only later crash migration
-- (20260927120100) replaces set_client_crash_report_status only.

-- ---------------------------------------------------------------------------
-- 1) Table source CHECK
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_crash_reports
  DROP CONSTRAINT IF EXISTS client_crash_reports_source_check;

ALTER TABLE public.client_crash_reports
  ADD CONSTRAINT client_crash_reports_source_check
  CHECK (source = ANY (ARRAY[
    'react_boundary'::text,
    'window_error'::text,
    'unhandled_rejection'::text,
    'video_publish'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2) report_client_crash — identical body except source allowlist
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_client_crash(
  p_source text,
  p_error_name text,
  p_message text,
  p_stack text DEFAULT NULL,
  p_component_stack text DEFAULT NULL,
  p_route text DEFAULT NULL,
  p_page_label text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_app_version text DEFAULT NULL,
  p_app_build text DEFAULT NULL,
  p_runtime_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_source text;
  v_platform text;
  v_error_name text;
  v_message text;
  v_stack text;
  v_component_stack text;
  v_route text;
  v_page_label text;
  v_app_version text;
  v_app_build text;
  v_runtime_summary text;
  v_fingerprint text;
  v_deduped boolean;
BEGIN
  v_source := btrim(COALESCE(p_source, ''));
  IF v_source NOT IN (
    'react_boundary',
    'window_error',
    'unhandled_rejection',
    'video_publish'
  ) THEN
    RAISE EXCEPTION 'Invalid source';
  END IF;

  v_platform := btrim(COALESCE(p_platform, ''));
  IF v_platform NOT IN ('web', 'android', 'ios') THEN
    RAISE EXCEPTION 'Invalid platform';
  END IF;

  v_error_name := left(btrim(COALESCE(p_error_name, '')), 100);
  IF v_error_name = '' THEN
    v_error_name := 'Error';
  END IF;

  v_message := left(
    public._client_crash_redact(btrim(COALESCE(p_message, ''))),
    500
  );
  IF btrim(v_message) = '' THEN
    v_message := '(no message)';
  END IF;

  v_stack := NULLIF(
    left(public._client_crash_redact(btrim(COALESCE(p_stack, ''))), 8000),
    ''
  );
  v_component_stack := NULLIF(
    left(public._client_crash_redact(btrim(COALESCE(p_component_stack, ''))), 4000),
    ''
  );
  v_runtime_summary := NULLIF(
    left(public._client_crash_redact(btrim(COALESCE(p_runtime_summary, ''))), 200),
    ''
  );

  v_route := public._client_crash_path_only(p_route);
  v_page_label := NULLIF(left(btrim(COALESCE(p_page_label, '')), 80), '');
  v_app_version := NULLIF(left(btrim(COALESCE(p_app_version, '')), 50), '');
  v_app_build := NULLIF(left(btrim(COALESCE(p_app_build, '')), 50), '');

  v_fingerprint := public._client_crash_fingerprint(
    v_source,
    v_error_name,
    v_message,
    v_stack,
    v_page_label
  );

  INSERT INTO public.client_crash_reports (
    fingerprint,
    source,
    error_name,
    message,
    stack,
    component_stack,
    route,
    page_label,
    platform,
    app_version,
    app_build,
    runtime_summary,
    last_user_id
  ) VALUES (
    v_fingerprint,
    v_source,
    v_error_name,
    v_message,
    v_stack,
    v_component_stack,
    v_route,
    v_page_label,
    v_platform,
    v_app_version,
    v_app_build,
    v_runtime_summary,
    auth.uid()
  )
  ON CONFLICT (fingerprint) DO UPDATE
  SET
    last_seen_at = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN now()
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.last_seen_at
      ELSE now()
    END,
    occurrence_count = CASE
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.occurrence_count
      ELSE public.client_crash_reports.occurrence_count + 1
    END,
    source = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.source
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.source
      ELSE EXCLUDED.source
    END,
    error_name = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.error_name
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.error_name
      ELSE EXCLUDED.error_name
    END,
    message = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.message
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.message
      ELSE EXCLUDED.message
    END,
    stack = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.stack
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.stack
      ELSE EXCLUDED.stack
    END,
    component_stack = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.component_stack
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.component_stack
      ELSE EXCLUDED.component_stack
    END,
    route = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.route
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.route
      ELSE EXCLUDED.route
    END,
    page_label = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.page_label
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.page_label
      ELSE EXCLUDED.page_label
    END,
    platform = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.platform
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.platform
      ELSE EXCLUDED.platform
    END,
    app_version = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.app_version
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.app_version
      ELSE EXCLUDED.app_version
    END,
    app_build = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.app_build
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.app_build
      ELSE EXCLUDED.app_build
    END,
    runtime_summary = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN EXCLUDED.runtime_summary
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.runtime_summary
      ELSE EXCLUDED.runtime_summary
    END,
    last_user_id = COALESCE(
      EXCLUDED.last_user_id,
      public.client_crash_reports.last_user_id
    ),
    status = CASE
      WHEN public.client_crash_reports.status = 'ignored' THEN 'ignored'
      WHEN public.client_crash_reports.status = 'resolved' THEN 'open'
      ELSE public.client_crash_reports.status
    END,
    resolved_at = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN NULL
      ELSE public.client_crash_reports.resolved_at
    END,
    resolved_by_user_id = CASE
      WHEN public.client_crash_reports.status = 'resolved' THEN NULL
      ELSE public.client_crash_reports.resolved_by_user_id
    END
  RETURNING (xmax <> 0) INTO v_deduped;

  RETURN jsonb_build_object(
    'reported', true,
    'deduped', COALESCE(v_deduped, false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.report_client_crash(
  text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.report_client_crash(
  text, text, text, text, text, text, text, text, text, text, text
) TO anon, authenticated;

COMMENT ON FUNCTION public.report_client_crash(
  text, text, text, text, text, text, text, text, text, text, text
) IS
  'Insert or bump a crash report. Fingerprint is server-owned SHA-256. last_user_id from auth.uid() only. Callable by anon and authenticated; table is not directly writable. Sources: react_boundary, window_error, unhandled_rejection, video_publish.';
