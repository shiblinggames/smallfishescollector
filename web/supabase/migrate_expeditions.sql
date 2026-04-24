-- Daily AI-generated expedition content (one row per zone per day)
create table if not exists daily_expeditions (
  id serial primary key,
  expedition_date date not null,
  zone text not null check (zone in ('coral_run','bertuna_triangle','sunken_reach','davy_jones_locker')),
  event_sequence jsonb not null,
  unique(expedition_date, zone)
);

-- Player expedition runs (one row per player per zone per day)
create table if not exists expeditions (
  id serial primary key,
  user_id uuid references profiles(id) on delete cascade,
  zone text not null check (zone in ('coral_run','bertuna_triangle','sunken_reach','davy_jones_locker')),
  ship_tier int not null,
  status text default 'active' check (status in ('active','completed','failed')),
  current_node int default 0,
  events jsonb default '[]',
  crew_loadout jsonb not null default '{}',
  loot jsonb default '{}',
  hull_damage int default 0,
  expedition_date date not null default current_date,
  started_at timestamptz default now(),
  completed_at timestamptz,
  unique(user_id, zone, expedition_date)
);

-- RLS
alter table daily_expeditions enable row level security;
alter table expeditions enable row level security;

-- Anyone can read daily expedition content (it's shared narrative)
create policy "daily_expeditions_read" on daily_expeditions
  for select using (true);

-- Users can only see their own expedition runs
create policy "expeditions_user_read" on expeditions
  for select using (auth.uid() = user_id);
