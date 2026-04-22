-- Run this in Supabase SQL editor

create table if not exists prize_claims (
  id              serial primary key,
  user_id         uuid references profiles(id),
  prize_code      text unique not null,
  card_variant_id int references card_variants(id),
  card_name       text not null,
  variant_name    text not null,
  claimed_at      timestamptz default now(),
  fulfilled       boolean default false
);

alter table prize_claims enable row level security;

create policy "prize_claims own read"   on prize_claims for select using (auth.uid() = user_id);
create policy "prize_claims own insert" on prize_claims for insert with check (auth.uid() = user_id);
