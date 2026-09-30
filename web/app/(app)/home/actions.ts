'use server'

// BUILDING, FURNISHING, NAMING AND PINNING.
//
// Every price lives in lib/homestead and the rules in lib/core/homestead (spend
// first, a guarded write, the ledger line, a refund when the write does not
// land). Each action checks the session and hands the core the Supabase store.

import { verifiedSession } from '@/lib/verifiedSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { progressData } from '@/lib/data/progressData'
import * as core from '@/lib/core/homestead'
import { EMPTY_HOMESTEAD, type Homestead } from '@/lib/homestead'
import type { BuildResult } from '@/lib/core/homestead'

export type { BuildResult } from '@/lib/core/homestead'
export type Destination = { id: string; name: string; x: number; y: number; note: string }

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => progressData(createAdminClient())

/** The captain's homestead. A missing row is a brand-new one; a failed read
 *  throws rather than looking like an empty homestead. */
export async function getHomestead(): Promise<Homestead> {
  // getSession, not getUser: own-row read on a page load.
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  if (!session?.user) return EMPTY_HOMESTEAD
  return core.getHomestead(db(), session.user.id)
}

/** Build the next step of the house. */
export async function build(): Promise<BuildResult> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.build(db(), uid)
}

/** Name your own island (an empty box goes back to the default). */
export async function renameHomestead(name: string): Promise<BuildResult> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.renameHomestead(db(), uid, name)
}

/** Put something in a slot (buying and placing are one act). */
export async function furnish(furnishingId: string): Promise<BuildResult> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.furnish(db(), uid, furnishingId)
}

/** Which badges hang large. */
export async function pinBadges(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.pinBadges(db(), uid, ids)
}
