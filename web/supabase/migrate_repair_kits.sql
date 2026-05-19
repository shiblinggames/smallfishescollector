-- Ship Repair Kits: per-battle consumable healing. Everyone starts with
-- the Basic Repair Kit (1-10 heal, Fortune scales the max). Upgrades
-- come later. Stored separately from raid_items because kits are
-- single-equip + consumed-per-battle, while raid_items are passive
-- multi-slot. Existing rows backfill to the basic kit.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipped_repair_kit text NOT NULL DEFAULT 'basic_repair_kit',
  ADD COLUMN IF NOT EXISTS owned_repair_kits text[] NOT NULL DEFAULT ARRAY['basic_repair_kit'];

UPDATE public.profiles
SET owned_repair_kits = ARRAY['basic_repair_kit']
WHERE owned_repair_kits IS NULL OR NOT ('basic_repair_kit' = ANY(owned_repair_kits));

UPDATE public.profiles
SET equipped_repair_kit = 'basic_repair_kit'
WHERE equipped_repair_kit IS NULL;
