-- =============================================================================
-- Security / Performance Advisor cleanup (versioned from live production changes).
--
-- Records manual production SQL Editor changes already applied live.
-- Do NOT re-apply to production — this file is for version control only.
--
-- Intentionally excluded (PostGIS / Supabase-managed; separate handling required):
--   - public.spatial_ref_sys (RLS, grants)
--   - postgis / pg_trgm extension moves
--   - PostGIS extension functions (st_*, geometry_*, geography_*, etc.)
--   - geography_columns, geometry_columns catalog tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) App table grants cleanup
--    Revoke TRUNCATE, REFERENCES, TRIGGER from anon/authenticated.
--    Revoke INSERT, UPDATE, DELETE from anon.
--    Excludes PostGIS catalog tables and supabase_admin-owned objects.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns')
      AND pg_get_userbyid(c.relowner) <> 'supabase_admin'
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated',
      r.tablename
    );
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon',
      r.tablename
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) RLS policy auth.uid() initplan optimization
--    Replace bare auth.uid() with (SELECT auth.uid()) — logic unchanged.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their own notification settings" ON public.notification_settings;
CREATE POLICY "Users can manage their own notification settings" ON public.notification_settings
  FOR ALL
  USING ((user_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))))
;

DROP POLICY IF EXISTS "Users can view their own notification settings" ON public.notification_settings;
CREATE POLICY "Users can view their own notification settings" ON public.notification_settings
  FOR SELECT
  USING ((user_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))))
;

DROP POLICY IF EXISTS "Allow authenticated users to delete notifications" ON public.notifications;
CREATE POLICY "Allow authenticated users to delete notifications" ON public.notifications
  FOR DELETE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "Allow authenticated users to insert notifications" ON public.notifications;
CREATE POLICY "Allow authenticated users to insert notifications" ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "Allow authenticated users to update notifications" ON public.notifications;
CREATE POLICY "Allow authenticated users to update notifications" ON public.notifications
  FOR UPDATE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE
  USING ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "post_ratings_delete_own" ON public.post_ratings;
CREATE POLICY "post_ratings_delete_own" ON public.post_ratings
  FOR DELETE
  USING ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "post_ratings_insert_own" ON public.post_ratings;
CREATE POLICY "post_ratings_insert_own" ON public.post_ratings
  FOR INSERT
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "post_ratings_update_own" ON public.post_ratings;
CREATE POLICY "post_ratings_update_own" ON public.post_ratings
  FOR UPDATE
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "Users can share posts" ON public.post_shares;
CREATE POLICY "Users can share posts" ON public.post_shares
  FOR INSERT
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "Simple RSVP delete policy" ON public.rsvp_responses;
CREATE POLICY "Simple RSVP delete policy" ON public.rsvp_responses
  FOR DELETE
  USING ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "Simple RSVP insert policy" ON public.rsvp_responses;
CREATE POLICY "Simple RSVP insert policy" ON public.rsvp_responses
  FOR INSERT
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "Simple RSVP update policy" ON public.rsvp_responses;
CREATE POLICY "Simple RSVP update policy" ON public.rsvp_responses
  FOR UPDATE
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "Account owners can update follow status" ON public.follows;
CREATE POLICY "Account owners can update follow status" ON public.follows
  FOR UPDATE
  TO authenticated
  USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (following_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (following_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) AND (status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text]))))
;

DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
CREATE POLICY "Users can follow others" ON public.follows
  FOR INSERT
  WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (follower_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) AND (following_id <> follower_id)))
;

DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;
CREATE POLICY "Users can unfollow" ON public.follows
  FOR DELETE
  USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (follower_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = ( SELECT auth.uid() AS uid))))))
;

DROP POLICY IF EXISTS "Users can view their followers" ON public.follows;
CREATE POLICY "Users can view their followers" ON public.follows
  FOR SELECT
  USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (following_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = ( SELECT auth.uid() AS uid))))))
;

DROP POLICY IF EXISTS "Users can view their following" ON public.follows;
CREATE POLICY "Users can view their following" ON public.follows
  FOR SELECT
  USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (follower_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = ( SELECT auth.uid() AS uid))))))
;

DROP POLICY IF EXISTS "follows_delete_self" ON public.follows;
CREATE POLICY "follows_delete_self" ON public.follows
  FOR DELETE
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.id = follows.follower_id)))))
;

DROP POLICY IF EXISTS "follows_insert_self" ON public.follows;
CREATE POLICY "follows_insert_self" ON public.follows
  FOR INSERT
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.id = follows.follower_id)))))
;

DROP POLICY IF EXISTS "p_follows_rw" ON public.follows;
CREATE POLICY "p_follows_rw" ON public.follows
  FOR ALL
  USING ((( SELECT auth.uid() AS uid) = follower_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = follower_id))
;

DROP POLICY IF EXISTS "locations_read_owner" ON public.locations;
CREATE POLICY "locations_read_owner" ON public.locations
  FOR SELECT
  USING ((owner_user_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "locations_write_owner" ON public.locations;
CREATE POLICY "locations_write_owner" ON public.locations
  FOR ALL
  USING ((owner_user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((owner_user_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "p_profiles_update_self" ON public.profiles;
CREATE POLICY "p_profiles_update_self" ON public.profiles
  FOR UPDATE
  USING ((( SELECT auth.uid() AS uid) = id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = id))
;

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE
  USING ((user_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "report_reviewers_select_self" ON public.report_reviewers;
CREATE POLICY "report_reviewers_select_self" ON public.report_reviewers
  FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "reports_select_reviewers" ON public.reports;
CREATE POLICY "reports_select_reviewers" ON public.reports
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM report_reviewers rr
  WHERE (rr.user_id = ( SELECT auth.uid() AS uid)))))
;

DROP POLICY IF EXISTS "reports_update_reviewers" ON public.reports;
CREATE POLICY "reports_update_reviewers" ON public.reports
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM report_reviewers rr
  WHERE (rr.user_id = ( SELECT auth.uid() AS uid)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM report_reviewers rr
  WHERE (rr.user_id = ( SELECT auth.uid() AS uid)))))
;

DROP POLICY IF EXISTS "invite_interests_select_participants" ON public.invite_interests;
CREATE POLICY "invite_interests_select_participants" ON public.invite_interests
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM invite_threads t
  WHERE ((t.id = invite_interests.thread_id) AND ((t.inviter_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM invites i
          WHERE ((i.thread_id = t.id) AND (i.invitee_id = ( SELECT auth.uid() AS uid)))))))))
;

DROP POLICY IF EXISTS "invite_message_reactions_select_participants" ON public.invite_message_reactions;
CREATE POLICY "invite_message_reactions_select_participants" ON public.invite_message_reactions
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (invite_thread_messages m
     JOIN invite_threads t ON ((t.id = m.thread_id)))
  WHERE ((m.id = invite_message_reactions.message_id) AND ((t.inviter_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM invites i
          WHERE ((i.thread_id = t.id) AND (i.invitee_id = ( SELECT auth.uid() AS uid)))))))))
;

DROP POLICY IF EXISTS "invite_thread_messages_select_participants" ON public.invite_thread_messages;
CREATE POLICY "invite_thread_messages_select_participants" ON public.invite_thread_messages
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM invite_threads t
  WHERE ((t.id = invite_thread_messages.thread_id) AND ((t.inviter_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM invites i
          WHERE ((i.thread_id = t.id) AND (i.invitee_id = ( SELECT auth.uid() AS uid)))))))))
;

DROP POLICY IF EXISTS "invite_threads_select_invitee" ON public.invite_threads;
CREATE POLICY "invite_threads_select_invitee" ON public.invite_threads
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM invites i
  WHERE ((i.thread_id = invite_threads.id) AND (i.invitee_id = ( SELECT auth.uid() AS uid))))))
;

DROP POLICY IF EXISTS "invite_threads_select_inviter" ON public.invite_threads;
CREATE POLICY "invite_threads_select_inviter" ON public.invite_threads
  FOR SELECT
  TO authenticated
  USING ((inviter_user_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "Invitee can view and update their own invites" ON public.invites;
CREATE POLICY "Invitee can view and update their own invites" ON public.invites
  FOR ALL
  USING ((( SELECT auth.uid() AS uid) = invitee_id))
;

DROP POLICY IF EXISTS "Invitees can update invite status" ON public.invites;
CREATE POLICY "Invitees can update invite status" ON public.invites
  FOR UPDATE
  TO authenticated
  USING ((invitee_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK (((invitee_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['accepted'::text, 'declined'::text]))))
;

DROP POLICY IF EXISTS "Inviter can delete invites they sent" ON public.invites;
CREATE POLICY "Inviter can delete invites they sent" ON public.invites
  FOR DELETE
  USING ((( SELECT auth.uid() AS uid) = inviter_id))
;

DROP POLICY IF EXISTS "Inviter can view invites they sent" ON public.invites;
CREATE POLICY "Inviter can view invites they sent" ON public.invites
  FOR SELECT
  USING ((( SELECT auth.uid() AS uid) = inviter_id))
;

DROP POLICY IF EXISTS "Inviters can create invites" ON public.invites;
CREATE POLICY "Inviters can create invites" ON public.invites
  FOR INSERT
  WITH CHECK ((( SELECT auth.uid() AS uid) = inviter_id))
;

DROP POLICY IF EXISTS "Inviters can delete their invites" ON public.invites;
CREATE POLICY "Inviters can delete their invites" ON public.invites
  FOR DELETE
  TO authenticated
  USING ((inviter_id = ( SELECT auth.uid() AS uid)))
;

DROP POLICY IF EXISTS "Users can view their own invites" ON public.invites;
CREATE POLICY "Users can view their own invites" ON public.invites
  FOR SELECT
  TO authenticated
  USING (((inviter_id = ( SELECT auth.uid() AS uid)) OR (invitee_id = ( SELECT auth.uid() AS uid))))
;

DROP POLICY IF EXISTS "p_likes_rw" ON public.likes;
CREATE POLICY "p_likes_rw" ON public.likes
  FOR ALL
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "p_reposts_rw" ON public.reposts;
CREATE POLICY "p_reposts_rw" ON public.reposts
  FOR ALL
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "p_rsvps_rw" ON public.rsvps;
CREATE POLICY "p_rsvps_rw" ON public.rsvps
  FOR ALL
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "p_saves_rw" ON public.saves;
CREATE POLICY "p_saves_rw" ON public.saves
  FOR ALL
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "Users can delete their own user_activities" ON public.user_activities;
CREATE POLICY "Users can delete their own user_activities" ON public.user_activities
  FOR DELETE
  USING ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "Users can insert their own user_activities" ON public.user_activities;
CREATE POLICY "Users can insert their own user_activities" ON public.user_activities
  FOR INSERT
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "Users can update their own user_activities" ON public.user_activities;
CREATE POLICY "Users can update their own user_activities" ON public.user_activities
  FOR UPDATE
  USING ((( SELECT auth.uid() AS uid) = user_id))
;

DROP POLICY IF EXISTS "Users can view their own user_activities" ON public.user_activities;
CREATE POLICY "Users can view their own user_activities" ON public.user_activities
  FOR SELECT
  USING ((( SELECT auth.uid() AS uid) = user_id))
;
-- ---------------------------------------------------------------------------
-- 3) Duplicate index cleanup (idempotent — already dropped live)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.follows_unique_pair;
DROP INDEX IF EXISTS public.uniq_follows_pair;
DROP INDEX IF EXISTS public.idx_follows_following;
DROP INDEX IF EXISTS public.idx_posts_created;

-- ---------------------------------------------------------------------------
-- 4) Function search_path fixes (SET search_path = public, pg_temp)
--    App-owned functions only. PostGIS extension functions excluded.
--    Earlier batch (RPC/triggers/updated_at) + strip_data_images helper.
--    Later-batch SECURITY DEFINER helpers (can_view_post, create_notification,
--    invite/report RPCs, etc.) remain at search_path=public in live production
--    and are versioned in 20260530150000_rls_security_hardening.sql where applicable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activities_autonumber_order_idx()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if NEW.order_idx is null then
    select coalesce(max(a.order_idx) + 1, 1)
      into NEW.order_idx
      from public.activities a
     where a.post_id = NEW.post_id;
  end if;
  return NEW;
end;
$function$


CREATE OR REPLACE FUNCTION public.assign_user_number()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    next_number INTEGER;
BEGIN
    -- Get the next user number by finding the highest existing number + 1
    SELECT COALESCE(MAX(user_number), 0) + 1 INTO next_number
    FROM profiles
    WHERE user_number IS NOT NULL;
    
    RETURN next_number;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_invite_status_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Only create notification if status changed to accepted or declined
    IF OLD.status != NEW.status AND NEW.status IN ('accepted', 'declined') THEN
        -- Create notification for the inviter about the status change
        INSERT INTO notifications (
            user_id,
            actor_id,
            type,
            entity_type,
            entity_id,
            additional_data,
            is_read,
            created_at
        ) VALUES (
            NEW.inviter_id,  -- The person who sent the invite
            NEW.invitee_id,  -- The person who responded
            'rsvp',  -- Use rsvp type for accepted/declined responses
            'post',
            NEW.post_id,
            jsonb_build_object(
                'post_id', NEW.post_id,
                'invite_id', NEW.id,
                'status', NEW.status,
                'post_type', (
                    SELECT type FROM posts WHERE id = NEW.post_id
                ),
                'post_caption', (
                    SELECT caption FROM posts WHERE id = NEW.post_id
                )
            ),
            false,
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$function$


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
  order by a.post_id, a.order_idx asc nulls last;
$function$


CREATE OR REPLACE FUNCTION public.get_feed_with_related_data(p_type post_type DEFAULT NULL::post_type, p_tags text[] DEFAULT NULL::text[], p_search text DEFAULT NULL::text, p_limit integer DEFAULT 12, p_offset integer DEFAULT 0, p_viewer_user_id uuid DEFAULT NULL::uuid, p_occurs_on date DEFAULT NULL::date, p_occurs_tz text DEFAULT NULL::text, p_friends_only boolean DEFAULT false, p_occurs_from date DEFAULT NULL::date, p_occurs_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
  v_posts JSONB;
  v_true_total INTEGER;
BEGIN
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  WITH
  eligible_base AS (
    SELECT DISTINCT p.id, p.created_at
    FROM posts p
    INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
    LEFT JOIN follows mutual_follow ON
      mutual_follow.follower_id = v_viewer_profile_id
      AND mutual_follow.following_id = author_profile.id
    LEFT JOIN follows reverse_follow ON
      reverse_follow.follower_id = author_profile.id
      AND reverse_follow.following_id = v_viewer_profile_id
    WHERE
      (p_type IS NULL OR p.type = p_type)
      AND (p_tags IS NULL OR (p.tags IS NOT NULL AND p.tags && p_tags))
      AND (
        p_search IS NULL
        OR EXISTS (
          SELECT 1
          FROM regexp_split_to_table(btrim(p_search), '[[:space:]]+') AS qsplit(raw_tok)
          CROSS JOIN LATERAL (
            SELECT NULLIF(regexp_replace(lower(btrim(qsplit.raw_tok)), '^#+', ''), '') AS nq
          ) n
          WHERE n.nq IS NOT NULL
          AND (
            p.caption ILIKE '%' || n.nq || '%'
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) AS tag_arr(t)
              WHERE NULLIF(regexp_replace(lower(btrim(tag_arr.t)), '^#+', ''), '') IS NOT NULL
              AND regexp_replace(lower(btrim(tag_arr.t)), '^#+', '') ILIKE '%' || n.nq || '%'
            )
          )
        )
      )
      AND (
        author_profile.is_private = false
        OR v_viewer_profile_id = author_profile.id
        OR (author_profile.is_private = true AND mutual_follow.status = 'approved')
      )
      AND (
        p.visibility IS NULL
        OR p.visibility = 'public'
        OR p.visibility = 'anonymous'
        OR v_viewer_profile_id = author_profile.id
        OR (p.visibility = 'friends' AND mutual_follow.status = 'approved' AND reverse_follow.status = 'approved')
      )
      AND (
        p.type != 'hangout'
        OR (
          p.type = 'hangout'
          AND (
            COALESCE(p.is_recurring, false) = true
            OR COALESCE(jsonb_array_length(p.selected_dates), 0) = 0
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
              WHERE (elem::timestamptz) >= now()
            )
          )
        )
      )
      AND (
        p_viewer_user_id IS NULL
        OR NOT public.users_are_blocked_pair(p_viewer_user_id, p.author_id)
      )
      -- Optional friends-only filter: mutual approved follow in both directions (excludes self posts).
      AND (
        NOT COALESCE(p_friends_only, false)
        OR (
          mutual_follow.status = 'approved'
          AND reverse_follow.status = 'approved'
        )
      )
      -- Optional viewer-local occurrence filter (three modes; all skipped when inactive):
      -- 1) No filter — neither range nor single-day params fully set.
      -- 2) Range mode (week filters) — p_occurs_from + p_occurs_to + p_occurs_tz all set.
      --    Experiences qualify only via selected_dates in range (A).
      --    Recurring hangouts may qualify via any weekday in range (B).
      -- 3) Single-day mode (Today/Tomorrow spotlight) — p_occurs_on + p_occurs_tz when range inactive.
      AND (
        (
          (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
          AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
        )
        OR (
          p_occurs_from IS NOT NULL
          AND p_occurs_to IS NOT NULL
          AND p_occurs_tz IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS sched
              WHERE NULLIF(trim(sched), '') IS NOT NULL
                AND (((trim(sched))::timestamptz AT TIME ZONE p_occurs_tz)::date
                     BETWEEN p_occurs_from AND p_occurs_to)
            )
            OR (
              p.type = 'hangout'
              AND COALESCE(p.is_recurring, false) = true
              AND EXISTS (
                SELECT 1
                FROM generate_series(
                  p_occurs_from::timestamp,
                  p_occurs_to::timestamp,
                  interval '1 day'
                ) AS gs(d)
                CROSS JOIN unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
                WHERE trim(rec.code) = CASE EXTRACT(ISODOW FROM gs.d::date)::int
                  WHEN 1 THEN 'MO'
                  WHEN 2 THEN 'TU'
                  WHEN 3 THEN 'WE'
                  WHEN 4 THEN 'TH'
                  WHEN 5 THEN 'FR'
                  WHEN 6 THEN 'SA'
                  WHEN 7 THEN 'SU'
                END
              )
            )
          )
        )
        OR (
          (p_occurs_from IS NULL OR p_occurs_to IS NULL)
          AND p_occurs_on IS NOT NULL
          AND p_occurs_tz IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS sched
              WHERE NULLIF(trim(sched), '') IS NOT NULL
                AND (((trim(sched))::timestamptz AT TIME ZONE p_occurs_tz)::date = p_occurs_on)
            )
            OR (
              p.type = 'hangout'
              AND COALESCE(p.is_recurring, false) = true
              AND EXISTS (
                SELECT 1
                FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
                WHERE trim(rec.code) = CASE EXTRACT(ISODOW FROM p_occurs_on)::int
                  WHEN 1 THEN 'MO'
                  WHEN 2 THEN 'TU'
                  WHEN 3 THEN 'WE'
                  WHEN 4 THEN 'TH'
                  WHEN 5 THEN 'FR'
                  WHEN 6 THEN 'SA'
                  WHEN 7 THEN 'SU'
                END
              )
            )
          )
        )
      )
  ),
  true_total_cte AS (
    SELECT COUNT(*)::INTEGER AS cnt FROM eligible_base
  ),
  page_ids AS (
    SELECT id FROM eligible_base
    ORDER BY created_at DESC, id DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  filtered_posts AS (
    SELECT
      p.id,
      p.type,
      p.caption,
      p.is_anonymous,
      p.anonymous_name,
      p.anonymous_avatar,
      p.created_at,
      p.selected_dates,
      p.tags,
      p.author_id,
      jsonb_build_object(
        'id', author_profile.id,
        'username', author_profile.username,
        'display_name', author_profile.display_name,
        'avatar_url', author_profile.avatar_url
      ) AS author,
      CASE
        WHEN v_viewer_profile_id IS NULL THEN 'none'
        WHEN v_viewer_profile_id = author_profile.id THEN 'self'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
             AND reverse_follow.follower_id IS NOT NULL AND reverse_follow.status = 'approved'
        THEN 'friends'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
        THEN 'following'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'pending'
        THEN 'pending'
        ELSE 'none'
      END AS follow_status,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_like.post_id IS NOT NULL THEN true ELSE false END AS is_liked,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_save.post_id IS NOT NULL THEN true ELSE false END AS is_saved,
      COALESCE(p.like_count, 0) AS like_count,
      COALESCE(p.save_count, 0) AS save_count,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(p.like_count, 0) + COALESCE(demo.demo_like_count, 0)
        ELSE COALESCE(p.like_count, 0)
      END AS effective_like_count,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(p.save_count, 0) + COALESCE(demo.demo_save_count, 0)
        ELSE COALESCE(p.save_count, 0)
      END AS effective_save_count,
      COALESCE(p.comment_count, 0) AS comment_count,
      (SELECT COUNT(*)::int FROM activities a WHERE a.post_id = p.id) AS activity_count,
      EXISTS(
        SELECT 1 FROM activities a
        WHERE a.post_id = p.id AND a.images IS NOT NULL AND array_length(a.images, 1) > 0
      ) AS has_images,
      (
        SELECT (a.images)[1]::text
        FROM activities a
        WHERE a.post_id = p.id AND a.images IS NOT NULL AND array_length(a.images, 1) > 0
        ORDER BY a.order_idx ASC NULLS LAST
        LIMIT 1
      ) AS first_image_url,
      (
        SELECT COALESCE(SUM(array_length(a.images, 1)), 0)::int
        FROM activities a
        WHERE a.post_id = p.id
      ) AS image_count,
      CASE
        WHEN p.type = 'hangout' THEN
          jsonb_build_object(
            'currentUserStatus', COALESCE(user_rsvp.status, NULL),
            'going_count', COALESCE(rsvp_going_cnt.cnt, 0)
          )
        ELSE NULL
      END AS rsvp_data,
      p.rsvp_capacity AS rsvp_capacity,
      p.rating_enabled,
      p.rating_average,
      p.rating_count,
      CASE
        WHEN p.type = 'experience' THEN
          CASE
            WHEN (COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)) = 0 THEN 0
            ELSE ROUND(
              (
                (COALESCE(demo.demo_rating_average, 0)::numeric * COALESCE(demo.demo_rating_count, 0)::numeric) +
                (COALESCE(p.rating_average, 0)::numeric * COALESCE(p.rating_count, 0)::numeric)
              ) / NULLIF((COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0))::numeric, 0),
              2
            )
          END
        ELSE COALESCE(p.rating_average, 0)
      END AS effective_rating_average,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)
        ELSE COALESCE(p.rating_count, 0)
      END AS effective_rating_count,
      (
        SELECT pr.stars
        FROM post_ratings pr
        WHERE pr.post_id = p.id
          AND pr.user_id = p_viewer_user_id
        LIMIT 1
      ) AS viewer_rating,
      p.is_recurring AS is_recurring,
      p.recurrence_days AS recurrence_days
    FROM page_ids
    INNER JOIN posts p ON p.id = page_ids.id
    INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
    LEFT JOIN follows mutual_follow ON
      mutual_follow.follower_id = v_viewer_profile_id
      AND mutual_follow.following_id = author_profile.id
    LEFT JOIN follows reverse_follow ON
      reverse_follow.follower_id = author_profile.id
      AND reverse_follow.following_id = v_viewer_profile_id
    LEFT JOIN post_likes user_like ON
      user_like.post_id = p.id AND user_like.user_id = p_viewer_user_id
    LEFT JOIN saved_posts user_save ON
      user_save.post_id = p.id AND user_save.user_id = p_viewer_user_id
    LEFT JOIN public.post_demo_engagement demo ON
      demo.post_id = p.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt
      FROM rsvp_responses r
      WHERE r.post_id = p.id AND r.status = 'going'
    ) rsvp_going_cnt ON true
    LEFT JOIN rsvp_responses user_rsvp ON
      user_rsvp.post_id = p.id AND user_rsvp.user_id = p_viewer_user_id
    ORDER BY p.created_at DESC, p.id DESC
  )
  SELECT
    (SELECT cnt FROM true_total_cte),
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', fp.id,
        'caption', fp.caption,
        'author', fp.author,
        'created_at', fp.created_at,
        'type', fp.type,
        'tags', fp.tags,
        'is_liked', fp.is_liked,
        'is_saved', fp.is_saved,
        'like_count', fp.like_count,
        'save_count', fp.save_count,
        'effective_like_count', fp.effective_like_count,
        'effective_save_count', fp.effective_save_count,
        'comment_count', fp.comment_count,
        'follow_status', fp.follow_status,
        'activity_count', fp.activity_count,
        'first_image_url', fp.first_image_url,
        'has_images', fp.has_images,
        'image_count', fp.image_count,
        'is_anonymous', fp.is_anonymous,
        'anonymous_name', fp.anonymous_name,
        'anonymous_avatar', fp.anonymous_avatar,
        'selected_dates', fp.selected_dates,
        'author_id', fp.author_id,
        'rsvp_data', fp.rsvp_data,
        'rsvp_capacity', fp.rsvp_capacity,
        'rating_enabled', fp.rating_enabled,
        'rating_average', fp.rating_average,
        'rating_count', fp.rating_count,
        'effective_rating_average', fp.effective_rating_average,
        'effective_rating_count', fp.effective_rating_count,
        'viewer_rating', fp.viewer_rating,
        'is_recurring', fp.is_recurring,
        'recurrence_days', fp.recurrence_days
      ) ORDER BY fp.created_at DESC
    ) FROM filtered_posts fp)
  INTO v_true_total, v_posts
  FROM true_total_cte
  LIMIT 1;

  v_result := jsonb_build_object(
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'count', COALESCE(v_true_total, 0)
  );

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_follow_list_with_profiles(p_profile_id uuid, p_mode text, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
  v_users JSONB;
BEGIN
  -- Step 1: Get viewer's profile ID if viewer_user_id is provided (exclude soft-deleted)
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Step 2: Query follow list with profile data and viewer follow status
  WITH follow_list AS (
    SELECT DISTINCT
      -- Profile data
      profile.id,
      profile.user_id,
      profile.username,
      profile.display_name,
      profile.avatar_url,
      -- Follow relationship created_at (for ordering)
      follow_relationship.created_at as follow_created_at,
      -- Viewer's follow status for this profile
      CASE
        WHEN v_viewer_profile_id IS NULL THEN 'none'
        WHEN v_viewer_profile_id = profile.id THEN 'self'
        WHEN viewer_follows_target.follower_id IS NOT NULL AND viewer_follows_target.status = 'approved' 
             AND target_follows_viewer.follower_id IS NOT NULL AND target_follows_viewer.status = 'approved' 
        THEN 'friends'
        WHEN viewer_follows_target.follower_id IS NOT NULL AND viewer_follows_target.status = 'approved' 
        THEN 'following'
        WHEN viewer_follows_target.follower_id IS NOT NULL AND viewer_follows_target.status = 'pending' 
        THEN 'pending'
        ELSE 'none'
      END as viewer_follow_status
    FROM follows follow_relationship
    -- Join to get the profile being followed/following (exclude soft-deleted)
    INNER JOIN profiles profile ON 
      ((p_mode = 'followers' AND profile.id = follow_relationship.follower_id)
       OR (p_mode = 'following' AND profile.id = follow_relationship.following_id))
      AND profile.deleted_at IS NULL
    -- Join to check if viewer follows this profile (for follow button status)
    LEFT JOIN follows viewer_follows_target ON 
      viewer_follows_target.follower_id = v_viewer_profile_id 
      AND viewer_follows_target.following_id = profile.id
    -- Join to check if this profile follows viewer (for mutual follow check)
    LEFT JOIN follows target_follows_viewer ON 
      target_follows_viewer.follower_id = profile.id 
      AND target_follows_viewer.following_id = v_viewer_profile_id
    WHERE
      -- Filter by mode: followers or following
      ((p_mode = 'followers' AND follow_relationship.following_id = p_profile_id)
       OR (p_mode = 'following' AND follow_relationship.follower_id = p_profile_id))
      -- Only show approved follows (not pending or declined)
      AND follow_relationship.status = 'approved'
    ORDER BY follow_relationship.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  -- Aggregate results into JSON array
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'username', username,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'viewer_follow_status', viewer_follow_status
    ) ORDER BY follow_created_at DESC
  )
  INTO v_users
  FROM follow_list;

  -- Step 3: Build final result
  v_result := jsonb_build_object(
    'users', COALESCE(v_users, '[]'::jsonb),
    'count', jsonb_array_length(COALESCE(v_users, '[]'::jsonb))
  );

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_post_detail_with_related_data(p_post_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
  v_post JSONB;
BEGIN
  -- Step 1: Get viewer's profile ID if viewer_user_id is provided
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Step 2: Query post with all related data
  SELECT jsonb_build_object(
    'id', p.id,
    'type', p.type,
    'caption', p.caption,
    'created_at', p.created_at,
    'author_id', p.author_id,
    'status', p.status,
    'is_anonymous', p.is_anonymous,
    'anonymous_name', p.anonymous_name,
    'anonymous_avatar', p.anonymous_avatar,
    'visibility', p.visibility,
    'rsvp_capacity', p.rsvp_capacity,
    'selected_dates', p.selected_dates,
    'is_recurring', p.is_recurring,
    'recurrence_days', p.recurrence_days,
    'tags', p.tags,
    'rating_enabled', p.rating_enabled,
    'rating_average', p.rating_average,
    'rating_count', p.rating_count,
    'like_count', COALESCE(p.like_count, 0),
    'save_count', COALESCE(p.save_count, 0),
    'effective_like_count', CASE
      WHEN p.type = 'experience' THEN COALESCE(p.like_count, 0) + COALESCE(demo.demo_like_count, 0)
      ELSE COALESCE(p.like_count, 0)
    END,
    'effective_save_count', CASE
      WHEN p.type = 'experience' THEN COALESCE(p.save_count, 0) + COALESCE(demo.demo_save_count, 0)
      ELSE COALESCE(p.save_count, 0)
    END,
    'effective_rating_average', CASE
      WHEN p.type = 'experience' THEN
        CASE
          WHEN (COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)) = 0 THEN 0
          ELSE ROUND(
            (
              (COALESCE(demo.demo_rating_average, 0)::numeric * COALESCE(demo.demo_rating_count, 0)::numeric) +
              (COALESCE(p.rating_average, 0)::numeric * COALESCE(p.rating_count, 0)::numeric)
            ) / NULLIF((COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0))::numeric, 0),
            2
          )
        END
      ELSE COALESCE(p.rating_average, 0)
    END,
    'effective_rating_count', CASE
      WHEN p.type = 'experience' THEN COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)
      ELSE COALESCE(p.rating_count, 0)
    END,
    'viewer_rating', (
      SELECT pr.stars
      FROM post_ratings pr
      WHERE pr.post_id = p.id
        AND pr.user_id = p_viewer_user_id
      LIMIT 1
    ),
    -- Author profile
    'author', jsonb_build_object(
      'id', author_profile.id,
      'username', author_profile.username,
      'display_name', author_profile.display_name,
      'avatar_url', author_profile.avatar_url,
      'is_private', author_profile.is_private
    ),
    -- Follow status
    'follow_status', CASE
      WHEN v_viewer_profile_id IS NULL THEN 'none'
      WHEN v_viewer_profile_id = author_profile.id THEN 'self'
      WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
           AND reverse_follow.follower_id IS NOT NULL AND reverse_follow.status = 'approved'
      THEN 'friends'
      WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
      THEN 'following'
      WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'pending'
      THEN 'pending'
      ELSE 'none'
    END,
    -- Like status
    'is_liked', CASE WHEN p_viewer_user_id IS NOT NULL AND user_like.post_id IS NOT NULL THEN true ELSE false END,
    -- Save status
    'is_saved', CASE WHEN p_viewer_user_id IS NOT NULL AND user_save.post_id IS NOT NULL THEN true ELSE false END,
    -- Engagement counts (canonical columns on posts)
    'comment_count', COALESCE(p.comment_count, 0),
    -- Has images flag
    'has_images', CASE
      WHEN EXISTS (
        SELECT 1
        FROM activities a
        WHERE a.post_id = p.id
          AND a.images IS NOT NULL
          AND array_length(a.images, 1) > 0
      ) THEN true
      ELSE false
    END,
    -- Activities (ordered by order_idx)
    'activities', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'title', a.title,
            'images', a.images,
            'order_idx', a.order_idx,
            'location_name', a.location_name,
            'location_desc', a.location_desc,
            'location_url', a.location_url,
            'location_notes', a.location_notes,
            'additional_info', a.additional_info,
            'tags', a.tags
          ) ORDER BY a.order_idx ASC
        )
        FROM activities a
        WHERE a.post_id = p.id
      ),
      '[]'::jsonb
    ),
    -- RSVP data (only for hangouts)
    'rsvp_data', CASE
      WHEN p.type = 'hangout' THEN
        jsonb_build_object(
          'users', COALESCE(rsvp_users.json_array, '[]'::jsonb),
          'currentUserStatus', COALESCE(user_rsvp.status, NULL)
        )
      ELSE NULL
    END
  )
  INTO v_post
  FROM posts p
  -- Join author profile
  INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
  -- Join follow status (viewer following author)
  LEFT JOIN follows mutual_follow ON
    mutual_follow.follower_id = v_viewer_profile_id
    AND mutual_follow.following_id = author_profile.id
  -- Join reverse follow (author following viewer, for mutual check)
  LEFT JOIN follows reverse_follow ON
    reverse_follow.follower_id = author_profile.id
    AND reverse_follow.following_id = v_viewer_profile_id
  -- Join like status
  LEFT JOIN post_likes user_like ON
    user_like.post_id = p.id
    AND user_like.user_id = p_viewer_user_id
  -- Join save status
  LEFT JOIN saved_posts user_save ON
    user_save.post_id = p.id
    AND user_save.user_id = p_viewer_user_id
  LEFT JOIN public.post_demo_engagement demo ON
    demo.post_id = p.id
  -- Join RSVP users (only "going" status, limit 10)
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', sub.profile_id,
            'username', sub.username,
            'display_name', sub.display_name,
            'avatar_url', sub.avatar_url,
            'status', sub.status,
            'created_at', sub.created_at
          ) ORDER BY sub.created_at DESC
        )
        FROM (
          SELECT
            rsvp_profile.id as profile_id,
            rsvp_profile.username,
            rsvp_profile.display_name,
            rsvp_profile.avatar_url,
            rsvp_response.status,
            rsvp_response.created_at
          FROM rsvp_responses rsvp_response
          INNER JOIN profiles rsvp_profile ON rsvp_profile.user_id = rsvp_response.user_id AND rsvp_profile.deleted_at IS NULL
          WHERE rsvp_response.post_id = p.id
            AND rsvp_response.status = 'going'
          ORDER BY rsvp_response.created_at DESC
          LIMIT 10
        ) sub
      ),
      '[]'::jsonb
    ) as json_array
  ) rsvp_users ON true
  -- Join user's RSVP status
  LEFT JOIN rsvp_responses user_rsvp ON
    user_rsvp.post_id = p.id
    AND user_rsvp.user_id = p_viewer_user_id
  WHERE p.id = p_post_id
    -- v1 user_blocks: no post detail across a blocked pair (symmetric)
    AND (
      p_viewer_user_id IS NULL
      OR NOT public.users_are_blocked_pair(p_viewer_user_id, p.author_id)
    )
    -- Privacy filter: show post if:
    -- 1. Author is not private, OR
    -- 2. Author is private AND viewer is following (approved status), OR
    -- 3. Viewer is the author
    AND (
      author_profile.is_private = false
      OR v_viewer_profile_id = author_profile.id
      OR (author_profile.is_private = true AND mutual_follow.status = 'approved')
    )
    -- Visibility filter: show post if:
    -- 1. Visibility is 'public' or NULL, OR
    -- 2. Visibility is 'friends' AND mutual follow exists, OR
    -- 3. Viewer is the author
    AND (
      p.visibility IS NULL
      OR p.visibility = 'public'
      OR p.visibility = 'anonymous'
      OR v_viewer_profile_id = author_profile.id
      OR (p.visibility = 'friends' AND mutual_follow.status = 'approved' AND reverse_follow.status = 'approved')
    );

  -- Step 3: Build final result
  IF v_post IS NULL THEN
    v_result := jsonb_build_object('post', NULL, 'error', 'Post not found or access denied');
  ELSE
    v_result := jsonb_build_object('post', v_post);
  END IF;

  RETURN v_result;
END;
$function$


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
  -- Step 1: Get all RSVP users with their profiles
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

  -- Step 2: Get current user's RSVP status (if viewer_user_id is provided)
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT r.status
    INTO v_current_user_status
    FROM rsvp_responses r
    WHERE r.post_id = p_post_id
      AND r.user_id = p_viewer_user_id
    LIMIT 1;
  END IF;

  -- Step 3: Build final result
  v_result := jsonb_build_object(
    'users', COALESCE(v_users, '[]'::jsonb),
    'currentUserStatus', v_current_user_status
  );

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_user_posts_created_with_related_data(p_user_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_include_drafts boolean DEFAULT false, p_is_owner boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_user_profile_id UUID;
  v_result JSONB;
  v_posts JSONB;
BEGIN
  SELECT id INTO v_user_profile_id
  FROM profiles
  WHERE user_id = p_user_id AND deleted_at IS NULL
  LIMIT 1;

  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  WITH filtered_posts AS (
    SELECT DISTINCT
      p.id,
      p.type,
      p.caption,
      p.is_anonymous,
      p.anonymous_name,
      p.anonymous_avatar,
      p.created_at,
      p.selected_dates,
      p.tags,
      p.author_id,
      p.status,
      jsonb_build_object(
        'id', author_profile.id,
        'username', author_profile.username,
        'display_name', author_profile.display_name,
        'avatar_url', author_profile.avatar_url,
        'is_private', author_profile.is_private
      ) as author,
      CASE
        WHEN v_viewer_profile_id IS NULL THEN 'none'
        WHEN v_viewer_profile_id = author_profile.id THEN 'self'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
             AND reverse_follow.follower_id IS NOT NULL AND reverse_follow.status = 'approved'
        THEN 'friends'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
        THEN 'following'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'pending'
        THEN 'pending'
        ELSE 'none'
      END as follow_status,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_like.post_id IS NOT NULL THEN true ELSE false END as is_liked,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_save.post_id IS NOT NULL THEN true ELSE false END as is_saved,
      COALESCE(p.like_count, 0) as like_count,
      COALESCE(p.save_count, 0) as save_count,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(p.like_count, 0) + COALESCE(demo.demo_like_count, 0)
        ELSE COALESCE(p.like_count, 0)
      END as effective_like_count,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(p.save_count, 0) + COALESCE(demo.demo_save_count, 0)
        ELSE COALESCE(p.save_count, 0)
      END as effective_save_count,
      COALESCE(p.comment_count, 0) as comment_count,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM activities a
          WHERE a.post_id = p.id
            AND a.images IS NOT NULL
            AND array_length(a.images, 1) > 0
        ) THEN true
        ELSE false
      END as has_images,
      -- ✅ FIXED: Cast text[] to jsonb
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'images', to_jsonb(a.images),
              'created_at', a.created_at
            ) ORDER BY a.created_at
          )
          FROM activities a
          WHERE a.post_id = p.id
        ),
        '[]'::jsonb
      ) as activities,
      CASE
        WHEN p.type = 'hangout' THEN
          jsonb_build_object(
            'users', COALESCE(rsvp_users.json_array, '[]'::jsonb),
            'currentUserStatus', COALESCE(user_rsvp.status, NULL)
          )
        ELSE NULL
      END as rsvp_data,
      p.rsvp_capacity as rsvp_capacity,
      p.rating_enabled,
      p.rating_average,
      p.rating_count,
      CASE
        WHEN p.type = 'experience' THEN
          CASE
            WHEN (COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)) = 0 THEN 0
            ELSE ROUND(
              (
                (COALESCE(demo.demo_rating_average, 0)::numeric * COALESCE(demo.demo_rating_count, 0)::numeric) +
                (COALESCE(p.rating_average, 0)::numeric * COALESCE(p.rating_count, 0)::numeric)
              ) / NULLIF((COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0))::numeric, 0),
              2
            )
          END
        ELSE COALESCE(p.rating_average, 0)
      END as effective_rating_average,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)
        ELSE COALESCE(p.rating_count, 0)
      END as effective_rating_count,
      (
        SELECT pr.stars
        FROM post_ratings pr
        WHERE pr.post_id = p.id
          AND pr.user_id = p_viewer_user_id
        LIMIT 1
      ) as viewer_rating
    FROM posts p
    INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
    LEFT JOIN follows mutual_follow ON
      mutual_follow.follower_id = v_viewer_profile_id
      AND mutual_follow.following_id = author_profile.id
    LEFT JOIN follows reverse_follow ON
      reverse_follow.follower_id = author_profile.id
      AND reverse_follow.following_id = v_viewer_profile_id
    LEFT JOIN post_likes user_like ON
      user_like.post_id = p.id
      AND user_like.user_id = p_viewer_user_id
    LEFT JOIN saved_posts user_save ON
      user_save.post_id = p.id
      AND user_save.user_id = p_viewer_user_id
    LEFT JOIN public.post_demo_engagement demo ON
      demo.post_id = p.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        (
          SELECT jsonb_agg(
          jsonb_build_object(
            'id', sub.profile_id,
            'username', sub.username,
            'display_name', sub.display_name,
            'avatar_url', sub.avatar_url,
            'status', sub.status,
            'created_at', sub.created_at
          ) ORDER BY sub.created_at DESC
          )
          FROM (
            SELECT
              rsvp_profile.id as profile_id,
              rsvp_profile.username,
              rsvp_profile.display_name,
              rsvp_profile.avatar_url,
              rsvp_response.status,
              rsvp_response.created_at
            FROM rsvp_responses rsvp_response
            INNER JOIN profiles rsvp_profile ON rsvp_profile.user_id = rsvp_response.user_id AND rsvp_profile.deleted_at IS NULL
            WHERE rsvp_response.post_id = p.id
              AND rsvp_response.status = 'going'
            ORDER BY rsvp_response.created_at DESC
            LIMIT 10
          ) sub
        ),
        '[]'::jsonb
      ) as json_array
    ) rsvp_users ON true
    LEFT JOIN rsvp_responses user_rsvp ON
      user_rsvp.post_id = p.id
      AND user_rsvp.user_id = p_viewer_user_id
    WHERE
      p.author_id = p_user_id
      AND (p_is_owner = true OR p.is_anonymous IS NULL OR p.is_anonymous = false)
      AND (
        (p_is_owner = false AND p.status = 'published')
        OR (p_is_owner = true AND p_include_drafts = true)
        OR (p_is_owner = true AND p_include_drafts = false AND p.status = 'published')
      )
      -- v1 user_blocks: other-profile created tab — hide when viewer and profile owner are blocked pair
      AND (
        p_viewer_user_id IS NULL
        OR p_is_owner = true
        OR NOT public.users_are_blocked_pair(p_viewer_user_id, p_user_id)
      )
      AND (
        author_profile.is_private = false
        OR v_viewer_profile_id = author_profile.id
        OR (author_profile.is_private = true AND mutual_follow.status = 'approved')
      )
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'type', type,
      'caption', caption,
      'is_anonymous', is_anonymous,
      'anonymous_name', anonymous_name,
      'anonymous_avatar', anonymous_avatar,
      'created_at', created_at,
      'selected_dates', selected_dates,
      'tags', tags,
      'author_id', author_id,
      'status', status,
      'author', author,
      'follow_status', follow_status,
      'is_liked', is_liked,
      'is_saved', is_saved,
      'like_count', like_count,
      'save_count', save_count,
      'effective_like_count', effective_like_count,
      'effective_save_count', effective_save_count,
      'comment_count', comment_count,
      'has_images', has_images,
      'activities', activities,
      'rsvp_data', rsvp_data,
      'rsvp_capacity', rsvp_capacity,
      'rating_enabled', rating_enabled,
      'rating_average', rating_average,
      'rating_count', rating_count,
      'effective_rating_average', effective_rating_average,
      'effective_rating_count', effective_rating_count,
      'viewer_rating', viewer_rating
    ) ORDER BY created_at DESC
  )
  INTO v_posts
  FROM filtered_posts;

  v_result := jsonb_build_object(
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'count', jsonb_array_length(COALESCE(v_posts, '[]'::jsonb))
  );

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_user_posts_liked_with_related_data(p_user_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
  v_posts JSONB;
BEGIN
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  WITH filtered_posts AS (
    SELECT DISTINCT
      p.id,
      p.type,
      p.caption,
      p.is_anonymous,
      p.anonymous_name,
      p.anonymous_avatar,
      p.created_at,
      p.selected_dates,
      p.tags,
      p.author_id,
      pl.id as like_id,
      pl.created_at as liked_at,
      jsonb_build_object(
        'id', author_profile.id,
        'username', author_profile.username,
        'display_name', author_profile.display_name,
        'avatar_url', author_profile.avatar_url,
        'is_private', author_profile.is_private
      ) as author,
      CASE
        WHEN v_viewer_profile_id IS NULL THEN 'none'
        WHEN v_viewer_profile_id = author_profile.id THEN 'self'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
             AND reverse_follow.follower_id IS NOT NULL AND reverse_follow.status = 'approved'
        THEN 'friends'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
        THEN 'following'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'pending'
        THEN 'pending'
        ELSE 'none'
      END as follow_status,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_like.post_id IS NOT NULL THEN true ELSE false END as is_liked,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_save.post_id IS NOT NULL THEN true ELSE false END as is_saved,
      (
        SELECT COUNT(*)
        FROM comments c
        WHERE c.post_id = p.id
          AND c.is_deleted = false
      ) as comment_count,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM activities a
          WHERE a.post_id = p.id
            AND a.images IS NOT NULL
            AND array_length(a.images, 1) > 0
        ) THEN true
        ELSE false
      END as has_images,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'images', to_jsonb(a.images),
              'created_at', a.created_at
            ) ORDER BY a.created_at
          )
          FROM activities a
          WHERE a.post_id = p.id
        ),
        '[]'::jsonb
      ) as activities,
      CASE
        WHEN p.type = 'hangout' THEN
          jsonb_build_object(
            'users', COALESCE(rsvp_users.json_array, '[]'::jsonb),
            'currentUserStatus', COALESCE(user_rsvp.status, NULL)
          )
        ELSE NULL
      END as rsvp_data
    FROM post_likes pl
    INNER JOIN posts p ON p.id = pl.post_id
    INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
    LEFT JOIN follows mutual_follow ON
      mutual_follow.follower_id = v_viewer_profile_id
      AND mutual_follow.following_id = author_profile.id
    LEFT JOIN follows reverse_follow ON
      reverse_follow.follower_id = author_profile.id
      AND reverse_follow.following_id = v_viewer_profile_id
    LEFT JOIN post_likes user_like ON
      user_like.post_id = p.id
      AND user_like.user_id = p_viewer_user_id
    LEFT JOIN saved_posts user_save ON
      user_save.post_id = p.id
      AND user_save.user_id = p_viewer_user_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', sub.profile_id,
              'username', sub.username,
              'display_name', sub.display_name,
              'avatar_url', sub.avatar_url,
              'status', sub.status,
              'created_at', sub.created_at
            ) ORDER BY sub.created_at DESC
          )
          FROM (
            SELECT
              rsvp_profile.id as profile_id,
              rsvp_profile.username,
              rsvp_profile.display_name,
              rsvp_profile.avatar_url,
              rsvp_response.status,
              rsvp_response.created_at
            FROM rsvp_responses rsvp_response
            INNER JOIN profiles rsvp_profile ON rsvp_profile.user_id = rsvp_response.user_id AND rsvp_profile.deleted_at IS NULL
            WHERE rsvp_response.post_id = p.id
              AND rsvp_response.status = 'going'
            ORDER BY rsvp_response.created_at DESC
            LIMIT 10
          ) sub
        ),
        '[]'::jsonb
      ) as json_array
    ) rsvp_users ON true
    LEFT JOIN rsvp_responses user_rsvp ON
      user_rsvp.post_id = p.id
      AND user_rsvp.user_id = p_viewer_user_id
    WHERE
      pl.user_id = p_user_id
      AND p.status = 'published'
      AND (
        author_profile.is_private = false
        OR v_viewer_profile_id = author_profile.id
        OR (author_profile.is_private = true AND mutual_follow.status = 'approved')
      )
    ORDER BY pl.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'type', type,
      'caption', caption,
      'is_anonymous', is_anonymous,
      'anonymous_name', anonymous_name,
      'anonymous_avatar', anonymous_avatar,
      'created_at', created_at,
      'selected_dates', selected_dates,
      'tags', tags,
      'author_id', author_id,
      'like_id', like_id,
      'liked_at', liked_at,
      'author', author,
      'follow_status', follow_status,
      'is_liked', is_liked,
      'is_saved', is_saved,
      'comment_count', comment_count,
      'has_images', has_images,
      'activities', activities,
      'rsvp_data', rsvp_data
    ) ORDER BY liked_at DESC
  )
  INTO v_posts
  FROM filtered_posts;

  v_result := jsonb_build_object(
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'count', jsonb_array_length(COALESCE(v_posts, '[]'::jsonb))
  );

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_user_posts_saved_with_related_data(p_user_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
  v_posts JSONB;
BEGIN
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  WITH filtered_posts AS (
    SELECT DISTINCT
      p.id,
      p.type,
      p.caption,
      p.is_anonymous,
      p.anonymous_name,
      p.anonymous_avatar,
      p.created_at,
      p.selected_dates,
      p.tags,
      p.author_id,
      sp.id as saved_post_id,
      sp.created_at as saved_at,
      jsonb_build_object(
        'id', author_profile.id,
        'username', author_profile.username,
        'display_name', author_profile.display_name,
        'avatar_url', author_profile.avatar_url,
        'is_private', author_profile.is_private
      ) as author,
      CASE
        WHEN v_viewer_profile_id IS NULL THEN 'none'
        WHEN v_viewer_profile_id = author_profile.id THEN 'self'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
             AND reverse_follow.follower_id IS NOT NULL AND reverse_follow.status = 'approved'
        THEN 'friends'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
        THEN 'following'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'pending'
        THEN 'pending'
        ELSE 'none'
      END as follow_status,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_like.post_id IS NOT NULL THEN true ELSE false END as is_liked,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_save.post_id IS NOT NULL THEN true ELSE false END as is_saved,
      (
        SELECT COUNT(*)
        FROM comments c
        WHERE c.post_id = p.id
          AND c.is_deleted = false
      ) as comment_count,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM activities a
          WHERE a.post_id = p.id
            AND a.images IS NOT NULL
            AND array_length(a.images, 1) > 0
        ) THEN true
        ELSE false
      END as has_images,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'images', to_jsonb(a.images),
              'created_at', a.created_at
            ) ORDER BY a.created_at
          )
          FROM activities a
          WHERE a.post_id = p.id
        ),
        '[]'::jsonb
      ) as activities,
      CASE
        WHEN p.type = 'hangout' THEN
          jsonb_build_object(
            'users', COALESCE(rsvp_users.json_array, '[]'::jsonb),
            'currentUserStatus', COALESCE(user_rsvp.status, NULL)
          )
        ELSE NULL
      END as rsvp_data
    FROM saved_posts sp
    INNER JOIN posts p ON p.id = sp.post_id
    INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
    LEFT JOIN follows mutual_follow ON
      mutual_follow.follower_id = v_viewer_profile_id
      AND mutual_follow.following_id = author_profile.id
    LEFT JOIN follows reverse_follow ON
      reverse_follow.follower_id = author_profile.id
      AND reverse_follow.following_id = v_viewer_profile_id
    LEFT JOIN post_likes user_like ON
      user_like.post_id = p.id
      AND user_like.user_id = p_viewer_user_id
    LEFT JOIN saved_posts user_save ON
      user_save.post_id = p.id
      AND user_save.user_id = p_viewer_user_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', sub.profile_id,
              'username', sub.username,
              'display_name', sub.display_name,
              'avatar_url', sub.avatar_url,
              'status', sub.status,
              'created_at', sub.created_at
            ) ORDER BY sub.created_at DESC
          )
          FROM (
            SELECT
              rsvp_profile.id as profile_id,
              rsvp_profile.username,
              rsvp_profile.display_name,
              rsvp_profile.avatar_url,
              rsvp_response.status,
              rsvp_response.created_at
            FROM rsvp_responses rsvp_response
            INNER JOIN profiles rsvp_profile ON rsvp_profile.user_id = rsvp_response.user_id AND rsvp_profile.deleted_at IS NULL
            WHERE rsvp_response.post_id = p.id
              AND rsvp_response.status = 'going'
            ORDER BY rsvp_response.created_at DESC
            LIMIT 10
          ) sub
        ),
        '[]'::jsonb
      ) as json_array
    ) rsvp_users ON true
    LEFT JOIN rsvp_responses user_rsvp ON
      user_rsvp.post_id = p.id
      AND user_rsvp.user_id = p_viewer_user_id
    WHERE
      sp.user_id = p_user_id
      AND p.status = 'published'
      AND (
        author_profile.is_private = false
        OR v_viewer_profile_id = author_profile.id
        OR (author_profile.is_private = true AND mutual_follow.status = 'approved')
      )
    ORDER BY sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'type', type,
      'caption', caption,
      'is_anonymous', is_anonymous,
      'anonymous_name', anonymous_name,
      'anonymous_avatar', anonymous_avatar,
      'created_at', created_at,
      'selected_dates', selected_dates,
      'tags', tags,
      'author_id', author_id,
      'saved_post_id', saved_post_id,
      'saved_at', saved_at,
      'author', author,
      'follow_status', follow_status,
      'is_liked', is_liked,
      'is_saved', is_saved,
      'comment_count', comment_count,
      'has_images', has_images,
      'activities', activities,
      'rsvp_data', rsvp_data
    ) ORDER BY saved_at DESC
  )
  INTO v_posts
  FROM filtered_posts;

  v_result := jsonb_build_object(
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'count', jsonb_array_length(COALESCE(v_posts, '[]'::jsonb))
  );

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.increment_my_xp(p_delta integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid;
  v_new_xp integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set xp = greatest(coalesce(xp, 0) + p_delta, 0)
  where user_id = v_user_id
  returning xp into v_new_xp;

  if v_new_xp is null then
    raise exception 'Profile not found for user';
  end if;

  return v_new_xp;
end;
$function$


CREATE OR REPLACE FUNCTION public.notify_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  post_author_id UUID;
BEGIN
  -- Get the post author
  SELECT author_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  -- Create notification for post author (not for the commenter themselves)
  PERFORM create_notification(
    post_author_id,
    NEW.author_id,
    'comment',
    'comment',
    NEW.id,
    jsonb_build_object('post_id', NEW.post_id, 'comment_text', LEFT(NEW.content, 100))
  );

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.notify_follow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target_user_id UUID;
  follower_user_id UUID;
BEGIN
  -- Only create notification for APPROVED follows, not pending requests
  -- Pending requests are handled by the manual notification code in follows.ts
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW; -- Skip notification creation for pending/declined follows
  END IF;

  -- Get the user_id for the person being followed (following_id is a profile_id)
  SELECT user_id INTO target_user_id
  FROM profiles 
  WHERE id = NEW.following_id;
  
  -- Get the user_id for the person following (follower_id is a profile_id) 
  SELECT user_id INTO follower_user_id
  FROM profiles 
  WHERE id = NEW.follower_id;

  -- Only create notification if both user_ids are found
  IF target_user_id IS NOT NULL AND follower_user_id IS NOT NULL THEN
    -- Create notification for the user being followed
    PERFORM create_notification(
      target_user_id,    -- p_user_id: The user being followed (auth.users.id)
      follower_user_id,  -- p_actor_id: The user who is following (auth.users.id)
      'follow',
      'post',            -- p_entity_type: Using 'post' as entity_type for follows
      NEW.follower_id    -- p_entity_id: Use follower_id as entity_id
    );
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.notify_post_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  post_author_id UUID;
BEGIN
  -- Get the post author
  SELECT author_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  -- Create notification
  PERFORM create_notification(
    post_author_id,
    NEW.user_id,
    'like',
    'post',
    NEW.post_id
  );

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.notify_rsvp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  post_author_id UUID;
  post_type TEXT;
  entity_type_val TEXT;
BEGIN
  -- Only notify for "going" status (not "maybe" or "not_going")
  IF NEW.status = 'going' THEN
    -- Get the post author and type
    SELECT author_id, type INTO post_author_id, post_type
    FROM posts
    WHERE id = NEW.post_id;

    -- Only create notification if the RSVP is not from the post author
    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
      -- Determine entity type based on post type
      entity_type_val := CASE WHEN post_type = 'hangout' THEN 'hangout' ELSE 'experience' END;
      
      -- Create notification
      PERFORM create_notification(
        post_author_id,
        NEW.user_id,
        'rsvp',
        entity_type_val,
        NEW.post_id,
        jsonb_build_object('rsvp_status', NEW.status)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  return new;
end; $function$


CREATE OR REPLACE FUNCTION public.set_updated_at_post_ratings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.strip_data_images(imgs text[])
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    array(
      select i
      from unnest(coalesce(imgs, array[]::text[])) as t(i)
      where i is not null
        and i <> ''
        and i not like 'data:%'
    ),
    array[]::text[]
  );
$function$


CREATE OR REPLACE FUNCTION public.trigger_assign_user_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Only assign if user_number is NULL (new user)
    IF NEW.user_number IS NULL THEN
        NEW.user_number := assign_user_number();
    END IF;
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ select auth.uid() $function$


CREATE OR REPLACE FUNCTION public.update_invites_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_notification_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_push_devices_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_user_activities_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$

