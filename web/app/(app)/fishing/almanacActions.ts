'use server'

// The Angler's Almanac, loaded ON OPEN rather than with the fishing page (five
// tables and a dozen columns almost nobody opens on a given visit). Each action
// checks the session and hands lib/core/harbour the Supabase store.

import { verifiedSession } from '@/lib/verifiedSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { harbourData } from '@/lib/data/harbourData'
import * as core from '@/lib/core/harbour'
import type { AlmanacData } from '@/lib/core/harbour'

export type { AlmanacEntry, GoldenCatch, AlmanacStats, AlmanacData } from '@/lib/core/harbour'

async function me(): Promise<string | null> {
  // getSession is enough: this only reads (and stamps its own row).
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  return session?.user?.id ?? null
}

export async function getAlmanacData(): Promise<AlmanacData | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.getAlmanacData(harbourData(createAdminClient()), uid)
}

/** The book has been read. Stamped when it closes. Fire and forget. */
export async function markAlmanacViewed(): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.markAlmanacViewed(harbourData(createAdminClient()), uid)
}
