-- App Update config: native build targeting + store-release-ready.
--
-- Read supabase/MIGRATION_STATUS.md before any production apply.
-- DO NOT run `supabase db push` while migration history remains unaudited.
--
-- Extends EXISTING live table public.app_update_config (already in production).
-- Does not fabricate historical create-table migrations.
-- Does not touch Feed, notifications, social, messaging, or other systems.
--
-- Note: expanding RETURNS TABLE requires DROP + CREATE (PostgreSQL 42P13).
-- DROP and CREATE must run in the same transaction/operation.

-- New columns (nullable-safe defaults for rollout)
ALTER TABLE public.app_update_config
  ADD COLUMN IF NOT EXISTS latest_build text NOT NULL DEFAULT '';

ALTER TABLE public.app_update_config
  ADD COLUMN IF NOT EXISTS minimum_supported_build text NOT NULL DEFAULT '';

ALTER TABLE public.app_update_config
  ADD COLUMN IF NOT EXISTS store_release_ready boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_update_config.latest_build IS
  'Native build target for optional/mandatory latest (Android versionCode / iOS CFBundleVersion). Empty = fall back to latest_version.';

COMMENT ON COLUMN public.app_update_config.minimum_supported_build IS
  'Native build below which clients must hard-update. Empty = fall back to minimum_supported_version.';

COMMENT ON COLUMN public.app_update_config.store_release_ready IS
  'True only when the store build is actually downloadable. Clients suppress prompts when false.';

-- Backfill: mark ready only when this platform already has its store URL
-- (avoids suddenly enabling prompts with a dead Update button).
UPDATE public.app_update_config c
SET store_release_ready = true
WHERE c.store_release_ready = false
  AND (
    (c.platform = 'android' AND btrim(c.android_store_url) <> '')
    OR (c.platform = 'ios' AND btrim(c.ios_store_url) <> '')
  );

-- Legal return-type change: drop exact overload only (no CASCADE), then recreate.
DROP FUNCTION public.get_app_update_runtime_config(text);

CREATE FUNCTION public.get_app_update_runtime_config(p_platform text)
 RETURNS TABLE(
   platform text,
   latest_version text,
   latest_build text,
   minimum_supported_version text,
   minimum_supported_build text,
   update_mode text,
   title text,
   message text,
   store_url text,
   is_active boolean,
   store_release_ready boolean,
   updated_at timestamp with time zone
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.platform,
    c.latest_version,
    c.latest_build,
    c.minimum_supported_version,
    c.minimum_supported_build,
    c.update_mode,
    c.title,
    c.message,
    CASE
      WHEN c.platform = 'android' THEN c.android_store_url
      WHEN c.platform = 'ios' THEN c.ios_store_url
      ELSE ''
    END AS store_url,
    c.is_active,
    c.store_release_ready,
    c.updated_at
  FROM public.app_update_config c
  WHERE c.platform = p_platform
    AND c.platform IN ('android', 'ios')
    AND c.is_active = true
  LIMIT 1;
$function$;

-- Restore EXECUTE grants exactly as captured from live preflight ACL:
-- {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- (=X/postgres => PUBLIC EXECUTE)
GRANT EXECUTE ON FUNCTION public.get_app_update_runtime_config(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_update_runtime_config(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_app_update_runtime_config(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_update_runtime_config(text) TO service_role;
