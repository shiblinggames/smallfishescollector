-- fish_collection is a PRESTIGE-CYCLE log. Prestiging a zone deletes its
-- non-golden rows on purpose: re-collecting the zone is the whole loop, and
-- the zone selector's "24 of 31 logged" has to mean this cycle.
--
-- The Angler's Almanac is the opposite. It is the lifetime book, and a career
-- should not shorten because you did the thing the game asked you to do. So it
-- gets its own table that nothing ever deletes.
--
-- Backfilled from the current fish_collection below. For anyone who had
-- already prestiged before this shipped, the catches wiped in those cycles are
-- gone from the database entirely and cannot be recovered; this is the best
-- available starting point, and nothing is lost from here on.
--
-- Applied 2026-08-06.

create table if not exists public.fish_lifetime (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  fish_id         integer not null,
  catches         integer not null default 0,
  first_caught_at timestamptz,
  last_caught_at  timestamptz,
  primary key (user_id, fish_id)
);

create index if not exists fish_lifetime_user_idx on public.fish_lifetime(user_id);

alter table public.fish_lifetime enable row level security;

drop policy if exists "own lifetime record" on public.fish_lifetime;
create policy "own lifetime record" on public.fish_lifetime
  for select using (auth.uid() = user_id);

create or replace function public.bump_fish_lifetime(
  uid uuid, fid integer, n integer, at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into fish_lifetime (user_id, fish_id, catches, first_caught_at, last_caught_at)
  values (uid, fid, n, at, at)
  on conflict (user_id, fish_id) do update
    set catches        = fish_lifetime.catches + excluded.catches,
        first_caught_at = least(coalesce(fish_lifetime.first_caught_at, excluded.first_caught_at), excluded.first_caught_at),
        last_caught_at  = greatest(coalesce(fish_lifetime.last_caught_at, excluded.last_caught_at), excluded.last_caught_at);
end $$;

revoke all on function public.bump_fish_lifetime(uuid, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.bump_fish_lifetime(uuid, integer, integer, timestamptz) to service_role;

insert into public.fish_lifetime (user_id, fish_id, catches, first_caught_at, last_caught_at)
select user_id, fish_id, coalesce(catch_count, 0), first_caught_at, last_caught_at
from public.fish_collection
on conflict (user_id, fish_id) do nothing;
