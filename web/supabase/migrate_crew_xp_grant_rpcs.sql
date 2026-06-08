-- Crew XP grant RPCs. Atomic UPDATEs returning old/new XP so server actions
-- can compute level-up deltas for the end-of-mission UI without a follow-up
-- read. Service-role only (revoked from anon/authenticated) — per the
-- security-posture convention, any RPC that takes a user_id parameter must
-- be unreachable from the public PostgREST surface.
--
-- Both functions intentionally skip dead crew (died_at IS NOT NULL) so a
-- crew member who fell mid-raid would NOT pick up post-death XP if their
-- row was already soft-deleted.
--
-- grant_crew_xp_to_assigned: used by awardRaidKill + awardPracticeKill — bumps
-- every alive crew currently in a ship slot. Mirrors the player rule:
-- "everyone on this raid gets the same kill XP the player just earned."
--
-- grant_crew_xp_to_ids: used by revealVoyageResults — bumps the explicit set
-- of surviving crew ids (voyage.crew_variant_ids minus voyage.crew_lost).

CREATE OR REPLACE FUNCTION public.grant_crew_xp_to_assigned(uid uuid, grant_xp int)
RETURNS TABLE(id bigint, old_xp int, new_xp int)
LANGUAGE sql
AS $$
  UPDATE public.user_crew
  SET xp = xp + grant_xp
  WHERE user_id = uid AND died_at IS NULL AND assigned_slot IS NOT NULL
  RETURNING user_crew.id::bigint, (user_crew.xp - grant_xp)::int AS old_xp, user_crew.xp::int AS new_xp
$$;

REVOKE EXECUTE ON FUNCTION public.grant_crew_xp_to_assigned(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_crew_xp_to_assigned(uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_crew_xp_to_ids(uid uuid, crew_ids bigint[], grant_xp int)
RETURNS TABLE(id bigint, old_xp int, new_xp int)
LANGUAGE sql
AS $$
  UPDATE public.user_crew
  SET xp = xp + grant_xp
  WHERE user_id = uid AND died_at IS NULL AND id = ANY(crew_ids)
  RETURNING user_crew.id::bigint, (user_crew.xp - grant_xp)::int AS old_xp, user_crew.xp::int AS new_xp
$$;

REVOKE EXECUTE ON FUNCTION public.grant_crew_xp_to_ids(uuid, bigint[], int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_crew_xp_to_ids(uuid, bigint[], int) TO service_role;
