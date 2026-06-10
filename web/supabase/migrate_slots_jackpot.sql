-- Global progressive jackpot for Fish Slots (applied 2026-06-10 as
-- migration slots_global_jackpot). Single-row table: every spin feeds
-- the pot, a natural 3-catfish spin claims a share proportional to
-- wager / max bet, and the pot never resets below seed.

create table public.slots_jackpot (
  id int primary key default 1 check (id = 1),
  pot int not null default 5000,
  seed int not null default 5000,
  last_winner_id uuid references public.profiles(id),
  last_winner_name text,
  last_win_amount int,
  last_won_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.slots_jackpot (id) values (1);

create index slots_jackpot_last_winner_id_idx on public.slots_jackpot (last_winner_id);

alter table public.slots_jackpot enable row level security;

-- Pot is public game state — any signed-in player can watch it grow.
-- No insert/update/delete policies: only the service role mutates it.
create policy "Authenticated players can view the jackpot"
  on public.slots_jackpot for select
  to authenticated
  using (true);

-- Feed: atomic increment, returns the new pot for display.
create or replace function public.slots_feed_jackpot(p_amount int)
returns int
language sql
security definer
set search_path = ''
as $$
  update public.slots_jackpot
  set pot = pot + greatest(coalesce(p_amount, 0), 0),
      updated_at = now()
  where id = 1
  returning pot;
$$;

-- Claim: atomic share-take. All SET expressions read the OLD row, so
-- share and the new pot are computed from the same snapshot; the row
-- lock means two simultaneous winners can't double-claim — the second
-- claims from the already-reduced pot.
create or replace function public.slots_claim_jackpot(
  p_user_id uuid,
  p_winner_name text,
  p_wager int,
  p_max_bet int
)
returns table(share int, new_pot int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share int;
  v_new int;
begin
  if p_max_bet is null or p_max_bet <= 0 then
    raise exception 'invalid max bet';
  end if;

  update public.slots_jackpot
  set last_win_amount = floor(pot * least(greatest(coalesce(p_wager, 0), 0), p_max_bet)::numeric / p_max_bet)::int,
      pot = greatest(seed, pot - floor(pot * least(greatest(coalesce(p_wager, 0), 0), p_max_bet)::numeric / p_max_bet)::int),
      last_winner_id = p_user_id,
      last_winner_name = p_winner_name,
      last_won_at = now(),
      updated_at = now()
  where id = 1
  returning last_win_amount, pot into v_share, v_new;

  return query select v_share, v_new;
end;
$$;

-- Service-role-only per security posture: these mutate global state and
-- take a user_id; clients must never call them directly.
revoke all on function public.slots_feed_jackpot(int) from public, anon, authenticated;
grant execute on function public.slots_feed_jackpot(int) to service_role;
revoke all on function public.slots_claim_jackpot(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.slots_claim_jackpot(uuid, text, int, int) to service_role;
