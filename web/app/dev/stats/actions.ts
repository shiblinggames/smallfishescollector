'use server'

// ── THE FREEZE SWITCH ───────────────────────────────────────────────────────
//
// Acting on a flagged account used to be a session in the SQL editor with a
// snapshot open in another tab. This is the button. It puts an account on ice
// or takes it off, and it never deletes anything: a frozen account keeps every
// row it had, it just cannot play until a person decides.
//
// TWO PLACES, ONE FLAG. `profiles.frozen` is the record and what the admin
// page draws. `auth.users.raw_app_meta_data.frozen` is the gate: the middleware
// reads it off getUser() with no extra query, on every request, so the freeze
// lands on the frozen account's next click. app_metadata is the one that
// cannot be edited by the user (user_metadata can), which is why it is the one
// the gate trusts.
//
// Admin only, and the check is the row, not the session's word for it.

import { revalidatePath } from 'next/cache'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { createAdminClient } from '@/lib/supabase/admin'
import { flagAnomaly } from '@/lib/anomaly'

export async function setAccountFrozen(userId: string, frozen: boolean): Promise<{ ok: true } | { error: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not signed in.' }
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) return { error: 'Admins only.' }
  if (userId === me.id) return { error: 'Not yourself.' }

  const admin = createAdminClient()

  // The gate first, so a failure here leaves the record honest: an account
  // that reads frozen on the page but can still play is the worse outcome.
  const { data: target, error: readErr } = await admin.auth.admin.getUserById(userId)
  if (readErr || !target?.user) return { error: 'No such account.' }
  const meta = { ...(target.user.app_metadata ?? {}), frozen }
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, { app_metadata: meta })
  if (authErr) return { error: authErr.message }

  await admin.from('profiles').update({ frozen }).eq('id', userId)

  // The decision goes in the same ledger as the signals it answered, so the
  // page reads as a story: what tripped, and what was done about it.
  await flagAnomaly(admin, userId, frozen ? 'admin:frozen' : 'admin:unfrozen', 1, { by: me.id })

  revalidatePath('/dev/stats')
  return { ok: true }
}

/** The same switch as a FORM action, which must return nothing. A refusal
 *  here shows up as the row not changing; the reason is in the flags ledger. */
export async function freezeFromForm(userId: string, frozen: boolean): Promise<void> {
  await setAccountFrozen(userId, frozen)
}
