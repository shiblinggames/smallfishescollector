-- The Exchange, part two: funds, positions, and settlement.
--
-- A contract is NOT a share. Nothing here touches fish_inventory, the hold or
-- the selling lanes. You stake doubloons on a direction over a term; at expiry
-- the contract settles ITSELF and either pays out or expires worthless.
--
-- Applied 2026-08-06.

-- ── FUNDS ───────────────────────────────────────────────────────────────────
-- Membership is defined HERE and nowhere else. It briefly lived in
-- lib/fishExchange.ts as predicates too, which would have let settlement and
-- the board disagree about what is in an index: the one class of bug in a money
-- system that nobody notices until it pays somebody the wrong amount.
--
-- Verified partition: the five habitat funds sum to 146, the three rarity funds
-- sum to 146, and the Sea Index holds 146.
create or replace view public.exchange_fund_members as
  select f.fund_id, s.id as fish_id
  from public.fish_species s
  cross join lateral (values
    ('sea'),
    (case when s.habitat = 'shallows'     then 'shallows'     end),
    (case when s.habitat = 'open_waters'  then 'open_waters'  end),
    (case when s.habitat = 'deep'         then 'deep'         end),
    (case when s.habitat = 'abyss'        then 'abyss'        end),
    (case when s.habitat = 'ancient_deep' then 'ancient_deep' end),
    (case when s.bite_rarity <= 2         then 'common'       end),
    (case when s.bite_rarity  = 3         then 'rare'         end),
    (case when s.bite_rarity >= 4         then 'legendary'    end)
  ) as f(fund_id)
  where f.fund_id is not null
    and not (s.habitat = 'ancient_deep' and s.sell_value = 0);

create table if not exists public.exchange_funds (
  fund_id     text primary key,
  price       numeric(6,3) not null default 1.000,
  prev_price  numeric(6,3) not null default 1.000,
  members     integer not null default 0,
  history     jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.exchange_funds enable row level security;
drop policy if exists "funds are public" on public.exchange_funds;
create policy "funds are public" on public.exchange_funds for select using (true);

insert into public.exchange_funds (fund_id, members)
select fund_id, count(*) from public.exchange_fund_members group by fund_id
on conflict (fund_id) do update set members = excluded.members;

-- ── POSITIONS ───────────────────────────────────────────────────────────────
create table if not exists public.exchange_positions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  fund_id       text    references public.exchange_funds(fund_id),
  fish_id       integer references public.fish_species(id),
  direction     text    not null check (direction in ('rise','fall')),
  term          integer not null check (term in (6,24,72)),
  stake         integer not null check (stake > 0),
  -- LOCKED AT OPEN. Retuning the payout tables must never change what a
  -- contract already sold to a player is worth.
  leverage      numeric(8,4) not null check (leverage > 0),
  entry_price   numeric(6,3) not null,
  open_cycle    bigint  not null,
  expiry_cycle  bigint  not null,
  status        text    not null default 'open' check (status in ('open','settled','closed_early')),
  exit_price    numeric(6,3),
  payout        integer,
  settled_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint one_instrument check ((fund_id is null) <> (fish_id is null))
);
create index if not exists exchange_positions_user_idx on public.exchange_positions(user_id, status);
create index if not exists exchange_positions_due_idx on public.exchange_positions(expiry_cycle) where status = 'open';
alter table public.exchange_positions enable row level security;
drop policy if exists "own positions" on public.exchange_positions;
create policy "own positions" on public.exchange_positions for select using (auth.uid() = user_id);

-- ── FUND PRICES ─────────────────────────────────────────────────────────────
-- The unweighted mean of the members, recomputed every tick. This is why a fund
-- barely moves next to any one of its fish: idiosyncratic noise cancels and
-- only the shared mood survives.
create or replace function public.update_exchange_funds()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_hist jsonb;
begin
  for r in
    select ef.fund_id, ef.price as old_price, ef.history,
           avg(fe.price) as new_price, count(*) as n
      from exchange_funds ef
      join exchange_fund_members m on m.fund_id = ef.fund_id
      join fish_exchange fe on fe.fish_id = m.fish_id
     group by ef.fund_id, ef.price, ef.history
  loop
    v_hist := r.history || to_jsonb(round(r.old_price, 3));
    if jsonb_array_length(v_hist) > 24 then
      v_hist := (select jsonb_agg(elem order by ord) from (
        select elem, ord from jsonb_array_elements(v_hist) with ordinality as t(elem, ord)
        order by ord desc limit 24
      ) sub);
    end if;
    update exchange_funds set
      prev_price = price, price = round(r.new_price, 3),
      members = r.n, history = v_hist, updated_at = now()
    where fund_id = r.fund_id;
  end loop;
end $$;

-- ── SETTLEMENT ──────────────────────────────────────────────────────────────
-- Contracts settle THEMSELVES. Nothing here needs the player online, so a week
-- away settles a week of contracts the moment the cron next runs, and a
-- contract expiring worthless always means the market went against you rather
-- than that you were not looking.
--
-- Exactly-once comes from the guarded UPDATE at the top of the loop: claim the
-- row `where status = 'open'`, and if another settler got there first, skip it.
-- The credit sits in the same transaction as the status flip. Tested with three
-- settlement passes back to back: two ledger rows, never three.
create or replace function public.settle_exchange_contracts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle bigint; p record; v_exit numeric; v_move numeric; v_your numeric;
  v_payout integer; v_count integer := 0;
begin
  select exchange_cycle into v_cycle from market_state where id = 1;
  for p in
    select id from exchange_positions
     where status = 'open' and expiry_cycle <= v_cycle
     order by id limit 5000
  loop
    update exchange_positions set status = 'settled', settled_at = now()
     where id = p.id and status = 'open';
    if not found then continue; end if;

    declare pos exchange_positions%rowtype;
    begin
      select * into pos from exchange_positions where id = p.id;
      if pos.fund_id is not null then
        select price into v_exit from exchange_funds where fund_id = pos.fund_id;
      else
        select price into v_exit from fish_exchange where fish_id = pos.fish_id;
      end if;
      v_move := ((v_exit - pos.entry_price) / pos.entry_price) * 100;
      v_your := case when pos.direction = 'rise' then v_move else -v_move end;
      v_payout := case when v_your <= 0 then 0
                       else greatest(0, round(pos.stake * pos.leverage * v_your)) end;
      update exchange_positions set exit_price = round(v_exit, 3), payout = v_payout where id = pos.id;
      if v_payout > 0 then
        update profiles set doubloons = doubloons + v_payout where id = pos.user_id;
        insert into doubloon_transactions (user_id, amount, reason)
        values (pos.user_id, v_payout, 'Exchange contract settled');
      end if;
      v_count := v_count + 1;
    end;
  end loop;
  return v_count;
end $$;

revoke all on function public.update_exchange_funds() from public, anon, authenticated;
revoke all on function public.settle_exchange_contracts() from public, anon, authenticated;
grant execute on function public.update_exchange_funds() to service_role;
grant execute on function public.settle_exchange_contracts() to service_role;

-- Funds tick WITH the fish; settlement runs two minutes later so it can never
-- read prices from the cycle before. Two jobs on '0 * * * *' have no guaranteed
-- order between them.
--   select cron.schedule('exchange-funds-tick', '0 * * * *', 'SELECT update_exchange_funds()');
--   select cron.schedule('exchange-settle',     '2 * * * *', 'SELECT settle_exchange_contracts()');

-- A contract settles while you are away, which is the point. Without a flag for
-- "you have seen this result" the payout is silent. Deliberately NOT mail: a
-- player holding six contracts would get six letters an hour.
alter table public.exchange_positions
  add column if not exists seen boolean not null default false;
create index if not exists exchange_positions_unseen_idx
  on public.exchange_positions(user_id) where status <> 'open' and seen = false;
