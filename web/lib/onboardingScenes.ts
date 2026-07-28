// ── Onboarding cutscene scripts ──────────────────────────────────────────────
// The plain-text tour cards are being replaced by cinematic character scenes,
// authored the same way the campaign story is: a list of SceneLine[] played
// through StoryScene (bust + typewriter + letterbox + backdrop). Doby and Kat
// deliver the lines.
//
// VOICE (important): onboarding copy is PLAIN, clear, and concise — direct
// instructions for brand-new players. NO pirate flavor, NO cryptic or moody
// lines here. Save that voice for the Expeditions campaign story. Say exactly
// what to do, in as few words as possible. Wrap a word in *asterisks* to hit it
// in the scene accent (use it only on the key term the player must remember).

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

/** First-ever fishing visit. Plain, quick how-to: cast, the dial (green/gold),
 *  sell for doubloons, level up to unlock new areas. */
export const FISHING_INTRO_SCENE: SceneLine[] = [
  { ...D, text: "Welcome, Captain. Here's how fishing works. It's quick." },
  { ...K, text: "Tap to cast your line, then wait for a fish to bite." },
  { ...K, text: "When a fish bites, a dial appears with a moving needle." },
  { ...K, text: "Stop the needle in the *green* to catch the fish. Land it in the *gold* for a Perfect, which is worth more.", insert: { kind: 'dial-demo' } },
  { ...D, text: "Sell your catch for *doubloons*, then spend them on better rods, bait, and upgrades." },
  { ...D, text: "Fishing raises your level. Higher levels unlock new areas to fish." },
  { ...K, text: "You're starting in the *Shallows*. Deeper areas have bigger, tougher fish." },
  { ...D, text: "That's it. Cast a line and give it a try." },
]
