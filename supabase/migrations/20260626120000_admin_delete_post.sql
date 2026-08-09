-- Admin delete any post (report reviewers only).
-- Matches production: admin_delete_post RPC; audit uses target_post_id (no FK to posts).

CREATE OR REPLACE FUNCTION public.admin_delete_post(p_post_id uuid)
RETURNS TABLE (
  post_id uuid,
  author_id uuid,
  deleted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_author_id uuid;
  v_type text;
  v_status text;
  v_caption_preview text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_report_reviewer(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing post id';
  END IF;

  SELECT
    p.author_id,
    p.type::text,
    p.status::text,
    left(coalesce(p.caption, ''), 200)
  INTO v_author_id, v_type, v_status, v_caption_preview
  FROM public.posts p
  WHERE p.id = p_post_id
  FOR UPDATE;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  INSERT INTO public.admin_post_action_audit (
    action,
    target_post_id,
    actor_user_id,
    old_author_id,
    metadata
  ) VALUES (
    'delete_post',
    p_post_id,
    v_actor,
    v_author_id,
    jsonb_build_object(
      'type', v_type,
      'status', v_status,
      'caption_preview', v_caption_preview
    )
  );

  DELETE FROM public.posts WHERE id = p_post_id;

  post_id := p_post_id;
  author_id := v_author_id;
  deleted := true;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_post(uuid) TO authenticated;
