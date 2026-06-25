-- Admin post ownership transfer (report reviewers only).
-- Matches production: audit table + admin_transfer_post_ownership RPC.

-- ---------------------------------------------------------------------------
-- Reviewer helper (used by audit RLS + RPC authorization)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_report_reviewer(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.report_reviewers rr
    WHERE rr.user_id = COALESCE(p_user_id, auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_report_reviewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_report_reviewer(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Audit log (reviewers can SELECT only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_post_action_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  old_author_id uuid,
  new_author_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_post_action_audit_post_id_idx
  ON public.admin_post_action_audit (post_id);

CREATE INDEX IF NOT EXISTS admin_post_action_audit_created_at_idx
  ON public.admin_post_action_audit (created_at DESC);

ALTER TABLE public.admin_post_action_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_post_action_audit_select_reviewers ON public.admin_post_action_audit;
CREATE POLICY admin_post_action_audit_select_reviewers ON public.admin_post_action_audit
  FOR SELECT TO authenticated
  USING (public.is_report_reviewer());

REVOKE ALL ON TABLE public.admin_post_action_audit FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.admin_post_action_audit TO authenticated;

-- ---------------------------------------------------------------------------
-- Transfer ownership RPC (SECURITY DEFINER — bypasses posts RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_transfer_post_ownership(
  p_post_id uuid,
  p_new_author_user_id uuid
)
RETURNS TABLE (
  post_id uuid,
  old_author_id uuid,
  new_author_id uuid,
  did_change boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_old uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_report_reviewer(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_post_id IS NULL OR p_new_author_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing post or new author';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = p_new_author_user_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT p.author_id INTO v_old
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_old = p_new_author_user_id THEN
    post_id := p_post_id;
    old_author_id := v_old;
    new_author_id := p_new_author_user_id;
    did_change := false;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.posts
  SET author_id = p_new_author_user_id,
      updated_at = now()
  WHERE id = p_post_id;

  INSERT INTO public.admin_post_action_audit (
    action,
    post_id,
    actor_user_id,
    old_author_id,
    new_author_id
  ) VALUES (
    'transfer_ownership',
    p_post_id,
    v_actor,
    v_old,
    p_new_author_user_id
  );

  post_id := p_post_id;
  old_author_id := v_old;
  new_author_id := p_new_author_user_id;
  did_change := true;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_transfer_post_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_post_ownership(uuid, uuid) TO authenticated;
