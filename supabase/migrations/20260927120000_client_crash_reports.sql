-- LOCAL ONLY — do not apply to production until explicitly approved.
-- Phase 1 JS/React crash reports: one table, reviewer-only reads,
-- client submit + reviewer status via SECURITY DEFINER RPCs.
--
-- Reuses existing admin authority: public.report_reviewers / is_report_reviewer().
-- Do not invent is_admin or JWT metadata roles.
--
-- Fingerprint uses built-in sha256(bytea) (PostgreSQL 11+). No pgcrypto.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_crash_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL,
  error_name text NOT NULL,
  message text NOT NULL,
  stack text,
  component_stack text,
  route text,
  page_label text,
  platform text NOT NULL,
  app_version text,
  app_build text,
  runtime_summary text,
  last_user_id uuid,
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_crash_reports_fingerprint_sha256_check
    CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT client_crash_reports_occurrence_count_check
    CHECK (occurrence_count >= 1),
  CONSTRAINT client_crash_reports_status_check
    CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text, 'ignored'::text])),
  CONSTRAINT client_crash_reports_source_check
    CHECK (source = ANY (ARRAY[
      'react_boundary'::text,
      'window_error'::text,
      'unhandled_rejection'::text
    ])),
  CONSTRAINT client_crash_reports_platform_check
    CHECK (platform = ANY (ARRAY['web'::text, 'android'::text, 'ios'::text]))
);

CREATE INDEX IF NOT EXISTS client_crash_reports_status_last_seen_idx
  ON public.client_crash_reports (status, last_seen_at DESC);

COMMENT ON TABLE public.client_crash_reports IS
  'Deduped JS/React crash reports. Writes only via report_client_crash. Status only via set_client_crash_report_status. SELECT: is_report_reviewer() only. last_user_id has no FK so rows survive account deletion.';

COMMENT ON COLUMN public.client_crash_reports.fingerprint IS
  'Server-owned SHA-256 hex of source + error_name + normalized message + top stack frame + page_label.';

COMMENT ON COLUMN public.client_crash_reports.last_user_id IS
  'auth.uid() from report_client_crash when signed in. Not client-supplied. No FK.';

COMMENT ON COLUMN public.client_crash_reports.resolved_at IS
  'Set by set_client_crash_report_status for resolved and ignored. Cleared on reopen.';

-- ---------------------------------------------------------------------------
-- Privileges: no direct INSERT/UPDATE/DELETE; no anon table access
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_crash_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_crash_reports FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.client_crash_reports TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: reviewers only (existing is_report_reviewer)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS client_crash_reports_select_reviewers
  ON public.client_crash_reports;
CREATE POLICY client_crash_reports_select_reviewers
  ON public.client_crash_reports
  FOR SELECT
  TO authenticated
  USING (public.is_report_reviewer());

DROP POLICY IF EXISTS client_crash_reports_update_reviewers
  ON public.client_crash_reports;

-- ---------------------------------------------------------------------------
-- Internal sanitizers (no EXECUTE for anon/authenticated)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._client_crash_redact(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO public, pg_temp
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            COALESCE(p_text, ''),
            'Bearer[[:space:]]+[A-Za-z0-9._\-+/=]+',
            '[REDACTED]',
            'gi'
          ),
          'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
          '[REDACTED]',
          'g'
        ),
        '[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}',
        '[REDACTED]',
        'g'
      ),
      'apikey[[:space:]]*[=:][[:space:]]*[^[:space:]&''"]+',
      'apikey=[REDACTED]',
      'gi'
    ),
    'sb-[A-Za-z0-9_-]{8,}',
    '[REDACTED]',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION public._client_crash_normalize(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO public, pg_temp
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(COALESCE(p_text, '')),
            'https?://[^[:space:]]+',
            '<url>',
            'gi'
          ),
          '[?#][^[:space:]]*',
          '',
          'g'
        ),
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
        '<uuid>',
        'g'
      ),
      '[0-9]{6,}',
      '<id>',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public._client_crash_path_only(p_route text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO public, pg_temp
AS $fn$
DECLARE
  v text;
BEGIN
  v := btrim(COALESCE(p_route, ''));
  IF v = '' THEN
    RETURN NULL;
  END IF;

  v := split_part(v, '#', 1);
  v := split_part(v, '?', 1);

  IF v ~* '^https?://' THEN
    v := regexp_replace(v, '^https?://[^/]+', '');
  END IF;

  v := btrim(v);
  IF v = '' THEN
    RETURN NULL;
  END IF;

  RETURN left(v, 300);
END;
$fn$;

CREATE OR REPLACE FUNCTION public._client_crash_top_frame(p_stack text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO public, pg_temp
AS $fn$
DECLARE
  v_line text;
  v_trim text;
BEGIN
  IF p_stack IS NULL OR btrim(p_stack) = '' THEN
    RETURN '';
  END IF;

  FOREACH v_line IN ARRAY string_to_array(p_stack, E'\n')
  LOOP
    v_trim := btrim(v_line);
    CONTINUE WHEN v_trim = '';
    CONTINUE WHEN v_trim ~* '^(error|typeerror|referenceerror|syntaxerror|rangeerror|evalerror|urierror)\b';
    RETURN left(public._client_crash_normalize(v_trim), 240);
  END LOOP;

  RETURN '';
END;
$fn$;

CREATE OR REPLACE FUNCTION public._client_crash_fingerprint(
  p_source text,
  p_error_name text,
  p_message text,
  p_stack text,
  p_page_label text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO public, pg_temp
AS $$
  SELECT encode(
    sha256(
      convert_to(
        COALESCE(p_source, '') || E'\n' ||
        COALESCE(p_error_name, '') || E'\n' ||
        public._client_crash_normalize(COALESCE(p_message, '')) || E'\n' ||
        public._client_crash_top_frame(COALESCE(p_stack, '')) || E'\n' ||
        public._client_crash_normalize(COALESCE(p_page_label, '')),
        'UTF8'
      )
    ),
    'hex'
  );
$$;

REVOKE ALL ON FUNCTION public._client_crash_redact(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_crash_normalize(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_crash_path_only(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_crash_top_frame(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_crash_fingerprint(text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Submit RPC (SECURITY DEFINER — bypasses table RLS for upsert)
-- last_user_id always from auth.uid(); fingerprint is server-owned.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.report_client_crash(
  text, text, text, text, text, text, text, text, text, text, text, text
);

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
  IF v_source NOT IN ('react_boundary', 'window_error', 'unhandled_rejection') THEN
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
  'Insert or bump a crash report. Fingerprint is server-owned SHA-256. last_user_id from auth.uid() only. Callable by anon and authenticated; table is not directly writable.';

-- ---------------------------------------------------------------------------
-- Reviewer status RPC — no client-supplied timestamps or reviewer ids
-- ---------------------------------------------------------------------------
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

  IF NOT public.is_report_reviewer(v_actor) THEN
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
