-- The Angler's Almanac needs breakdowns the profile never kept: which crate
-- tiers were opened, which bait was burned, and the shape of selling.
--
-- These start at zero for everyone. The existing lifetime totals
-- (fishing_crates_opened, fish_sold_doubloons) are untouched and stay the
-- headline numbers, so nothing a player already earned appears to reset. The
-- Record room labels the new figures as counted-from-now rather than letting
-- them read as lifetime.
--
-- Applied 2026-08-06.

alter table profiles
  add column if not exists crate_opens      jsonb   not null default '{}'::jsonb,
  add column if not exists bait_used        jsonb   not null default '{}'::jsonb,
  add column if not exists biggest_fish_sale integer not null default 0,
  add column if not exists fish_sold_count   integer not null default 0;

-- Increment one key inside a jsonb counter map, atomically.
--
-- Unlike bump_profile_stat this takes an ALLOWLIST rather than any column
-- name. bump_profile_stat is only safe because profiles has RLS on with no
-- UPDATE policy; that is a property of another table's config holding up this
-- function's security, and it is not worth inheriting for a new one.
create or replace function public.bump_profile_json_counter(
  uid uuid, col text, key text, n integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if col not in ('crate_opens', 'bait_used') then
    raise exception 'bump_profile_json_counter: % is not a counter map', col;
  end if;
  if key is null or key = '' or length(key) > 40 then
    raise exception 'bump_profile_json_counter: bad key';
  end if;
  execute format(
    'update profiles set %I = jsonb_set(coalesce(%I, ''{}''::jsonb), array[$1], '
    || 'to_jsonb(coalesce((%I -> $1)::int, 0) + $2), true) where id = $3',
    col, col, col
  ) using key, n, uid;
end $$;

-- Raise a high-water mark, never lower it.
create or replace function public.bump_profile_max(
  uid uuid, col text, v integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if col not in ('biggest_fish_sale') then
    raise exception 'bump_profile_max: % is not a high-water column', col;
  end if;
  execute format('update profiles set %I = greatest(coalesce(%I, 0), $1) where id = $2', col, col)
    using v, uid;
end $$;

revoke all on function public.bump_profile_json_counter(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.bump_profile_max(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.bump_profile_json_counter(uuid, text, text, integer) to service_role;
grant execute on function public.bump_profile_max(uuid, text, integer) to service_role;
