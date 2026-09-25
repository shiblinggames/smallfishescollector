// ── WHO IS ASKING, VERIFIED (2026-09-25 exploit audit) ──────────────────────
//
// `auth.getSession()` on the server returns whatever the auth cookie says,
// checking only its expiry. It is fine in front of an RLS query (the database
// verifies the token itself), but NOT in front of the service-role admin
// client: a hand-written cookie naming another captain's id was taken at its
// word, so a forged request could act as them.
//
// `getClaims()` verifies the token's signature (locally against the project's
// keys, or through the auth server when it cannot), so the id it returns is
// real. Same shape as the session it replaces, so call sites change one line.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function verifiedSession(supabase: SupabaseClient): Promise<{ user: { id: string } } | null> {
  const { data, error } = await supabase.auth.getClaims()
  const id = data?.claims?.sub
  if (error || typeof id !== 'string' || !id) return null
  return { user: { id } }
}
