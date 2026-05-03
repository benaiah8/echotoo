-- Phase 1: store native push registration tokens (no sending logic yet)
CREATE TABLE IF NOT EXISTS public.push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user_id ON public.push_devices(user_id);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_devices_select_own"
  ON public.push_devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "push_devices_insert_own"
  ON public.push_devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_devices_update_own"
  ON public.push_devices FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_devices_delete_own"
  ON public.push_devices FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_push_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_push_devices_updated_at ON public.push_devices;
CREATE TRIGGER trigger_update_push_devices_updated_at
  BEFORE UPDATE ON public.push_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_push_devices_updated_at();

COMMENT ON TABLE public.push_devices IS 'Native push tokens (FCM/APNs); Phase 1 registration only';
