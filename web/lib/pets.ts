// Pet system — currently parrots only; designed to grow.
//
// Drop model:
//   1. Crate roll. If the player opens a crate and that crate's pet
//      chance fires, they get A pet. The base outcome (doubloons/bait/
//      cosmetic) is overridden so the rare moment owns the screen.
//   2. Species roll. Today every pet roll resolves to a parrot (100%).
//      When new species ship, add them to PET_SPECIES_WEIGHTS and
//      route the second roll through there.
//   3. Variant roll. Within the species pool, weighted random pick.
//      For parrots: red is most common, gold is the rarest trophy.
//
// Pet ids stay stable across releases. Persisted to
// profiles.unlocked_pets (text[]) + profiles.equipped_pet (text).

export type PetSpecies = 'parrot'

export interface PetDef {
  id: string
  species: PetSpecies
  name: string
  /** Drop weight within the species pool. Higher = more common. */
  weight: number
  restImageUrl: string
  /** UI accent color for cards, equip glow, etc. */
  accentColor: string
}

export const PETS: PetDef[] = [
  // Parrots — gold rarest, red most common. Weights sum to 100 for a
  // readable distribution, but the picker normalizes against the live
  // sum so weights can shift without doing the math.
  { id: 'parrot_red',      species: 'parrot', name: 'Red Parrot',      weight: 45, restImageUrl: '/parrot_red.png',      accentColor: '#ef4444' },
  { id: 'parrot_blue',     species: 'parrot', name: 'Blue Parrot',     weight: 28, restImageUrl: '/parrot_blue.png',     accentColor: '#60a5fa' },
  { id: 'parrot_green',    species: 'parrot', name: 'Green Parrot',    weight: 15, restImageUrl: '/parrot_green.png',    accentColor: '#4ade80' },
  { id: 'parrot_charcoal', species: 'parrot', name: 'Charcoal Parrot', weight: 9,  restImageUrl: '/parrot_charcoal.png', accentColor: '#94a3b8' },
  { id: 'parrot_gold',     species: 'parrot', name: 'Gold Parrot',     weight: 3,  restImageUrl: '/parrot_gold.png',     accentColor: '#f0c040' },
]

export function getPet(id: string | null | undefined): PetDef | undefined {
  if (!id) return undefined
  return PETS.find(p => p.id === id)
}

/** Crate → pet roll chance, indexed by crate tier. Pet hits override
 *  the normal crate outcome (doubloons/bait/cosmetic). Tune here. */
export const CRATE_PET_CHANCE: Record<'wooden' | 'metal' | 'gold' | 'diamond', number> = {
  wooden:  0.01,
  metal:   0.02,
  gold:    0.04,
  diamond: 0.08,
}

/** Per-frame pet overlay positions in the character container —
 *  percentages relative to the character image's bounding box. All pet
 *  variants share these because the source PNGs are uniform size +
 *  shape. Tuned in /fishing-test. Exported so the in-game character
 *  render (FishingGame.tsx) and the Appearance slot composite preview
 *  (GearScreen.tsx) stay in sync — one source of truth. */
export const PET_OVERLAY: Record<'rest' | 'wait' | 'cast', { top: number; left: number; width: number; rotate: number }> = {
  rest: { top: 63.6, left: 62.6, width: 41.4, rotate: 0 },
  wait: { top: 59.7, left: 69.5, width: 41.4, rotate: 0 },
  cast: { top: 63.6, left: 68.3, width: 41.4, rotate: 0 },
}

/** Future-proof: when new species ship, add a key here and route the
 *  species pick through it. Single-species today = parrot guaranteed. */
const PET_SPECIES_WEIGHTS: Record<PetSpecies, number> = {
  parrot: 100,
}

/** Roll a pet on a successful crate pet-roll. Returns the picked
 *  PetDef. Server-side use only (calls Math.random). */
export function rollPet(): PetDef {
  // Species roll. With only parrot today this trivially picks parrot;
  // the weight table is here so adding e.g. 'cat' later is one entry.
  const speciesEntries = Object.entries(PET_SPECIES_WEIGHTS) as Array<[PetSpecies, number]>
  const totalSpeciesWeight = speciesEntries.reduce((s, [, w]) => s + w, 0)
  let speciesRoll = Math.random() * totalSpeciesWeight
  let species: PetSpecies = 'parrot'
  for (const [s, w] of speciesEntries) {
    speciesRoll -= w
    if (speciesRoll <= 0) { species = s; break }
  }

  // Variant roll within the species pool, weighted.
  const pool = PETS.filter(p => p.species === species)
  const totalWeight = pool.reduce((s, p) => s + p.weight, 0)
  let variantRoll = Math.random() * totalWeight
  for (const p of pool) {
    variantRoll -= p.weight
    if (variantRoll <= 0) return p
  }
  return pool[0]
}
