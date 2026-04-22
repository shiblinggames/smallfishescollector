-- Run this in Supabase SQL editor

-- Replace claim_token with a more robust version that:
-- 1. Returns error if not authenticated
-- 2. Upserts the profile so missing profiles don't silently fail
create or replace function claim_token(p_token text)
returns jsonb as $$
declare
  v_row   claim_tokens%rowtype;
  v_uid   uuid;
  v_email text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;

  select email into v_email from auth.users where id = v_uid;
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
    set status = 'claimed', claimed_by = v_uid, claimed_at = now()
    where token = p_token;

  -- Upsert profile so missing profiles don't silently swallow the pack grant
  insert into profiles (id, packs_available)
    values (v_uid, v_row.packs_to_grant)
    on conflict (id) do update
      set packs_available = profiles.packs_available + excluded.packs_available;

  return jsonb_build_object('status', 'ok', 'packs', v_row.packs_to_grant);
end;
$$ language plpgsql security definer;
