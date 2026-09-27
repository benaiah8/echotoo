-- LOCAL ONLY — do not apply to production until explicitly approved.
-- Read supabase/MIGRATION_STATUS.md before any production apply.
-- DO NOT run `supabase db push` while migration history remains unaudited.
--
-- Company Announcements: admin/company messages to users (not Activity, Invites,
-- Messages, or invite thread_kind = 'announcement').
--
-- Reuses public.is_report_reviewer() / report_reviewers for admin writes.
-- Runtime read + mark-seen via SECURITY DEFINER RPCs (bounded).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  starts_at timestamptz NULL,
  expires_at timestamptz NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_announcements_title_nonempty_check
    CHECK (length(btrim(title)) > 0),
  CONSTRAINT company_announcements_message_nonempty_check
    CHECK (length(btrim(message)) > 0),
  CONSTRAINT company_announcements_window_check
    CHECK (
      starts_at IS NULL
      OR expires_at IS NULL
      OR starts_at < expires_at
    )
);

CREATE INDEX IF NOT EXISTS company_announcements_active_created_idx
  ON public.company_announcements (is_active, created_at DESC);

COMMENT ON TABLE public.company_announcements IS
  'Company/admin in-app announcements (ECHOTOO). Separate from notifications, Invites thread_kind=announcement, and admin_campaign push.';

CREATE TABLE IF NOT EXISTS public.company_announcement_reads (
  announcement_id uuid NOT NULL
    REFERENCES public.company_announcements (id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);

CREATE INDEX IF NOT EXISTS company_announcement_reads_announcement_idx
  ON public.company_announcement_reads (announcement_id);

COMMENT ON TABLE public.company_announcement_reads IS
  'Per-user seen state for company_announcements. One row per (user, announcement).';

-- updated_at — shared trigger helper
DROP TRIGGER IF EXISTS company_announcements_set_updated_at
  ON public.company_announcements;
CREATE TRIGGER company_announcements_set_updated_at
  BEFORE UPDATE ON public.company_announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_announcement_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.company_announcements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.company_announcement_reads FROM PUBLIC, anon, authenticated;

-- Reviewers manage announcements via table CRUD (RLS-gated).
GRANT SELECT, INSERT, UPDATE ON TABLE public.company_announcements TO authenticated;

-- Reads: no direct client table access; mark/list via RPCs only.
-- (Reviewers do not need SELECT on reads for MVP admin UI.)

DROP POLICY IF EXISTS company_announcements_select_reviewers
  ON public.company_announcements;
CREATE POLICY company_announcements_select_reviewers
  ON public.company_announcements
  FOR SELECT
  TO authenticated
  USING (public.is_report_reviewer());

DROP POLICY IF EXISTS company_announcements_insert_reviewers
  ON public.company_announcements;
CREATE POLICY company_announcements_insert_reviewers
  ON public.company_announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_report_reviewer());

DROP POLICY IF EXISTS company_announcements_update_reviewers
  ON public.company_announcements;
CREATE POLICY company_announcements_update_reviewers
  ON public.company_announcements
  FOR UPDATE
  TO authenticated
  USING (public.is_report_reviewer())
  WITH CHECK (public.is_report_reviewer());

-- ---------------------------------------------------------------------------
-- Runtime: active announcements + seen flag for auth.uid()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_company_announcements_runtime()
RETURNS TABLE (
  id uuid,
  title text,
  message text,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  is_seen boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.message,
    a.starts_at,
    a.expires_at,
    a.created_at,
    EXISTS (
      SELECT 1
      FROM public.company_announcement_reads r
      WHERE r.announcement_id = a.id
        AND r.user_id = v_uid
    ) AS is_seen
  FROM public.company_announcements a
  WHERE a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.expires_at IS NULL OR a.expires_at > now())
  ORDER BY a.created_at DESC
  LIMIT 5;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_announcements_runtime() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_announcements_runtime() TO authenticated;

COMMENT ON FUNCTION public.get_company_announcements_runtime() IS
  'Bounded active company announcements for the current user, with per-user is_seen.';

-- ---------------------------------------------------------------------------
-- Mark seen (batched, idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_company_announcements_seen(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;

  -- Cap batch size to match runtime limit.
  INSERT INTO public.company_announcement_reads (announcement_id, user_id, seen_at)
  SELECT DISTINCT x.id, v_uid, now()
  FROM unnest(p_ids[1:5]) AS x(id)
  INNER JOIN public.company_announcements a ON a.id = x.id
  ON CONFLICT (user_id, announcement_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_company_announcements_seen(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_company_announcements_seen(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.mark_company_announcements_seen(uuid[]) IS
  'Idempotent batch mark-seen for company_announcements (auth.uid() only).';
