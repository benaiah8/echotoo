-- Bunny Video Phase V1A — post_media foundation (local only).
-- Do NOT apply during Build without explicit approval.
--
-- Pre-publish Bunny videos attach by (owner_user_id, publish_post_id) where
-- publish_post_id = client draftMeta.publishPostId (= future posts.id).
-- post_id stays NULL until owner_create_post attachment (next phase).
--
-- No owner_create_post / owner_republish_post changes in this migration.
-- No backfill. Existing posts keep NULL media_order and legacy image order.

-- ---------------------------------------------------------------------------
-- 1) post_media
-- ---------------------------------------------------------------------------
CREATE TABLE public.post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_post_id uuid NOT NULL,
  owner_user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  post_id uuid NULL
    REFERENCES public.posts (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'video',
  bunny_video_id text NOT NULL,
  video_status text NOT NULL DEFAULT 'pending',
  poster_url text NULL,
  duration_sec numeric NULL,
  width integer NULL,
  height integer NULL,
  failure_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_media_kind_check CHECK (kind = 'video'),
  CONSTRAINT post_media_video_status_check CHECK (
    video_status IN (
      'pending',
      'uploading',
      'processing',
      'ready',
      'failed'
    )
  ),
  CONSTRAINT post_media_post_id_matches_publish CHECK (
    post_id IS NULL OR post_id = publish_post_id
  )
);

COMMENT ON TABLE public.post_media IS
  'Post-attached Bunny Stream videos. Pre-publish rows use publish_post_id + owner_user_id; post_id set on publish.';

COMMENT ON COLUMN public.post_media.publish_post_id IS
  'Client-assigned future posts.id (draftMeta.publishPostId) before publish; equals post_id after attach.';

COMMENT ON COLUMN public.post_media.post_id IS
  'NULL while draft/pre-publish; set to publish_post_id when post is published (next phase).';

COMMENT ON COLUMN public.post_media.bunny_video_id IS
  'Bunny Stream video GUID. Assigned server-side at upload-init.';

-- ---------------------------------------------------------------------------
-- 2) Indexes / ordering guards
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX post_media_bunny_video_id_key
  ON public.post_media (bunny_video_id);

CREATE INDEX post_media_unattached_publish_post_id_idx
  ON public.post_media (publish_post_id)
  WHERE post_id IS NULL;

CREATE INDEX post_media_post_id_sort_order_idx
  ON public.post_media (post_id, sort_order)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX post_media_unattached_publish_sort_uniq
  ON public.post_media (publish_post_id, sort_order)
  WHERE post_id IS NULL;

CREATE UNIQUE INDEX post_media_attached_post_sort_uniq
  ON public.post_media (post_id, sort_order)
  WHERE post_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) posts.media_order — mixed image/video composer order (future)
-- ---------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_order jsonb NULL;

COMMENT ON COLUMN public.posts.media_order IS
  'Optional ordered media refs for mixed image/video carousel. NULL = legacy activities[0].images order only.';

-- ---------------------------------------------------------------------------
-- 4) updated_at — reuse existing shared trigger helper
-- ---------------------------------------------------------------------------
CREATE TRIGGER post_media_set_updated_at
  BEFORE UPDATE ON public.post_media
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5) RLS — read-only for client; mutations via service-role Edge Functions
-- ---------------------------------------------------------------------------
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.post_media FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.post_media TO anon, authenticated;

DROP POLICY IF EXISTS post_media_select_v1 ON public.post_media;
CREATE POLICY post_media_select_v1 ON public.post_media
  FOR SELECT
  USING (
    owner_user_id = (SELECT auth.uid())
    OR (
      post_id IS NOT NULL
      AND public.can_view_post(post_id)
    )
  );

-- No INSERT / UPDATE / DELETE for authenticated or anon.
-- Rows and Bunny metadata are created/updated/deleted by Edge Functions
-- (bunny-upload-init, bunny-stream-webhook, bunny-video-delete) via service role.
