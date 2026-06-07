-- =============================================================================
-- RLS / grants hardening (versioned from live production SQL Editor changes).
--
-- spatial_ref_sys: PostGIS / supabase_admin-owned catalog. An attempted REVOKE
-- from postgres did not remove supabase_admin grants. Do not enable RLS or
-- revoke it here — leave for special Supabase/PostGIS handling.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Shared post visibility helper (required by posts/activities v2 policies)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_post(p_post_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_viewer_user_id uuid := auth.uid();
  v_viewer_profile_id uuid;
  v_post record;
  v_author_profile record;
  v_viewer_follows_author boolean := false;
  v_author_follows_viewer boolean := false;
begin
  select p.*
  into v_post
  from public.posts p
  where p.id = p_post_id;

  if not found then
    return false;
  end if;

  select pr.*
  into v_author_profile
  from public.profiles pr
  where pr.user_id = v_post.author_id
  limit 1;

  if not found then
    return false;
  end if;

  if v_author_profile.deleted_at is not null then
    return false;
  end if;

  -- Authors can see their own posts, including drafts.
  if v_viewer_user_id is not null and v_post.author_id = v_viewer_user_id then
    return true;
  end if;

  -- Non-authors should not see drafts/unpublished posts.
  if coalesce(v_post.status::text, 'published') <> 'published' then
    return false;
  end if;

  if v_viewer_user_id is not null then
    select pr.id
    into v_viewer_profile_id
    from public.profiles pr
    where pr.user_id = v_viewer_user_id
    limit 1;
  end if;

  -- Block checks only apply when we know the viewer profile.
  if v_viewer_profile_id is not null then
    if public.users_are_blocked_pair(v_viewer_profile_id, v_author_profile.id) then
      return false;
    end if;

    select exists (
      select 1
      from public.follows f
      where f.follower_id = v_viewer_profile_id
        and f.following_id = v_author_profile.id
        and f.status = 'approved'
    )
    into v_viewer_follows_author;

    select exists (
      select 1
      from public.follows f
      where f.follower_id = v_author_profile.id
        and f.following_id = v_viewer_profile_id
        and f.status = 'approved'
    )
    into v_author_follows_viewer;
  end if;

  -- Private authors require approved follower access unless this is the author.
  if coalesce(v_author_profile.is_private, false) = true
     and v_viewer_follows_author = false then
    return false;
  end if;

  -- Public/anonymous/null visibility is visible after profile privacy checks.
  if v_post.visibility is null
     or v_post.visibility::text in ('public', 'anonymous') then
    return true;
  end if;

  -- Followers visibility: viewer follows author.
  if v_post.visibility::text = 'followers' then
    return v_viewer_follows_author;
  end if;

  -- Friends visibility: both users follow each other.
  if v_post.visibility::text = 'friends' then
    return v_viewer_follows_author and v_author_follows_viewer;
  end if;

  return false;
end;
$function$;

REVOKE ALL ON FUNCTION public.can_view_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_post(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- B) Notification function fixes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_actor_id uuid, p_type text, p_entity_type text, p_entity_id uuid, p_additional_data jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  notification_id uuid;
begin
  -- Do not create notifications for missing/deleted auth users.
  if p_user_id is null
     or not exists (
       select 1
       from auth.users u
       where u.id = p_user_id
     ) then
    return null;
  end if;

  -- Don't create notification for self-actions.
  if p_user_id = p_actor_id then
    return null;
  end if;

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    additional_data
  )
  values (
    p_user_id,
    p_actor_id,
    p_type,
    p_entity_type,
    p_entity_id,
    coalesce(p_additional_data, '{}'::jsonb)
  )
  returning id into notification_id;

  return notification_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_post_follower_notifications(p_post_id uuid, p_post_type text, p_author_auth_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_author_profile_id uuid;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.follows') is null
     or to_regclass('public.notifications') is null
     or to_regclass('public.notification_settings') is null then
    return;
  end if;

  if p_post_id is null or p_author_auth_user_id is null then
    return;
  end if;

  if p_post_type is null or p_post_type not in ('hangout', 'experience') then
    return;
  end if;

  select p.id
  into v_author_profile_id
  from public.profiles p
  where p.user_id = p_author_auth_user_id
  limit 1;

  if v_author_profile_id is null then
    return;
  end if;

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    additional_data
  )
  select distinct
    fp.user_id,
    p_author_auth_user_id,
    'post',
    p_post_type,
    p_post_id,
    '{}'::jsonb
  from public.follows f
  inner join public.profiles fp
    on fp.id = f.follower_id
  inner join auth.users recipient_auth
    on recipient_auth.id = fp.user_id
  inner join public.notification_settings ns
    on ns.target_user_id = v_author_profile_id
   and ns.user_id = f.follower_id
   and ns.enabled = true
  where f.following_id = v_author_profile_id
    and coalesce(f.status, 'approved') = 'approved'
    and fp.user_id is not null
    and fp.deleted_at is null
    and fp.user_id is distinct from p_author_auth_user_id
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = fp.user_id
        and n.entity_id = p_post_id
        and n.type = 'post'
        and n.actor_id = p_author_auth_user_id
    );
end;
$function$;

-- ---------------------------------------------------------------------------
-- C) Reference catalog tables — public read-only
-- ---------------------------------------------------------------------------
ALTER TABLE public.interest_tags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.interest_tags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.interest_tags TO anon, authenticated;

DROP POLICY IF EXISTS interest_tags_public_read ON public.interest_tags;
CREATE POLICY interest_tags_public_read ON public.interest_tags
  FOR SELECT TO anon, authenticated
  USING (true);

ALTER TABLE public.referral_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.referral_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.referral_sources TO anon, authenticated;

DROP POLICY IF EXISTS referral_sources_public_read ON public.referral_sources;
CREATE POLICY referral_sources_public_read ON public.referral_sources
  FOR SELECT TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- D) Internal / legacy tables — locked down (RLS on, no client policies)
-- ---------------------------------------------------------------------------
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.games FROM PUBLIC, anon, authenticated;

ALTER TABLE public.cloudinary_activity_images_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cloudinary_activity_images_backup FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- E) post_demo_engagement — scoped SELECT, no client writes
-- ---------------------------------------------------------------------------
ALTER TABLE public.post_demo_engagement ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.post_demo_engagement FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.post_demo_engagement TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.post_demo_engagement FROM anon, authenticated;

DROP POLICY IF EXISTS post_demo_engagement_visible_post_read ON public.post_demo_engagement;
CREATE POLICY post_demo_engagement_visible_post_read ON public.post_demo_engagement
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_demo_engagement.post_id
    )
  );

-- ---------------------------------------------------------------------------
-- F) posts — tightened grants + v2 policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.posts TO authenticated;

DROP POLICY IF EXISTS posts_select_own_v2 ON public.posts;
CREATE POLICY posts_select_own_v2 ON public.posts
  FOR SELECT
  USING (author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS posts_select_visible_v2 ON public.posts;
CREATE POLICY posts_select_visible_v2 ON public.posts
  FOR SELECT
  USING (public.can_view_post(id));

DROP POLICY IF EXISTS posts_insert_own_v2 ON public.posts;
CREATE POLICY posts_insert_own_v2 ON public.posts
  FOR INSERT
  WITH CHECK (author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS posts_update_own_v2 ON public.posts;
CREATE POLICY posts_update_own_v2 ON public.posts
  FOR UPDATE
  USING (author_id = (SELECT auth.uid()))
  WITH CHECK (author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS posts_delete_own_v2 ON public.posts;
CREATE POLICY posts_delete_own_v2 ON public.posts
  FOR DELETE
  USING (author_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- G) activities — tightened grants + v2 policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.activities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.activities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activities TO authenticated;

DROP POLICY IF EXISTS activities_select_via_post_v2 ON public.activities;
CREATE POLICY activities_select_via_post_v2 ON public.activities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = activities.post_id
        AND (
          p.author_id = (SELECT auth.uid())
          OR public.can_view_post(p.id)
        )
    )
  );

DROP POLICY IF EXISTS activities_insert_post_author_v2 ON public.activities;
CREATE POLICY activities_insert_post_author_v2 ON public.activities
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_id
        AND p.author_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS activities_update_post_author_v2 ON public.activities;
CREATE POLICY activities_update_post_author_v2 ON public.activities
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_id
        AND p.author_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_id
        AND p.author_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS activities_delete_post_author_v2 ON public.activities;
CREATE POLICY activities_delete_post_author_v2 ON public.activities
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_id
        AND p.author_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- H) Drop legacy / broad / duplicate policies (after v2 policies exist)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS posts_read_all ON public.posts;
DROP POLICY IF EXISTS posts_select_own_or_public ON public.posts;
DROP POLICY IF EXISTS p_posts_public_read ON public.posts;
DROP POLICY IF EXISTS p_posts_followers_read ON public.posts;
DROP POLICY IF EXISTS p_posts_friends_read ON public.posts;
DROP POLICY IF EXISTS p_posts_author_all ON public.posts;
DROP POLICY IF EXISTS posts_insert_own ON public.posts;
DROP POLICY IF EXISTS posts_insert_owner ON public.posts;
DROP POLICY IF EXISTS posts_update_own ON public.posts;
DROP POLICY IF EXISTS posts_update_owner ON public.posts;
DROP POLICY IF EXISTS posts_delete_own ON public.posts;
DROP POLICY IF EXISTS posts_delete_owner ON public.posts;

DROP POLICY IF EXISTS activities_read_all ON public.activities;
DROP POLICY IF EXISTS activities_select_by_owner_or_public ON public.activities;
DROP POLICY IF EXISTS activities_select_public ON public.activities;
DROP POLICY IF EXISTS activities_write_owner ON public.activities;
DROP POLICY IF EXISTS activities_insert_by_owner ON public.activities;
DROP POLICY IF EXISTS activities_update_by_owner ON public.activities;
DROP POLICY IF EXISTS activities_delete_by_owner ON public.activities;
