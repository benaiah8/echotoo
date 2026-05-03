-- =============================================================================
-- EchoToo v1: user_blocks + helper RPC + RLS
--
-- Run order in Supabase SQL Editor (or migrations):
--   1) This file (table + RLS + users_are_blocked_pair)
--   2) Full `create_feed_function.sql` from the repo (get_feed_with_related_data)
--   3) From `supabase_soft_delete_rpc_patch.sql`: at minimum re-apply
--      `get_post_detail_with_related_data` and `get_user_posts_created_with_related_data`
--      (or run the whole patch file if that is your normal deploy process).
--
-- Without step 2–3, the app will call RPCs that reference users_are_blocked_pair
-- before it exists, or miss block filters on feed/detail/profile posts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_no_self CHECK (blocker_user_id <> blocked_user_id),
  CONSTRAINT user_blocks_unique_pair UNIQUE (blocker_user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON public.user_blocks (blocker_user_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_user_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Blocker can only see/manage rows they created (no "who blocked me" reads for blocked party)
DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own ON public.user_blocks
  FOR SELECT USING (blocker_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
CREATE POLICY user_blocks_insert_own ON public.user_blocks
  FOR INSERT WITH CHECK (
    blocker_user_id = (SELECT auth.uid())
    AND blocked_user_id <> (SELECT auth.uid())
  );

DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
CREATE POLICY user_blocks_delete_own ON public.user_blocks
  FOR DELETE USING (blocker_user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.user_blocks IS 'v1: blocker_user_id cannot see blocked_user_id in feeds/profiles; symmetric hide via users_are_blocked_pair.';

-- Symmetric block check for SECURITY DEFINER RPCs and client profile gate
CREATE OR REPLACE FUNCTION public.users_are_blocked_pair(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_a IS NULL OR p_b IS NULL OR p_a = p_b THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE (ub.blocker_user_id = p_a AND ub.blocked_user_id = p_b)
         OR (ub.blocker_user_id = p_b AND ub.blocked_user_id = p_a)
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.users_are_blocked_pair(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_are_blocked_pair(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.users_are_blocked_pair(uuid, uuid) TO service_role;
