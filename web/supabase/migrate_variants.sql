-- Run this in Supabase SQL editor

-- Clear dependent data first
delete from user_collection;

alter table card_variants drop column rarity;
alter table card_variants drop column drop_weight;
alter table card_variants add column variant_name text not null default '';
alter table card_variants add column border_style text not null default '';
alter table card_variants add column art_effect   text not null default '';
alter table card_variants add column drop_weight  int  not null default 1;

delete from card_variants;

insert into card_variants (card_id, variant_name, border_style, art_effect, drop_weight)
select
  c.id,
  v.variant_name,
  v.border_style,
  v.art_effect,
  v.drop_weight
from cards c
cross join (values
  ('Standard',    'standard',  'normal',       50),
  ('Silver',      'silver',    'normal',       25),
  ('Gold',        'gold',      'normal',       12),
  ('Holographic', 'gold',      'holographic',   6),
  ('Ghost',       'silver',    'ghost',         4),
  ('Shadow',      'void',      'shadow',        2),
  ('Prismatic',   'prismatic', 'rainbow',       1)
) as v(variant_name, border_style, art_effect, drop_weight);
