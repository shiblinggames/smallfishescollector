-- Crew Hall start level is stamped on each board row AT ROLL TIME, so
-- upgrading the hall mid-board doesn't retroactively level the candidates
-- currently on display — only the next roll benefits. recruitCrew seeds
-- user_crew.xp from this column instead of the live profile tier.
-- Applied to the live project 2026-06-10.
alter table public.daily_recruits add column if not exists start_xp int not null default 0;

-- One-time backfill: boards live at apply time were rolled under the
-- owner's current tier, so stamp them with its seed (values are
-- XP_TABLE[startLevel-1] from lib/crewLevel: Lv3=745, Lv5=1670, Lv7=2775,
-- Lv10=4770).
update public.daily_recruits dr
set start_xp = case p.crew_hall_tier
  when 2 then 745
  when 3 then 1670
  when 4 then 2775
  when 5 then 4770
  else 0 end
from public.profiles p
where p.id = dr.user_id and coalesce(p.crew_hall_tier, 1) > 1;
