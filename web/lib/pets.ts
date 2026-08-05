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

export type PetSpecies = 'parrot' | 'monkey' | 'seal' | 'lizard' | 'raccoon' | 'crab'

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
  // Parrots — sand + gold both sit at the rarest tier (weight 3 each).
  // Red is the most common bird; the rest scale down through blue,
  // green, charcoal. Weights sum to ~100 for readability, but the
  // picker normalizes against the live sum so values can shift
  // freely without doing the math.
  { id: 'parrot_red',      species: 'parrot', name: 'Red Parrot',      weight: 43, restImageUrl: '/parrot_red.png',      accentColor: '#ef4444' },
  { id: 'parrot_blue',     species: 'parrot', name: 'Blue Parrot',     weight: 27, restImageUrl: '/parrot_blue.png',     accentColor: '#60a5fa' },
  { id: 'parrot_green',    species: 'parrot', name: 'Green Parrot',    weight: 15, restImageUrl: '/parrot_green.png',    accentColor: '#4ade80' },
  { id: 'parrot_charcoal', species: 'parrot', name: 'Charcoal Parrot', weight: 9,  restImageUrl: '/parrot_charcoal.png', accentColor: '#94a3b8' },
  { id: 'parrot_sand',     species: 'parrot', name: 'Sand Parrot',     weight: 3,  restImageUrl: '/parrot_sand.png',     accentColor: '#e8c97a' },
  { id: 'parrot_gold',     species: 'parrot', name: 'Gold Parrot',     weight: 3,  restImageUrl: '/parrot_gold.png',     accentColor: '#f0c040' },
  // Monkeys — brown common (90%), golden the trophy (10%). Weights
  // are relative within the monkey pool; species split happens first
  // via PET_SPECIES_WEIGHTS (75% parrot / 25% monkey).
  { id: 'monkey_brown',    species: 'monkey', name: 'Brown Monkey',    weight: 90, restImageUrl: '/monkey_brown.png',    accentColor: '#a78a6a' },
  { id: 'monkey_golden',   species: 'monkey', name: 'Golden Monkey',   weight: 10, restImageUrl: '/monkey_golden.png',   accentColor: '#f0c040' },
  // Seals — brown common, gray mid, gold the trophy. Sit low on the
  // boat deck like the monkey. Weights are relative within the seal pool.
  { id: 'seal_brown',      species: 'seal',   name: 'Brown Seal',      weight: 60, restImageUrl: '/seal_brown.png',      accentColor: '#a78a6a' },
  { id: 'seal_gray',       species: 'seal',   name: 'Gray Seal',       weight: 30, restImageUrl: '/seal_gray.png',       accentColor: '#94a3b8' },
  { id: 'seal_gold',       species: 'seal',   name: 'Gold Seal',       weight: 10, restImageUrl: '/seal_gold.png',       accentColor: '#f0c040' },
  // Lizards — the ship's iguana, tricorn and all. Green is the common
  // one, indigo mid, white the albino trophy. Long and low with a tail
  // that trails well behind the body, so its overlay coords will not
  // match the seal's despite both sitting on the deck. Tune on
  // /fishing-test before this goes anywhere near the drop table.
  { id: 'lizard_green',    species: 'lizard', name: 'Green Lizard',    weight: 60, restImageUrl: '/lizard_green.png',    accentColor: '#6cbf5a' },
  { id: 'lizard_indigo',   species: 'lizard', name: 'Indigo Lizard',   weight: 30, restImageUrl: '/lizard_indigo.png',   accentColor: '#7b6fb0' },
  { id: 'lizard_white',    species: 'lizard', name: 'White Lizard',    weight: 10, restImageUrl: '/lizard_white.png',    accentColor: '#dfe3e8' },
  // Raccoons — bandana'd deck thief, stands upright like the monkey. Only two
  // colorways, so no trophy tier: beige is the common one and black the rarer.
  { id: 'raccoon_beige',   species: 'raccoon', name: 'Beige Raccoon',  weight: 65, restImageUrl: '/raccoon_beige.png',   accentColor: '#a89076' },
  { id: 'raccoon_black',   species: 'raccoon', name: 'Black Raccoon',  weight: 35, restImageUrl: '/raccoon_black.png',   accentColor: '#767c85' },
  // Crabs — wide and low, sits on the deck like the seal. Gold is the trophy,
  // matching every other species where gold is the rare one.
  { id: 'crab_orange',     species: 'crab',   name: 'Orange Crab',     weight: 60, restImageUrl: '/crab_orange.png',     accentColor: '#c85a28' },
  { id: 'crab_blue',       species: 'crab',   name: 'Blue Crab',       weight: 30, restImageUrl: '/crab_blue.png',       accentColor: '#5878a8' },
  { id: 'crab_gold',       species: 'crab',   name: 'Gold Crab',       weight: 10, restImageUrl: '/crab_gold.png',       accentColor: '#f0c040' },
]

export function getPet(id: string | null | undefined): PetDef | undefined {
  if (!id) return undefined
  return PETS.find(p => p.id === id)
}

/** Crate → pet roll chance, indexed by crate tier. Pet hits override
 *  the normal crate outcome (doubloons/bait/cosmetic). Tune here.
 *  2026-07-02: halved across the board — pets were dropping too easily
 *  (esp. with auto-fishing racking up casts). Was 0.01/0.02/0.04/0.08. */
export const CRATE_PET_CHANCE: Record<'wooden' | 'metal' | 'gold' | 'diamond', number> = {
  wooden:  0.005,
  metal:   0.01,
  gold:    0.02,
  diamond: 0.04,
}

/** Per-species, per-frame overlay positions in the character container.
 *  Percentages are relative to the character image's bounding box.
 *  Different species have different silhouettes (the parrot perches
 *  high, the monkey sits low on the boat etc.) so each species gets
 *  its own coord set. Tune in /fishing-test. Single source of truth
 *  shared across FishingGame in-game render + GearScreen Appearance
 *  composite + /profile and /u/<username> silhouettes. */
export const PET_OVERLAYS: Record<PetSpecies, Record<'rest' | 'wait' | 'cast', { top: number; left: number; width: number; rotate: number }>> = {
  parrot: {
    rest: { top: 63.6, left: 62.6, width: 41.4, rotate: 0 },
    wait: { top: 59.7, left: 69.5, width: 41.4, rotate: 0 },
    cast: { top: 63.6, left: 68.3, width: 41.4, rotate: 0 },
  },
  // Monkey — tuned on /fishing-test. Sits a hair lower + slightly
  // tighter-left than the parrot to land on the boat hull rather than
  // the shoulder.
  monkey: {
    rest: { top: 65.5, left: 62,   width: 41.4, rotate: 0 },
    wait: { top: 61.7, left: 68.9, width: 41.4, rotate: 0 },
    cast: { top: 65.5, left: 67.7, width: 41.4, rotate: 0 },
  },
  // Seal — tuned on /fishing-test (sits low + a touch left of the monkey).
  seal: {
    rest: { top: 63.2, left: 56.9, width: 41.4, rotate: 0 },
    wait: { top: 59.3, left: 63.5, width: 41.4, rotate: 0 },
    cast: { top: 62.7, left: 62.4, width: 41.4, rotate: 0 },
  },
  // ── UNTUNED STARTING POSITIONS ──────────────────────────────────────────
  // The three below are DERIVED, not eyeballed and not copy-pasted from
  // another species. Copying a species' numbers does not work: `width` scales
  // the whole 1024x576 canvas, and each animal sits in a different part of
  // its own canvas with a different amount of transparent padding, so
  // identical numbers put two animals at different on-screen sizes and
  // places. The lizard originally inherited the seal's 41.4 and would have
  // rendered noticeably small because its subject is narrower in frame.
  //
  // So each one is solved to land its VISIBLE subject on the same on-screen
  // box as an anchor species with a similar silhouette, using the measured
  // alpha bounding boxes. That puts them in the right neighbourhood; the eye
  // still has the final say on /fishing-test.
  lizard: {   // anchored to the seal (low deck-sitter)
    rest: { top: 63.3, left: 56.6, width: 47.9, rotate: 0 },
    wait: { top: 59.4, left: 63.2, width: 47.9, rotate: 0 },
    cast: { top: 62.8, left: 62.1, width: 47.9, rotate: 0 },
  },
  raccoon: { // anchored to the monkey (stands upright)
    rest: { top: 65.8, left: 64.6, width: 32.7, rotate: 0 },
    wait: { top: 62,   left: 71.5, width: 32.7, rotate: 0 },
    cast: { top: 65.8, left: 70.3, width: 32.7, rotate: 0 },
  },
  crab: {    // anchored to the seal (wide and low)
    rest: { top: 62.5, left: 52,   width: 51.5, rotate: 0 },
    wait: { top: 58.6, left: 58.6, width: 51.5, rotate: 0 },
    cast: { top: 62,   left: 57.5, width: 51.5, rotate: 0 },
  },
}

/** Convenience for callsites that have a PetDef in hand. */
export function getPetOverlay(species: PetSpecies, frame: 'rest' | 'wait' | 'cast'): { top: number; left: number; width: number; rotate: number } {
  return PET_OVERLAYS[species][frame]
}

/** Species split — first roll on a successful pet drop picks which
 *  species the player gets, then the variant roll picks within that
 *  species's pool. Tune the species mix here; variant rarity stays
 *  in the PETS weights. */
const PET_SPECIES_WEIGHTS: Record<PetSpecies, number> = {
  parrot: 60,
  monkey: 20,
  seal: 20,
  // NOT IN THE DROP TABLE YET. Weight 0 keeps these out of rollPet while
  // their art and registry entries are live, so they can be previewed and
  // positioned on /fishing-test without any chance of a player rolling one
  // that renders in the wrong spot. Turn each on once its coords above are
  // confirmed, shaving the three originals to keep the mix sane. Three new
  // species at ~15 each would want roughly parrot 40 / monkey 12 / seal 13.
  lizard: 0,
  raccoon: 0,
  crab: 0,
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
