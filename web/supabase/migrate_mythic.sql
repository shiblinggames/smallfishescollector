-- Run this in Supabase SQL editor

-- 1. Allow fractional drop weights
alter table card_variants
  alter column drop_weight type numeric using drop_weight::numeric;

-- 2. Catfish and Doby Mick are 10× rarer than other cards at every rarity tier
update card_variants
set drop_weight = drop_weight * 0.1
where card_id in (select id from cards where name in ('Catfish', 'Doby Mick'));

-- 3. Mythic variants for tier 3 cards only (10 cards × 5 editions = 50 rows)
insert into card_variants (card_id, variant_name, border_style, art_effect, drop_weight)
select c.id, m.variant_name, m.border_style, m.art_effect, m.drop_weight
from cards c
cross join (values
  ('Kraken Edition', 'kraken',     'kraken',     0.2),
  ('Davy Jones',     'davy-jones', 'davy-jones', 0.2),
  ('Golden Age',     'golden-age', 'golden-age', 0.2),
  ('Storm',          'storm',      'storm',       0.2),
  ('Wanted',         'wanted',     'wanted',      0.2)
) as m(variant_name, border_style, art_effect, drop_weight)
where c.tier = 3;
