export interface RodDef {
  tier: number
  name: string
  cost: number
  earnedOnly?: boolean       // if true, cannot be purchased — claimed via special action
  description: string
  color: string
  rarityBonus: number      // shifts rarity distribution toward rares (0 = no effect)
  biteIntervalMs: number   // time between bite opportunities (lower = faster)
  catchZoneBonus: number   // degrees added to catch zone
  doubleCatchChance: number  // chance to catch 2 fish on a successful catch (0–1)
  retryOnMissChance: number  // chance to retry the dial on miss or snag (0–1)
  snagImmune: boolean        // if true, snag zones count as miss — no extra bait lost
  perfectZoneBonus: number   // degrees added to the perfect zone (base is 5°)
  jackpotChance?: number     // chance to catch jackpotMultiplier fish at once (0–1)
  jackpotMultiplier?: number // how many fish on a jackpot hit
  crateChanceMult?: number   // multiplies the per-cast crate spawn chance (default 1)
  perfectXpMult?: number     // multiplies XP on a *perfect* catch — incl. the
                             // streak bonus, so it scales with streaks (default 1)
  // 3-pose sprite slug. Loads /{slug}_rest.png / _wait.png / _cast.png.
  // Every rod's source sheet is sliced into raw quadrants by web/slice-rod.mjs
  // so a single CHAR_ROD_OVERLAY position applies to all of them.
  slug?: string
  imageUrl?: string          // legacy single-sprite fallback (deprecated; kept for rods without 3-pose art)
  glow?: boolean             // enable any glow aura at all
  // Theme of the glow effect. Driven by per-keyframe CSS in globals.css
  // (rod-glow-fire / sparkle / electric for marquee rods; moon / tech as
  // subtler accents). Falls back to the generic .rod-glow pulse when omitted.
  glowType?: 'fire' | 'sparkle' | 'electric' | 'moon' | 'tech'
}

// Resolve the CSS class for a rod's glow aura. Single source of truth so
// every place that renders a rod (live game, shop, profiles, gear picker)
// stays in sync if we add a new glowType later.
export function rodGlowClass(rod: RodDef): string | undefined {
  if (!rod.glow) return undefined
  return rod.glowType ? `rod-glow-${rod.glowType}` : 'rod-glow'
}

export const RODS: RodDef[] = [
  {
    tier: 0, name: 'Bamboo Rod', cost: 0,
    description: 'A simple bamboo pole. Gets the job done.',
    color: '#a07858', rarityBonus: 0, biteIntervalMs: 3800, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_bamboo',
  },
  {
    tier: 1, name: 'Driftwood Staff', cost: 1500,
    description: 'Heavy and slow, but the wide tip gives you a more forgiving catch window.',
    color: '#b8956a', rarityBonus: 0, biteIntervalMs: 4500, catchZoneBonus: 8,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_driftwood',
  },
  {
    tier: 2, name: 'Fiberglass Rod', cost: 2500,
    description: 'Lighter than bamboo with a wider tip. Gives you a more forgiving catch window.',
    color: '#9ca3af', rarityBonus: 0, biteIntervalMs: 3800, catchZoneBonus: 10,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_fiberglass',
  },
  {
    tier: 3, name: 'Reef Guard', cost: 8000,
    description: 'Responsive and fast. Fish bite 15% quicker than the baseline.',
    color: '#34d399', rarityBonus: 0, biteIntervalMs: 3230, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_reefguard',
  },
  {
    tier: 4, name: 'Telescoping Rod', cost: 8000,
    description: 'Extends deep. Something about the length draws rarer fish to the surface.',
    color: '#60a5fa', rarityBonus: 0.10, biteIntervalMs: 3800, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_telescoping',
  },
  {
    tier: 5, name: 'Moonwood Staff', cost: 14000,
    description: 'Carved from driftwood blessed by a full moon. Bites 10% faster with a wider catch window.',
    color: '#a78bfa', rarityBonus: 0, biteIntervalMs: 3420, catchZoneBonus: 10,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_moonwood', glow: true, glowType: 'moon',
  },
  {
    tier: 6, name: 'Graphite Rod', cost: 22000,
    description: 'Lightweight and stiff. Fish bite 25% faster than baseline.',
    color: '#64748b', rarityBonus: 0, biteIntervalMs: 2850, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_graphite',
  },
  {
    tier: 7, name: "Navigator's Rod", cost: 35000,
    description: 'A well-balanced deep-sea rod. Good speed and a wider catch zone.',
    color: '#38bdf8', rarityBonus: 0, biteIntervalMs: 2800, catchZoneBonus: 8,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_navigators',
  },
  {
    tier: 8, name: 'Carbon Rod', cost: 60000,
    description: 'Precision-engineered. Bites come 35% faster than baseline.',
    color: '#4ade80', rarityBonus: 0, biteIntervalMs: 2470, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_carbon', glow: true, glowType: 'tech',
  },
  {
    tier: 9, name: 'Deep Diver', cost: 90000,
    description: 'Built for the abyss. 38% faster bites and a wide catch window.',
    color: '#22d3ee', rarityBonus: 0, biteIntervalMs: 2356, catchZoneBonus: 13,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_deepdiver',
  },
  {
    tier: 10, name: 'Legendary Rod', cost: 200000,
    description: 'Forged from the mast of a sunken galleon. 40% faster bites — the rarest fish cannot resist.',
    color: '#ff6b35', rarityBonus: 0.85, biteIntervalMs: 2280, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_legendary', glow: true, glowType: 'fire',
  },
  {
    tier: 11, name: 'Twin-Strike', cost: 45000,
    description: 'Two hooks on one line. When luck strikes, they both bite.',
    color: '#fbbf24', rarityBonus: 0, biteIntervalMs: 3200, catchZoneBonus: 0,
    doubleCatchChance: 0.25, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_twinstrike',
  },
  {
    tier: 12, name: 'Second Wind', cost: 28000,
    description: "Stubborn rod. When you miss, sometimes it refuses to let go.",
    color: '#fb923c', rarityBonus: 0, biteIntervalMs: 3200, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0.25, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_secondwind',
  },
  {
    tier: 13, name: "Millionaire's Rod", cost: 175000,
    description: 'Hand-rolled in gold leaf. Every catch brings two.',
    color: '#f0c040', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 0,
    doubleCatchChance: 1.0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_millionaires', glow: true, glowType: 'sparkle',
  },
  {
    tier: 15, name: 'YOLO Rod', cost: 1000000,
    description: '10% chance to land 100 fish at once. The other 90%? Just a regular catch.',
    color: '#60d9ff', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    jackpotChance: 0.10, jackpotMultiplier: 100,
    slug: 'rod_yolo', glow: true, glowType: 'electric',
  },
  {
    tier: 14, name: 'Completionist Rod', cost: 0, earnedOnly: true,
    description: 'Forged from the soul of every species in the sea. Every advantage, no compromises.',
    color: '#e8c84a', rarityBonus: 0.50, biteIntervalMs: 1000, catchZoneBonus: 16,
    doubleCatchChance: 1.0, retryOnMissChance: 0.50, snagImmune: true, perfectZoneBonus: 5,
  },
  {
    tier: 16, name: 'Treasure Rod', cost: 200000,
    description: 'Lures the deep’s lost hoards — doubles your chance of hooking a crate.',
    color: '#e8b54a', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    crateChanceMult: 2,
    slug: 'rod_treasure', glow: true, glowType: 'sparkle',
  },
  {
    tier: 17, name: 'Perfect Rod', cost: 200000,
    description: 'Rewards flawless form — perfect catches grant double XP, and it scales with your streak.',
    color: '#bfe3ff', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    perfectXpMult: 2,
    slug: 'rod_perfect', glow: true, glowType: 'moon',
  },
]

export function getRod(tier: number): RodDef {
  return RODS.find(r => r.tier === tier) ?? RODS[0]
}
