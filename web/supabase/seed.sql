-- Run this after schema.sql

insert into cards (id, name, slug, filename, tier) values
  (1,  'Bass',              'Bass',              'Bass.png',              1),
  (2,  'Eel',               'Eel',               'Eel.png',               1),
  (3,  'Flounder',          'Flounder',          'Flounder.png',          1),
  (4,  'Goldfish',          'Goldfish',          'Goldfish.png',          1),
  (5,  'Krill',             'Krill',             'Krill.png',             1),
  (6,  'Minnow',            'Minnow',            'Minnow.png',            1),
  (7,  'Piranha',           'Piranha',           'Piranha.png',           2),
  (8,  'Pufferfish',        'Pufferfish',        'Pufferfish.png',        1),
  (9,  'Red Snapper',       'Red_Snapper',       'Red_Snapper.png',       2),
  (10, 'Salmon',            'Salmon',            'Salmon.png',            1),
  (11, 'Sardine',           'Sardine',           'Sardine.png',           2),
  (12, 'Tuna',              'Tuna',              'Tuna.png',              1),
  (13, 'Angelfish',         'Angelfish',         'Angelfish.png',         2),
  (14, 'Anglerfish',        'Anglerfish',        'Anglerfish.png',        2),
  (15, 'Beluga Whale',      'Beluga_Whale',      'Beluga_Whale.png',      2),
  (16, 'Blobfish',          'Blobfish',          'Blobfish.png',          2),
  (17, 'Blue Marlin',       'Blue_Marlin',       'Blue_Marlin.png',       2),
  (18, 'Clownfish',         'Clownfish',         'Clownfish.png',         2),
  (19, 'Goblin Shark',      'Goblin_Shark',      'Goblin_Shark.png',      2),
  (20, 'Koi',               'Koi',               'Koi.png',               2),
  (21, 'Lionfish',          'Lionfish',          'Lionfish.png',          2),
  (22, 'Nurse Shark',       'Nurse_Shark',       'Nurse_Shark.png',       2),
  (23, 'Oarfish',           'Oarfish',           'Oarfish.png',           2),
  (24, 'Sailfish',          'Sailfish',          'Sailfish.png',          2),
  (25, 'Swordfish',         'Swordfish',         'Swordfish.png',         2),
  (26, 'Tiger Shark',       'Tiger_Shark',       'Tiger_Shark.png',       2),
  (27, 'Blue Whale',        'Blue_Whale',        'Blue_Whale.png',        3),
  (28, 'Catfish',           'Catfish',           'Catfish.png',           3),
  (29, 'Doby Mick',         'Doby_Mick',         'Doby_Mick.png',         3),
  (30, 'Giant Squid',       'Giant_Squid',       'Giant_Squid.png',       3),
  (31, 'Great White Shark', 'Great_White_Shark', 'Great_White_Shark.png', 3),
  (32, 'Hammerhead Shark',  'Hammerhead_Shark',  'Hammerhead_Shark.png',  3),
  (33, 'Humpback Whale',    'Humpback_Whale',    'Humpback_Whale.png',    3),
  (34, 'Manta Ray',         'Manta_Ray',         'Manta_Ray.png',         3),
  (35, 'Orca',              'Orca',              'Orca.png',              3),
  (36, 'Whale Shark',       'Whale_Shark',       'Whale_Shark.png',       3)
on conflict (id) do nothing;

-- 4 variants per card
insert into card_variants (card_id, rarity, drop_weight)
select id, unnest(array['common','rare','epic','legendary']),
       unnest(array[60, 25, 12, 3])
from cards
on conflict do nothing;

-- Test redemption codes
insert into redemption_codes (code) values
  ('FISH-DEMO1'), ('FISH-DEMO2'), ('FISH-DEMO3'), ('FISH-DEMO4'), ('FISH-DEMO5')
on conflict (code) do nothing;
