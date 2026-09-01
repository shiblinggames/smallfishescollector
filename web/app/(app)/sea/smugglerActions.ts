'use server'

// ── LEAVING FOR THE RUN, AND COMING BACK TO THE SAME PATCH OF WATER ─────────
//
// Tide Run is a different route on a different page, so taking it means the
// chart unmounts. The chart already writes `profiles.sea_x/sea_y` as you sail
// and reads it back on load, which is most of the way there — but "most" is the
// problem. That write is a periodic sync, so where you are when you leave and
// what is in the column can be a few seconds apart, and a captain who walked
// away from Kip mid-sync would come back somewhere down the coast wondering
// what happened to the man they were talking to.
//
// So the trip is stamped explicitly, and it is stamped to HIS coordinates
// rather than to the boat's. You were alongside him when you left; you should
// be alongside him when you get back, close enough that the hail is already
// there and you can hand him the distance and go again.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { KIP } from '@/lib/seaSmuggler'

/**
 * Park the boat next to Kip so the sea is where you left it when the run ends.
 *
 * Returns nothing worth acting on: a failure here costs the player a slightly
 * wrong starting position on a page they are about to leave, and blocking the
 * run on it would be trading a whole game mode for a cosmetic.
 */
export async function moorBesideSmuggler(): Promise<void> {
  const supabase = await createClient()
  // getSession, not getUser: this only writes the caller's own two columns and
  // the session names them. See the note in lib/supabase.
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return

  // OFF HIS BOW, NOT ON TOP OF HIM. Dropping the player exactly on his
  // coordinates puts two hulls in the same pixel, which reads as a rendering
  // fault rather than as a mooring. A short offset south-west is a boat pulled
  // alongside, and it is well inside his hail either way.
  const admin = createAdminClient()
  await admin
    .from('profiles')
    .update({ sea_x: KIP.x - 120, sea_y: KIP.y + 90 })
    .eq('id', uid)
}
