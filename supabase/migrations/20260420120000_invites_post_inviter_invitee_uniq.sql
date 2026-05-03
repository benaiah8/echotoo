-- Multi-inviter model: one invite row per (post, inviter, invitee).
-- Drops the old (post, invitee)-only unique and the redundant author-gated INSERT policy.
-- "Inviters can create invites" remains the sole INSERT path (verifies live: inviter = auth, no author check).

-- 1) New uniqueness (add before dropping old: existing rows satisfy both when data is clean)
ALTER TABLE public.invites
  ADD CONSTRAINT invites_post_id_inviter_id_invitee_id_key
  UNIQUE (post_id, inviter_id, invitee_id);

-- 2) Old constraint name verified on live DB
ALTER TABLE public.invites
  DROP CONSTRAINT invites_post_id_invitee_id_key;

-- 3) Stricter author-only policy name verified on live DB; broader "Inviters can create invites" kept
DROP POLICY IF EXISTS "Allow authenticated users to create invites" ON public.invites;
