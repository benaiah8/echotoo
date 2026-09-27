-- Gate activity images and RSVP lists on can_view_post.
-- SECURITY DEFINER helpers bypass RLS; non-viewers must not retrieve related data by UUID.

CREATE OR REPLACE FUNCTION public.get_activities_for_posts_sanitized(p_post_ids uuid[])
 RETURNS TABLE(post_id uuid, order_idx integer, images text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    a.post_id,
    a.order_idx,
    public.strip_data_images(a.images) as images
  from public.activities a
  where a.post_id = any(p_post_ids)
    and public.can_view_post(a.post_id)
  order by a.post_id, a.order_idx asc nulls last;
$function$;

CREATE OR REPLACE FUNCTION public.get_rsvp_list_with_profiles(p_post_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result JSONB;
  v_users JSONB;
  v_current_user_status TEXT;
BEGIN
  -- p_viewer_user_id is retained for call-site compatibility; identity uses auth.uid().
  IF p_post_id IS NULL OR NOT public.can_view_post(p_post_id) THEN
    RETURN jsonb_build_object(
      'users', '[]'::jsonb,
      'currentUserStatus', NULL
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'status', r.status,
        'created_at', r.created_at
      ) ORDER BY r.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_users
  FROM rsvp_responses r
  INNER JOIN profiles p ON p.user_id = r.user_id AND p.deleted_at IS NULL
  WHERE r.post_id = p_post_id;

  IF auth.uid() IS NOT NULL THEN
    SELECT r.status
    INTO v_current_user_status
    FROM rsvp_responses r
    WHERE r.post_id = p_post_id
      AND r.user_id = auth.uid()
    LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    'users', COALESCE(v_users, '[]'::jsonb),
    'currentUserStatus', v_current_user_status
  );

  RETURN v_result;
END;
$function$;
