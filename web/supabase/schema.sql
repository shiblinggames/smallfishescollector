-- Run this in Supabase SQL editor

create table if not exists cards (
  id serial primary key,
  name text not null,
  slug text unique not null,
  filename text not null,
  tier int not null check (tier in (1,2,3)),
  created_at timestamptz default now()
);

create table if not exists card_variants (
  id serial primary key,
  card_id int references cards(id),
  rarity text not null check (rarity in ('common','rare','epic','legendary')),
  drop_weight int not null
);

create table if not exists profiles (
  id uuid references auth.users primary key,
  username text,
  packs_available int default 0,
  created_at timestamptz default now()
);

create table if not exists redemption_codes (
  id serial primary key,
  code text unique not null,
  redeemed_by uuid references profiles(id),
  redeemed_at timestamptz,
  packs_granted int default 1
);

create table if not exists user_collection (
  id serial primary key,
  user_id uuid references profiles(id),
  card_variant_id int references card_variants(id),
  obtained_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- RLS
alter table profiles enable row level security;
alter table redemption_codes enable row level security;
alter table user_collection enable row level security;
alter table cards enable row level security;
alter table card_variants enable row level security;

-- Cards/variants are public read
create policy "cards public read" on cards for select using (true);
create policy "card_variants public read" on card_variants for select using (true);

-- Profiles: users can read/update their own
create policy "profiles own read" on profiles for select using (auth.uid() = id);
create policy "profiles own update" on profiles for update using (auth.uid() = id);

-- Redemption codes: authenticated users can read (needed to check code)
create policy "redemption_codes authenticated read" on redemption_codes
  for select using (auth.role() = 'authenticated');
create policy "redemption_codes own update" on redemption_codes
  for update using (auth.uid() = redeemed_by or redeemed_by is null);

-- User collection: users manage their own
create policy "collection own read" on user_collection for select using (auth.uid() = user_id);
create policy "collection own insert" on user_collection for insert with check (auth.uid() = user_id);
