-- ROLLBACK EVIDENCE for 20261030120000_group_active_member_cap_200
-- Captured from production preflight 2026-09-27 (otfbgcvxevwtybfltvuf).
--
-- To rollback after apply: restore CREATE OR REPLACE bodies with
--   c_max_active_members integer := 100
-- and request_group_up:
--   IF v_member_count >= 100 THEN
--     RAISE EXCEPTION 'Group member limit is 100';
--
-- Preserve EXECUTE grants exactly (matches production preflight):
--   REVOKE ALL … FROM PUBLIC, anon;
--   GRANT EXECUTE … TO authenticated, postgres, service_role;
--
-- Prefer pg_get_functiondef taken immediately before apply if available.
-- Full prior bodies matched repo migrations:
--   create_group_conversation / add_conversation_members → 20260909120000_group_up_g0_foundation.sql
--   accept_group_up_request → 20260916120000_group_up_g3_accept_decline.sql
--   request_group_up → 20260915120100_group_up_g2_browse_requests.sql
-- (with live dissolve-aware _lock_group_conversation already in place).

-- Example grant restoration (run after restoring 100-cap function bodies):
REVOKE ALL ON FUNCTION public.create_group_conversation(text, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[])
  TO authenticated, postgres, service_role;

REVOKE ALL ON FUNCTION public.add_conversation_members(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_conversation_members(uuid, uuid[])
  TO authenticated, postgres, service_role;

REVOKE ALL ON FUNCTION public.accept_group_up_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_group_up_request(uuid)
  TO authenticated, postgres, service_role;

REVOKE ALL ON FUNCTION public.request_group_up(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_group_up(uuid)
  TO authenticated, postgres, service_role;

SELECT 'Restore prior 100-cap function definitions, then apply grants above.' AS rollback_instruction;
