-- RSVP write retirement (LOCAL ONLY — do not apply to production until explicitly approved).
-- Project: otfbgcvxevwtybfltvuf
--
-- Verified live baseline (read-only catalog):
--   authenticated: SELECT, INSERT, UPDATE, DELETE on public.rsvp_responses
--   anon: SELECT only (unchanged here)
--   notify_rsvp() is SECURITY DEFINER with search_path public, pg_temp
--   trigger_notify_rsvp stays attached (AFTER INSERT OR UPDATE)
--   invitation accept/decline uses invite_status_notification_trigger
--     -> create_invite_status_notification() and is not modified here
--
-- A: revoke authenticated writes; preserve SELECT.
-- B: no-op notify_rsvp so a privileged writer cannot create Going notifications.
-- Does not delete rows, drop columns/tables/triggers, or change RLS / read RPCs.

REVOKE INSERT, UPDATE, DELETE ON public.rsvp_responses FROM authenticated;

CREATE OR REPLACE FUNCTION public.notify_rsvp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;
