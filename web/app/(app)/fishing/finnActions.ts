'use server'

// ── ONE SURVIVOR OF THE FISHING SCREEN'S FINN CODE ──────────────────────────
//
// This file held the old encounter machinery: `recordFinnEncounter`, which
// bumped the counter and marked a beat seen, `settleFinnChallenge`, which took
// the verdict AND the payout as arguments from the client and could therefore
// mint doubloons from a console, and `recordFinnPass` for walking away from a
// wager. All three belonged to a Finn who turned up on a 2% roll per cast and
// bet you on it. He stands on the chart now and `sea/finnActions.ts` owns
// every part of that; the wagers are retired outright (2026-09-17).
//
// `markFinnRevealSeen` is the one thing still called, from `sea/FishingHere`
// at the moment an Ancient trophy lands and the mask comes off. It stays here
// rather than moving, because the reveal is a fishing-screen event by origin
// and the import is one line either way.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Marks the climax reveal as seen — flips finn_revealed so future encounters
 *  draw from the epilogue line pool and the reveal beat never fires twice. */
export async function markFinnRevealSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = createAdminClient()

  const { data: cur } = await admin
    .from('profiles')
    .select('finn_seen_beats')
    .eq('id', user.id)
    .single()

  const seen = ((cur?.finn_seen_beats as string[] | null) ?? [])
  const newSeen = seen.includes('reveal') ? seen : [...seen, 'reveal']

  await admin.from('profiles')
    .update({ finn_revealed: true, finn_seen_beats: newSeen })
    .eq('id', user.id)
}
