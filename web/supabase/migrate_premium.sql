alter table profiles
  add column if not exists is_premium boolean default false,
  add column if not exists premium_expires_at timestamptz;

-- Allows the webhook handler to resolve email → user ID without exposing auth.users
create or replace function get_user_by_email(p_email text)
returns uuid
language sql security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
