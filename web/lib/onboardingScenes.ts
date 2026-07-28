// ── Onboarding cutscene scripts ──────────────────────────────────────────────
// The plain-text tour cards are being replaced by cinematic character scenes,
// authored the same way the campaign story is: a list of SceneLine[] played
// through StoryScene (bust + typewriter + letterbox + backdrop). Two always-
// aboard voices mentor the player: Doby (the wise old whale) and Kat (the
// skeptic medic). Wrap a word in *asterisks* to hit it in the scene accent.

import type { SceneLine } from '@/lib/raidMap'

const CARD_ART = (f: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/${f}`

/** The two mentor voices. Same portraits as the campaign story GUIDE; defined
 *  here so onboarding scenes outside the raid map can reuse them. */
export const GUIDES = {
  doby: { speaker: 'Doby', portrait: CARD_ART('Doby_Mick_v2.png') },
  kat:  { speaker: 'Kat',  portrait: CARD_ART('Catfish.png') },
} as const

const D = GUIDES.doby
const K = GUIDES.kat

/** Accent temperature shared by the fishing-side onboarding scenes. */
export const FISHING_ACCENT = '#5eb0e0'

/** First-ever fishing visit — the whole loop in one cinematic beat: cast, the
 *  dial (green/gold), sell for doubloons, level into deeper water. */
export const FISHING_INTRO_SCENE: SceneLine[] = [
  { ...D, text: "Every reef on this coast has gone quiet, small fry. And a quiet sea is a sea with something *wrong* in it." },
  { ...D, text: "But a captain still has to eat. So let me show you how we pull a living from this water.", pause: 200 },
  { ...K, text: "Cast your line and wait. When a fish takes it, a dial spins up." },
  { ...K, text: "Stop the needle in the *green* to land the fish. Stop it in the *gold* and you've hooked a Perfect. Cleaner catch, richer haul.", pause: 200 },
  { ...D, text: "Everything you land sells for *doubloons* back at the Tavern. That coin is how a small crew becomes a feared one." },
  { ...D, text: "Fish enough and you'll rise in rank, and *deeper waters* open to you. Bigger quarry, stranger things.", pause: 200 },
  { ...K, text: "Start in the shallows. Don't go chasing the deep before you're ready for what's waiting down there." },
  { ...D, text: "Now get a line in the water, captain. Let's see what's still biting." },
]
