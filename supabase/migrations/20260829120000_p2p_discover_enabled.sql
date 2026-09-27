-- Phase 6A — Reciprocal Discover preference (local only).
-- Do NOT apply during Build without explicit approval.
-- Does not change list_pair_up_candidates, join/leave/express/complete, or My Plans.

-- ---------------------------------------------------------------------------
-- 1) Column
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS p2p_discover_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.p2p_discover_enabled IS
  'User-level reciprocal Discover. When true, the user may later browse Discover and their eligible active public-event P2Ps may appear there. When false, event P2Ps still work in shared pools / My Plans but must not appear in Discover. Not per-event.';

-- ---------------------------------------------------------------------------
-- 2) Owner-only setter
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_p2p_discover_enabled(
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_enabled boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Missing Discover preference';
  END IF;

  UPDATE public.profiles pr
  SET p2p_discover_enabled = p_enabled
  WHERE pr.user_id = v_me
    AND pr.deleted_at IS NULL
  RETURNING pr.p2p_discover_enabled INTO v_enabled;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  RETURN jsonb_build_object('p2p_discover_enabled', v_enabled);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_p2p_discover_enabled(boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_p2p_discover_enabled(boolean)
  TO authenticated;

COMMENT ON FUNCTION public.set_p2p_discover_enabled(boolean) IS
  'Owner-only toggle for profiles.p2p_discover_enabled. Does not change Pair Up membership, My Plans, or other users.';
