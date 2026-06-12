-- Trivia Night: The Captain's Board (applied to prod 2026-06-11 as
-- migration trivia_captains_board).
--
-- Daily Jeopardy-style board: 4 categories (FISH / DEEP / LORE /
-- CATCH) x 3 tiers (5 / 10 / 25 gems). Twelve questions are generated
-- nightly by Claude on the midnight cron (trivia/board/generate.ts)
-- and cached here; the board jsonb INCLUDES correct_index +
-- explanation, so trivia_boards is service-role only (RLS enabled,
-- zero policies, same posture as the other server-only tables).
-- Clients only ever see a stripped payload from the server action.

create table public.trivia_boards (
  date date primary key,
  board jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.trivia_boards enable row level security;

-- One attempt row per player per day. answers jsonb maps tile key
-- ("FISH-1") -> { chosen, correct }. All writes go through the
-- service-role server action; players may read their own row.
create table public.trivia_board_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  answers jsonb not null default '{}'::jsonb,
  gems_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.trivia_board_attempts enable row level security;

create policy "Users can read own trivia attempts"
  on public.trivia_board_attempts for select
  using (auth.uid() = user_id);

-- Retired the same day (tables left dormant, no DDL): Fish of the Day
-- (daily_fish_generated / daily_fish_attempts / profiles fotd_* cols)
-- and the orphaned daily quiz (daily_quiz / quiz_answers).

-- ── Phase 2: Pirate King (applied to prod 2026-06-11 as migration
-- trivia_pirate_king) ────────────────────────────────────────────────
-- Millionaire-style ladder: ten questions in ascending difficulty,
-- prizes 5 -> 250 gems, safe havens at rungs 4 and 7, one 50/50
-- lifeline, one run per player per day. Ladder jsonb includes
-- correct_index + explanation, so trivia_ladders is service-role only
-- (same posture as trivia_boards).

create table public.trivia_ladders (
  date date primary key,
  ladder jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.trivia_ladders enable row level security;

-- rung = questions answered correctly so far (0-10); status: active |
-- walked | busted | crowned. fifty jsonb = { rung, removed: [i, j] }
-- once the lifeline is spent, so a reload can't re-roll it.
create table public.trivia_ladder_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  rung integer not null default 0,
  status text not null default 'active' check (status in ('active', 'walked', 'busted', 'crowned')),
  fifty jsonb,
  gems_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.trivia_ladder_attempts enable row level security;

create policy "Users can read own ladder attempts"
  on public.trivia_ladder_attempts for select
  using (auth.uid() = user_id);
