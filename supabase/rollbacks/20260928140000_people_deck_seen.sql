-- ROLLBACK for 20260928140000_people_deck_seen
-- Removes ONLY objects introduced by that migration.
-- Do not run unless rolling back an applied people_deck_seen migration.

DROP FUNCTION IF EXISTS public.mark_people_deck_seen(text, uuid[]);
DROP FUNCTION IF EXISTS public.get_people_deck_seen(text);
DROP TABLE IF EXISTS public.people_deck_seen;
