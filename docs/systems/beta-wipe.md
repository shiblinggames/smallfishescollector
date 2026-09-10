# The beta wipe

How every playtest account gets taken back to a new player's on the day the beta
ends, and what was learned testing it.

Everyone who playtested knows a wipe is coming before full release. This is the
procedure for it.

## What a wipe is here

**Reset, not delete.** Deleting the profile row would be three lines and the
foreign keys would do all the work — nearly every user-scoped table cascades
from `profiles` or `auth.users`. It is still the wrong shape: it takes the auth
user with it, so a tester cannot log back into the account they have been using
for months, and it frees their username for somebody else to take.

So the row stays, every cascade is given up on purpose, and each of the sixty
user-scoped tables is cleared by hand.

### What survives

| Kept | Why |
| --- | --- |
| `id` | The account |
| `username` | Their name, and what other players know them by |
| `created_at` | When they joined, which is the whole point of the roster |
| `is_admin` | A grant from us, not something earned in game |
| `crew` + `sea_pacts` | Optional (`p_keep_social`, on by default). Carry no progress, and testers coming back to sail with the same people should not have to find each other again |
| `beta_roster` | The snapshot of who was here. Never wiped |

**Granted memberships do not survive.** Every Captain in the beta was granted
one rather than buying it, so nothing is owed by taking it back, and launching
with twenty-two accounts already on a tier nobody else can reach is worse than
launching with none.

## The pieces

All in `app_private`, all revoked from `anon` and `authenticated`, service role
only.

- **`beta_roster`** — a flat table, not a view: the point is to survive the
  tables it was read from being emptied. Holds each tester's headline numbers
  plus the whole profile row as `jsonb`, so a question nobody has thought of yet
  can still be answered.
- **`profile_reset_sets(keep)`** — builds the `SET` clause from the catalogue.
- **`wipe_account(user, keep_social)`** — one account.
- **`wipe_coverage()`** — every table keyed on a player that `wipe_account`
  never mentions.
- **`wipe_audit(user)`** — every row the database still holds against a player.

### Why the column reset is generated

`profiles` has 267 columns and gains more most weeks. A hand-written list would
be wrong within a fortnight and wrong *silently*, leaving a stray unlock or a
stale timer on a supposedly fresh account. So each column goes back to **the
default the schema already declares**, which is by definition what a new signup
gets, and anything added later is wiped by default rather than kept by
oversight.

`profile_reset_sets` is its own function because the catalogue produced two
surprises in a row, each of which aborted the whole wipe:

- **A NULL default.** About ninety columns are nullable with no declared
  default: a sea position, an equipped skin, a last-claim date. The catalogue
  answers `NULL`, which formatted into `col = ` and was a syntax error. `NULL`
  is the correct value for all of them, because "no value" *is* the new player's
  state.
- **A generated column.** `lifetime_species_count` is `GENERATED ALWAYS` and
  refuses any assignment but `DEFAULT`. Resetting the columns it derives from
  resets it for free.

There will be more. Keeping the rule in one small function means the next one
costs a line instead of re-sending a hundred and twenty lines of `DELETE`s that
have nothing to do with the problem.

### Why the deletes are written out

Sixty statements rather than a loop over a list. A list would make the *list*
the thing to audit; a statement you can read is the thing to audit.
`wipe_coverage()` closes the gap that creates, by asking the catalogue instead
of relying on anybody's memory.

It should return exactly five uncovered tables, all expected:

- `beta_roster` — must never be wiped
- `claim_tokens`, `redemption_codes`, `contests`, `slots_jackpot` — house
  records that merely happen to store a player id. Clearing them would rewrite
  history rather than reset an account.

Anything else in that list is a gap.

## THE FINDING: live sessions write straight back

Tested on `worldno1` (36,638 ⟡, 2,980 ◆, tier 4, granted Captain). The wipe
cleared 34 tables to zero and all 267 profile columns matched a brand new
signup, verified by diffing against `create temp table fresh (like profiles
including defaults)`.

**Seventeen seconds later the account was back on the chart at the exact
coordinates it had been wiped from.** The tester's tab was still open and the
sea heartbeat had written its position back.

Nothing was wrong with the wipe. A wipe is a snapshot and a live client is a
writer, and a writer that outlives the snapshot wins. The heartbeat is the
mildest case: an open tab can also finish a cast, claim a daily, or spend
doubloons the account no longer has, and the further through a wipe that lands
the stranger the result.

**So the fleet-wide wipe logs everyone out first, and the site goes into
maintenance before it runs.** An access token stays valid until it expires, so
clearing sessions is necessary but not on its own sufficient.

## Launch-day procedure

1. **Site into maintenance.** Not optional, see the finding above.
2. **Capture the roster.** The only step that cannot be redone later.
3. **Check coverage.** `select * from app_private.wipe_coverage() where not
   covered` should return the five known tables and nothing else.
4. **Snapshot a couple of accounts** with `wipe_audit`, so the result can be
   checked by subtraction.
5. **Run the wipe.**
6. **Verify** with `wipe_audit` and the `temp table fresh` diff.
7. **Maintenance off.**

### Step 2, the roster capture

```sql
insert into public.beta_roster (
  user_id, username, joined_at, last_active_at,
  fishing_xp, expedition_xp, badges, species, fish_caught,
  raids_cleared, gauntlet_deepest, was_premium, is_admin, snapshot
)
select p.id, p.username, p.created_at, p.last_active_at,
       p.fishing_xp, p.expedition_xp,
       coalesce(array_length(p.unlocked_badges, 1), 0),
       (select count(distinct fc.fish_id)::int from public.fish_collection fc where fc.user_id = p.id),
       (select coalesce(sum(fc.catch_count), 0)::int from public.fish_collection fc where fc.user_id = p.id),
       (select count(*)::int from public.raid_completions rc where rc.user_id = p.id),
       greatest(p.gauntlet_deepest, p.dons_gauntlet_deepest, p.gauntlet_hc_deepest),
       p.is_premium, p.is_admin,
       to_jsonb(p.*)
from public.profiles p
on conflict (user_id) do update set
  username = excluded.username, joined_at = excluded.joined_at,
  last_active_at = excluded.last_active_at, fishing_xp = excluded.fishing_xp,
  expedition_xp = excluded.expedition_xp, badges = excluded.badges,
  species = excluded.species, fish_caught = excluded.fish_caught,
  raids_cleared = excluded.raids_cleared, gauntlet_deepest = excluded.gauntlet_deepest,
  was_premium = excluded.was_premium, is_admin = excluded.is_admin,
  snapshot = excluded.snapshot, captured_at = now();
```

### Step 5, the fleet-wide wipe

**Not yet applied to the database.** It is written out here to be read before it
exists rather than found in the catalogue afterwards. Apply it on launch day,
deliberately.

It refuses to run without the exact phrase, and refuses to run at all if the
roster is missing or stale, because the roster is the one irreversible step and
so is checked rather than assumed.

```sql
create or replace function app_private.wipe_all_accounts(
  p_confirm text,
  p_keep_social boolean default true,
  -- Admins are wiped too by default: they play the same game, and a launch
  -- leaderboard topped by the developers is not a launch leaderboard.
  p_include_admins boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
  roster integer;
begin
  if p_confirm is distinct from 'WIPE THE BETA' then
    raise exception 'wipe_all_accounts: refused. Pass the exact phrase to confirm.';
  end if;

  -- The roster is the only part of this that cannot be redone later, so it is
  -- checked rather than assumed. Stop, rather than find out afterwards that
  -- nobody knows who playtested the game.
  select count(*) into roster from public.beta_roster;
  if roster = 0 then
    raise exception 'wipe_all_accounts: beta_roster is empty. Capture the cohort first.';
  end if;
  if roster < (select count(*) from public.profiles) then
    raise exception 'wipe_all_accounts: beta_roster holds % of % accounts. Re-run the capture.',
      roster, (select count(*) from public.profiles);
  end if;

  -- STOP THE WRITERS. Every open tab loses its session and cannot refresh into
  -- a new one. See the finding above.
  delete from auth.sessions;

  for r in
    select p.id from public.profiles p
     where p_include_admins or not p.is_admin
     order by p.created_at
  loop
    perform app_private.wipe_account(r.id, p_keep_social);
    n := n + 1;
  end loop;

  return jsonb_build_object(
    'wiped', n, 'roster_held', roster, 'kept_social', p_keep_social,
    'included_admins', p_include_admins, 'at', now()
  );
end;
$$;

revoke all on function app_private.wipe_all_accounts(text, boolean, boolean)
  from public, anon, authenticated;
```

Called as a single statement, so either every account resets or none does. A
wipe that stops half way leaves a game where some players kept their fleet and
the rest start at a rowboat, which is worse than either outcome and impossible
to tell apart from a wipe that finished.

```sql
select app_private.wipe_all_accounts('WIPE THE BETA');
```

### Step 6, verifying

```sql
-- Should be empty, or hold only crew/sea_pacts and beta_roster.
select * from app_private.wipe_audit('<user>');

-- Should differ only in id, username and created_at.
create temp table fresh (like public.profiles including defaults including generated);
insert into fresh (id, username) values (gen_random_uuid(), 'freshcheck');
select w.key, w.value as wiped, f.value as brand_new
from jsonb_each((select to_jsonb(p.*) from public.profiles p where p.username = '<name>')) w
join jsonb_each((select to_jsonb(f.*) from fresh f)) f on f.key = w.key
where w.value is distinct from f.value;
```

## Test record

`worldno1`, wiped with `p_keep_social` on.

| | Before | After |
| --- | --- | --- |
| Tables holding rows | 34 | 2 (`beta_roster`, `crew`) |
| Doubloons | 36,638 ⟡ | 100 ⟡ |
| Gems | 2,980 ◆ | 0 ◆ |
| Fishing XP | 9,582 | 0 |
| Expedition XP | 14,396 | 0 |
| Ship tier | 4 | 2 |
| Captain | granted | gone |
| Badges | 13 | 0 |

Cohort captured before the test: **82 accounts, 22 granted Captain, 46 with real
play.**
