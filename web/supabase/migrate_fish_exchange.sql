-- THE EXCHANGE. A price series for CONTRACTS, separate from fish_market.
--
-- fish_market decides what a caught fish SELLS for, and it deliberately pulls
-- every price back toward 1.00 at 8% of the gap per hour so a catch is worth
-- roughly what you expect. That drift makes speculation on it risk-free:
-- expected value is 1 + 0.92^hours * (entry - 1), so buying at 0.60 and waiting
-- 8 hours returns +33% with almost no variance. Contracts therefore cannot
-- trade on it, and the sell price cannot be allowed to move because somebody
-- took a position.
--
-- This engine walks in LOG space with SYMMETRIC bounds. That matters: the sell
-- market's bounds are 0.40 and 2.50 around a centre of 1.00, which is lopsided,
-- so a walk with no restoring force ratchets UPWARD off the near wall
-- (simulated: legendaries settle at a 1.40 mean, a permanent ~40% buff). In log
-- space +/- ln(2.5) is symmetric and there is no such bias.
--
-- theta 0.015 is a deliberately WEAK pull, a ~46 hour half life. Enough that an
-- instrument never parks at a wall and dies (simulated over 90 days: p01 0.62,
-- median 0.99, p99 1.59, below 0.45 for 0.01% of its life), and weak enough
-- that the predictable component over a short hold is smaller than the house
-- edge in the payout.
--
-- Applied 2026-08-06.

create table if not exists public.fish_exchange (
  fish_id     integer primary key references public.fish_species(id) on delete cascade,
  price       numeric(6,3) not null default 1.000,
  prev_price  numeric(6,3) not null default 1.000,
  history     jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.fish_exchange enable row level security;

drop policy if exists "exchange is public" on public.fish_exchange;
create policy "exchange is public" on public.fish_exchange for select using (true);

-- Positions record the cycle they opened on, and the term is counted against
-- this rather than a timestamp: a clock check would let someone open at 13:59
-- and expire at 14:01 having sat through exactly one price move.
alter table public.market_state
  add column if not exists exchange_cycle bigint not null default 0;

insert into public.fish_exchange (fish_id)
select s.id from public.fish_species s
where not (s.habitat = 'ancient_deep' and s.sell_value = 0)
on conflict (fish_id) do nothing;

create or replace function public.update_fish_exchange()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  BAND    constant double precision := ln(2.5);
  THETA   constant double precision := 0.015;
  v_bias  double precision;
  v_moodv double precision;
  v_mood  text;
  r       record;
  v_vol   double precision;
  v_lp    double precision;
  v_noise double precision;
  v_new   double precision;
  v_hist  jsonb;
begin
  -- Shares the sell market's WEATHER but not its prices: when the sea is in
  -- Bounty Season the board should be green too. Read only; the mood roll
  -- itself stays owned by update_fish_market.
  select mood, coalesce(mood_bias, 0) into v_mood, v_bias from market_state where id = 1;
  v_moodv := case v_mood
    when 'storm' then 1.5 when 'kraken' then 2.0
    when 'bounty_season' then 1.2 when 'cursed_waters' then 1.2
    else 1.0 end;
  -- Halved: the sell market applies its bias against a strong restoring force
  -- that erases it within hours. Here it would accumulate.
  v_bias := v_bias * 0.5;

  for r in
    select fe.fish_id, fe.price, fe.history, fs.bite_rarity
      from fish_exchange fe join fish_species fs on fs.id = fe.fish_id
  loop
    v_vol := case r.bite_rarity
      when 1 then 0.030 when 2 then 0.038 when 3 then 0.048
      when 4 then 0.060 else 0.075 end * v_moodv;

    v_lp := ln(greatest(0.001, r.price::double precision));
    v_noise := (random() + random() + random() - 1.5) * v_vol;
    v_lp := v_lp - THETA * v_lp + v_noise + v_bias;
    v_lp := greatest(-BAND, least(BAND, v_lp));
    v_new := exp(v_lp);

    v_hist := r.history || to_jsonb(round(r.price, 3));
    if jsonb_array_length(v_hist) > 24 then
      v_hist := (select jsonb_agg(elem order by ord) from (
        select elem, ord from jsonb_array_elements(v_hist) with ordinality as t(elem, ord)
        order by ord desc limit 24
      ) sub);
    end if;

    update fish_exchange set
      prev_price = price,
      price      = round(v_new::numeric, 3),
      history    = v_hist,
      updated_at = now()
    where fish_id = r.fish_id;
  end loop;

  update market_state set exchange_cycle = exchange_cycle + 1 where id = 1;
end $$;

revoke all on function public.update_fish_exchange() from public, anon, authenticated;
grant execute on function public.update_fish_exchange() to service_role;

-- Its OWN cron job, not appended to the market command: pg_cron runs a command
-- in one transaction, so an error in the exchange would roll back the sell
-- market tick alongside it.
--   select cron.schedule('fish-exchange-tick', '0 * * * *', 'SELECT update_fish_exchange()');
