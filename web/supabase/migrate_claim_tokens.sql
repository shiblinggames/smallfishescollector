-- Run this in Supabase SQL editor

-- 1. Claim tokens table
create table if not exists claim_tokens (
  id          serial primary key,
  token       text unique not null,
  email       text,                          -- null = any authenticated user can claim
  packs_to_grant int not null default 1,
  status      text not null default 'pending' check (status in ('pending', 'claimed')),
  claimed_by  uuid references profiles(id),
  claimed_at  timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz default now()
);

-- 2. RLS
alter table claim_tokens enable row level security;

-- Anyone can read a token (needed to validate before login)
create policy "claim_tokens public read" on claim_tokens for select using (true);

-- 3. Secure server-side function to claim a token atomically
create or replace function claim_token(p_token text)
returns jsonb as $$
declare
  v_row   claim_tokens%rowtype;
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  select * into v_row from claim_tokens where token = p_token;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_row.status != 'pending' then
    return jsonb_build_object('status', 'already_claimed');
  end if;

  if v_row.expires_at is not null and v_row.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;

  if v_row.email is not null and lower(v_row.email) != lower(v_email) then
    return jsonb_build_object('status', 'email_mismatch');
  end if;

  update claim_tokens
    set status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
    where token = p_token;

  update profiles
    set packs_available = packs_available + v_row.packs_to_grant
    where id = auth.uid();

  return jsonb_build_object('status', 'ok', 'packs', v_row.packs_to_grant);
end;
$$ language plpgsql security definer;

-- 4. Helper: generate a token (run once per customer)
-- insert into claim_tokens (token, email, packs_to_grant, expires_at)
-- values (encode(gen_random_bytes(16), 'hex'), 'customer@example.com', 3, now() + interval '30 days');
