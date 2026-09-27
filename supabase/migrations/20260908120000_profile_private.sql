-- Profile Enhancement Migration B — private owner-only Profile metadata.
-- LOCAL FILE ONLY. Do NOT apply without explicit production approval.
-- Does not modify public.profiles. No DOB/gender on public Profile rows.
-- No backfill. No People / age / discovery logic.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
-- Private Profile metadata (DOB, gender). Owner-only via RLS.
-- Full DOB must never be exposed through ordinary public.profiles reads.
CREATE TABLE public.profile_private (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users (id)
    ON DELETE CASCADE,
  date_of_birth date NULL,
  gender text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_private_gender_check CHECK (
    gender IS NULL
    OR gender IN ('male', 'female', 'prefer_not_to_say')
  )
);

COMMENT ON TABLE public.profile_private IS
  'Owner-only private Profile metadata. Not part of public profiles reads.';

COMMENT ON COLUMN public.profile_private.date_of_birth IS
  'Optional date of birth (date only). Not public Profile data; no stored age.';

COMMENT ON COLUMN public.profile_private.gender IS
  'Optional gender: male | female | prefer_not_to_say. NULL = never selected.';

-- ---------------------------------------------------------------------------
-- updated_at — reuse existing shared trigger helper
-- ---------------------------------------------------------------------------
CREATE TRIGGER profile_private_set_updated_at
  BEFORE UPDATE ON public.profile_private
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (owner-row only; same convention as push_devices)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_private_select_own
  ON public.profile_private
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY profile_private_insert_own
  ON public.profile_private
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY profile_private_update_own
  ON public.profile_private
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY profile_private_delete_own
  ON public.profile_private
  FOR DELETE
  USING (auth.uid() = user_id);
