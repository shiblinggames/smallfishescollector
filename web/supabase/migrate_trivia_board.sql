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
