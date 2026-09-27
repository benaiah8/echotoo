-- Edit staging GC — LOCAL ONLY.
-- Do NOT apply / db push / repair without explicit production approval.
--
-- Abandoned Owner/Admin Edit video staging (slot-0 unattached on a published
-- post, older than 7 days) can be claimed into edit_staging_gc_outbox for
-- server-side Bunny cleanup. Create/no-post orphans and retired sort_order
-- >= 1000 rows are NEVER selected.
--
-- Claim order (race-safe vs Save attach):
--   FOR UPDATE SKIP LOCKED → DELETE post_media (still unattached) → INSERT outbox
-- Bunny delete happens ONLY in the Edge worker after claim.
--
-- Does NOT modify _apply_post_media_edit_core / owner_* / admin_republish_post.

-- ---------------------------------------------------------------------------
-- 1) Outbox (recovery after post_media DELETE)
-- ---------------------------------------------------------------------------
CREATE TABLE public.edit_staging_gc_outbox (
  post_media_id uuid PRIMARY KEY,
  bunny_video_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text NULL,
  status text NOT NULL DEFAULT 'pending',
  CONSTRAINT edit_staging_gc_outbox_status_check CHECK (
    status IN ('pending', 'dead')
  ),
  CONSTRAINT edit_staging_gc_outbox_attempt_count_check CHECK (
    attempt_count >= 0
  )
);

COMMENT ON TABLE public.edit_staging_gc_outbox IS
  'Service-role Edit staging GC recovery queue. Rows inserted when post_media is atomically claimed/deleted; Bunny delete happens in Edge.';

COMMENT ON COLUMN public.edit_staging_gc_outbox.post_media_id IS
  'Former post_media.id (no FK — source row is deleted on claim).';

ALTER TABLE public.edit_staging_gc_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.edit_staging_gc_outbox FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Shared candidate predicate (documented once; duplicated in RPCs)
-- ---------------------------------------------------------------------------
-- pm.kind = 'video'
-- AND pm.post_id IS NULL
-- AND pm.sort_order = 0
-- AND pm.created_at < now() - interval '7 days'
-- AND pm.video_status IN ('pending','uploading','processing','ready','failed')
-- AND EXISTS (
--   SELECT 1 FROM public.posts p
--   WHERE p.id = pm.publish_post_id AND p.status = 'published'
-- )

-- ---------------------------------------------------------------------------
-- 3) count_edit_staging_gc_candidates — dry-run (no mutation)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_edit_staging_gc_candidates()
RETURNS TABLE (
  candidate_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT count(*)::bigint AS candidate_count
  FROM public.post_media pm
  WHERE pm.kind = 'video'
    AND pm.post_id IS NULL
    AND pm.sort_order = 0
    AND pm.created_at < now() - interval '7 days'
    AND pm.video_status IN (
      'pending',
      'uploading',
      'processing',
      'ready',
      'failed'
    )
    AND EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = pm.publish_post_id
        AND p.status = 'published'
    );
$function$;

COMMENT ON FUNCTION public.count_edit_staging_gc_candidates() IS
  'Service-role dry-run: count Edit staging GC candidates (7d+ slot-0 unattached on published post). No mutation.';

REVOKE ALL ON FUNCTION public.count_edit_staging_gc_candidates()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) claim_edit_staging_gc_batch — atomic DELETE + outbox insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_edit_staging_gc_batch(
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  post_media_id uuid,
  bunny_video_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer;
BEGIN
  v_limit := GREATEST(LEAST(COALESCE(p_limit, 10), 25), 1);

  RETURN QUERY
  WITH picked AS (
    SELECT pm.id
    FROM public.post_media pm
    WHERE pm.kind = 'video'
      AND pm.post_id IS NULL
      AND pm.sort_order = 0
      AND pm.created_at < now() - interval '7 days'
      AND pm.video_status IN (
        'pending',
        'uploading',
        'processing',
        'ready',
        'failed'
      )
      AND EXISTS (
        SELECT 1
        FROM public.posts p
        WHERE p.id = pm.publish_post_id
          AND p.status = 'published'
      )
    ORDER BY pm.created_at ASC
    LIMIT v_limit
    FOR UPDATE OF pm SKIP LOCKED
  ),
  deleted AS (
    DELETE FROM public.post_media pm
    USING picked
    WHERE pm.id = picked.id
      AND pm.post_id IS NULL
      AND pm.sort_order = 0
      AND pm.kind = 'video'
    RETURNING pm.id, pm.bunny_video_id
  ),
  inserted AS (
    INSERT INTO public.edit_staging_gc_outbox (
      post_media_id,
      bunny_video_id,
      claimed_at,
      attempt_count,
      last_error,
      status
    )
    SELECT
      d.id,
      d.bunny_video_id,
      now(),
      0,
      NULL,
      'pending'
    FROM deleted d
    RETURNING
      edit_staging_gc_outbox.post_media_id,
      edit_staging_gc_outbox.bunny_video_id
  )
  SELECT i.post_media_id, i.bunny_video_id
  FROM inserted i;
END;
$function$;

COMMENT ON FUNCTION public.claim_edit_staging_gc_batch(integer) IS
  'Service-role: claim Edit staging GC candidates with FOR UPDATE SKIP LOCKED; DELETE post_media + INSERT outbox atomically. Hard-cap limit 25. No Bunny work.';

REVOKE ALL ON FUNCTION public.claim_edit_staging_gc_batch(integer)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) finish_edit_staging_gc_item
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finish_edit_staging_gc_item(
  p_post_media_id uuid,
  p_outcome text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_outcome text := lower(btrim(COALESCE(p_outcome, '')));
  v_err text := left(NULLIF(btrim(COALESCE(p_error, '')), ''), 240);
  v_attempts integer;
BEGIN
  IF p_post_media_id IS NULL THEN
    RAISE EXCEPTION 'Missing post_media_id'
      USING ERRCODE = '22023';
  END IF;

  IF v_outcome NOT IN (
    'deleted',
    'already_missing',
    'retryable_failed',
    'dead'
  ) THEN
    RAISE EXCEPTION 'Invalid edit_staging_gc finish outcome: %', p_outcome
      USING ERRCODE = '22023';
  END IF;

  IF v_outcome IN ('deleted', 'already_missing') THEN
    DELETE FROM public.edit_staging_gc_outbox o
    WHERE o.post_media_id = p_post_media_id;
    RETURN;
  END IF;

  IF v_outcome = 'dead' THEN
    UPDATE public.edit_staging_gc_outbox o
    SET
      status = 'dead',
      last_error = COALESCE(v_err, o.last_error),
      attempt_count = GREATEST(o.attempt_count, 5)
    WHERE o.post_media_id = p_post_media_id;
    RETURN;
  END IF;

  -- retryable_failed
  UPDATE public.edit_staging_gc_outbox o
  SET
    attempt_count = o.attempt_count + 1,
    last_error = v_err,
    status = CASE
      WHEN o.attempt_count + 1 >= 5 THEN 'dead'
      ELSE 'pending'
    END
  WHERE o.post_media_id = p_post_media_id
    AND o.status = 'pending'
  RETURNING o.attempt_count INTO v_attempts;

  -- No-op if missing or already dead (idempotent finish).
END;
$function$;

COMMENT ON FUNCTION public.finish_edit_staging_gc_item(uuid, text, text) IS
  'Service-role: finalize Edit staging GC outbox item after Bunny delete attempt. deleted/already_missing remove row; retryable_failed increments attempts (dead at 5).';

REVOKE ALL ON FUNCTION public.finish_edit_staging_gc_item(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
