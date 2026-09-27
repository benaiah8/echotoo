-- Profile Enhancement Migration A — Echo companion + ordered profile photos.
-- LOCAL FILE ONLY. Do NOT apply without explicit production approval.
-- No Storage mutations. No RLS changes. No DOB/gender (Migration B).

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS echo_preset text;

COMMENT ON COLUMN public.profiles.echo_preset IS
  'Independent Echo companion id, e.g. preset:owl_01. Not cleared when real photos are uploaded.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_photos text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.profiles.profile_photos IS
  'Ordered real profile photo storage paths/URLs (0–3). Array index 1 = primary; mirrors TypeScript photos[0].';

-- ---------------------------------------------------------------------------
-- 2) Constraints (max 3; no NULL/empty elements)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_profile_photos_max_3_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_profile_photos_max_3_check
      CHECK (cardinality(profile_photos) <= 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_profile_photos_elements_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_profile_photos_elements_check
      CHECK (
        array_position(profile_photos, NULL) IS NULL
        AND NOT ('' = ANY (profile_photos))
      );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3) Existing-user metadata backfill (no Storage I/O)
-- ---------------------------------------------------------------------------
-- Preset-only: copy into echo_preset; leave avatar_url unchanged.
UPDATE public.profiles
SET echo_preset = avatar_url
WHERE avatar_url LIKE 'preset:%'
  AND echo_preset IS NULL;

-- Real avatar (storage path or https): Photo 1 = current avatar_url.
-- Skip blank/whitespace-only values (would violate profiles_profile_photos_elements_check).
-- Skip rows already backfilled (non-empty profile_photos).
UPDATE public.profiles
SET profile_photos = ARRAY[avatar_url]
WHERE avatar_url IS NOT NULL
  AND btrim(avatar_url) <> ''
  AND avatar_url NOT LIKE 'preset:%'
  AND cardinality(profile_photos) = 0;

-- Null/blank avatar: leave profile_photos = {}, echo_preset NULL; do not invent Echo.

-- ---------------------------------------------------------------------------
-- 4) Sync trigger — avatar_url compatibility + legacy write bridging
-- ---------------------------------------------------------------------------
-- Authoritative contract after sync:
--   avatar_url = profile_photos[1] ?? echo_preset ?? NULL
--
-- Legacy INSERT (avatar_url only): seed echo_preset or profile_photos, then sync.
-- Legacy UPDATE (avatar_url only):
--   - preset:* → update echo_preset only; never wipe profile_photos
--   - real URL → set/replace Photo 1 (keeps photos[2..] if present)
--   - NULL → do not destroy photos/echo; re-derive avatar_url from them
-- New-field UPDATE (profile_photos / echo_preset): always re-derive avatar_url.

CREATE OR REPLACE FUNCTION public.profiles_sync_avatar_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_photos text[];
  v_photos_empty boolean;
  v_photos_changed boolean;
  v_echo_changed boolean;
  v_avatar_changed boolean;
BEGIN
  -- Normalize accidental NULL array (column is NOT NULL, but keep defensive).
  IF NEW.profile_photos IS NULL THEN
    NEW.profile_photos := '{}'::text[];
  END IF;

  v_photos := NEW.profile_photos;
  v_photos_empty := cardinality(v_photos) = 0;

  IF TG_OP = 'INSERT' THEN
    -- Legacy INSERT: only avatar_url provided; new fields still empty/default.
    IF v_photos_empty
       AND NEW.echo_preset IS NULL
       AND NEW.avatar_url IS NOT NULL
       AND btrim(NEW.avatar_url) <> ''
    THEN
      IF NEW.avatar_url LIKE 'preset:%' THEN
        NEW.echo_preset := NEW.avatar_url;
      ELSE
        NEW.profile_photos := ARRAY[NEW.avatar_url];
      END IF;
    END IF;

    NEW.avatar_url := COALESCE(NEW.profile_photos[1], NEW.echo_preset, NULL);
    RETURN NEW;
  END IF;

  -- UPDATE
  v_photos_changed := NEW.profile_photos IS DISTINCT FROM OLD.profile_photos;
  v_echo_changed := NEW.echo_preset IS DISTINCT FROM OLD.echo_preset;
  v_avatar_changed := NEW.avatar_url IS DISTINCT FROM OLD.avatar_url;

  -- New app (or any write) touching photos/echo: derive avatar_url.
  IF v_photos_changed OR v_echo_changed THEN
    NEW.avatar_url := COALESCE(NEW.profile_photos[1], NEW.echo_preset, NULL);
    RETURN NEW;
  END IF;

  -- Legacy avatar_url-only UPDATE (photos/echo columns not in the SET list).
  IF v_avatar_changed THEN
    IF NEW.avatar_url IS NULL OR btrim(NEW.avatar_url) = '' THEN
      -- Non-destructive clear: keep photos + echo; re-derive display avatar.
      NEW.avatar_url := COALESCE(NEW.profile_photos[1], NEW.echo_preset, NULL);
      RETURN NEW;
    END IF;

    IF NEW.avatar_url LIKE 'preset:%' THEN
      -- Preset switch: store Echo independently; never wipe multi-photo metadata.
      NEW.echo_preset := NEW.avatar_url;
      NEW.avatar_url := COALESCE(NEW.profile_photos[1], NEW.echo_preset, NULL);
      RETURN NEW;
    END IF;

    -- Real-photo avatar_url write from legacy client.
    IF v_photos_empty THEN
      NEW.profile_photos := ARRAY[NEW.avatar_url];
    ELSIF cardinality(NEW.profile_photos) = 1 THEN
      NEW.profile_photos := ARRAY[NEW.avatar_url];
    ELSE
      -- Multi-photo already present: replace primary only; keep Photo 2/3.
      NEW.profile_photos :=
        ARRAY[NEW.avatar_url] || NEW.profile_photos[2:cardinality(NEW.profile_photos)];
    END IF;

    NEW.avatar_url := COALESCE(NEW.profile_photos[1], NEW.echo_preset, NULL);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.profiles_sync_avatar_url() IS
  'BEFORE INSERT/UPDATE: keep profiles.avatar_url = profile_photos[1] ?? echo_preset. Bridges legacy avatar_url-only writes without destroying multi-photo metadata.';

DROP TRIGGER IF EXISTS trg_profiles_sync_avatar_url ON public.profiles;
CREATE TRIGGER trg_profiles_sync_avatar_url
  BEFORE INSERT OR UPDATE OF profile_photos, echo_preset, avatar_url
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_sync_avatar_url();
