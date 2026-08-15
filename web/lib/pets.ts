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

export type PetSpecies = 'parrot' | 'monkey' | 'seal' | 'lizard' | 'raccoon' | 'crab' | 'plesiosaur'

export interface PetDef {
  id: string
  species: PetSpecies
  name: string
  /** Drop weight within the species pool. Higher = more common. */
  weight: number
  restImageUrl: string
  /** UI accent color for cards, equip glow, etc. */
  accentColor: string
  /** EARNED, never rolled. Excluded from the crate roll entirely (its species
   *  is absent from PET_SPECIES_WEIGHTS, so the first roll can never select
   *  it) and reported at 0% of finds. The Vigil's baby plesiosaurus is the
   *  first and only one: the pet you cannot be lucky into. */
  earnedOnly?: boolean
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
  // ── The Long Vigil's capstone. NOT a crate pet. ──
  // Earned by taking all six Ancient Deep giants to Vigil rank 5, which is the
  // hardest thing in fishing. 'plesiosaur' is deliberately absent from
  // PET_SPECIES_WEIGHTS, so rollPet's species roll can never reach it — the
  // crate cannot hand this out no matter how many chests you open. Crimson is
  // the established ancient rarity accent.
  { id: 'plesiosaur_baby', species: 'plesiosaur', name: 'Baby Plesiosaurus', weight: 1, restImageUrl: '/plesiosaur_baby.png', accentColor: '#e0455a', earnedOnly: true },
]

export function getPet(id: string | null | undefined): PetDef | undefined {
  if (!id) return undefined
  return PETS.find(p => p.id === id)
}

/** Plural group heading for a species, used by the Appearance pet picker.
 *
 *  A Record over PetSpecies rather than a loose map on purpose: adding a
 *  species to the union makes this fail to compile until it has a label, which
 *  is the guard that was missing. The picker previously carried its own inline
 *  list of parrot/monkey/seal, so the three species added on 2026-08-05 were
 *  owned and equippable but invisible in the only UI that equips them. */
export const PET_SPECIES_LABEL: Record<PetSpecies, string> = {
  parrot:  'Parrots',
  monkey:  'Monkeys',
  seal:    'Seals',
  lizard:  'Lizards',
  raccoon: 'Raccoons',
  crab:    'Crabs',
  plesiosaur: 'Ancients',
}

/** Species in registry order. Derived from PETS, so a new one appears in every
 *  grouped view without editing that view. */
export const PET_SPECIES_ORDER: PetSpecies[] = [...new Set(PETS.map(p => p.species))]

/** Crate → pet roll chance, indexed by crate tier. Pet hits override
 *  the normal crate outcome (doubloons/bait/cosmetic). Tune here.
 *  2026-07-02: halved across the board — pets were dropping too easily
 *  (esp. with auto-fishing racking up casts). Was 0.01/0.02/0.04/0.08. */
export const CRATE_PET_CHANCE: Record<'wooden' | 'metal' | 'gold' | 'diamond' | 'ancient', number> = {
  wooden:  0.005,
  metal:   0.01,
  gold:    0.02,
  diamond: 0.04,
  // The Ancient Chest. Two and a half times a diamond crate and the best pet
  // odds anywhere, which is the entire reason it exists: pets were reachable
  // only in aggregate before this, and the Ancient Deep had no crates at all.
  ancient: 0.10,
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
  // Lizard — tuned on /fishing-test. Sits smaller and further right than the
  // derived starting point, with a degree of counter-rotation so it reads as
  // resting against the hull rather than floating level on it.
  lizard: {
    rest: { top: 68.6, left: 68.1, width: 29, rotate: -1 },
    wait: { top: 64.4, left: 75.1, width: 29, rotate: -1 },
    cast: { top: 68.6, left: 74.3, width: 29, rotate: -1 },
  },
  // Raccoon — tuned on /fishing-test. The biggest of the three: it stands
  // upright, so it carries more height than the low sitters.
  raccoon: {
    rest: { top: 59.8, left: 59.3, width: 43.2, rotate: 0 },
    wait: { top: 55.9, left: 66.4, width: 43.2, rotate: 0 },
    cast: { top: 59.8, left: 64.8, width: 43.2, rotate: 0 },
  },
  // Crab — tuned on /fishing-test. The smallest and lowest of the lot, tucked
  // down on the deck.
  crab: {
    rest: { top: 70.2, left: 69.5, width: 25, rotate: 0 },
    wait: { top: 66.3, left: 76.7, width: 25, rotate: 0 },
    cast: { top: 70.2, left: 75.1, width: 25, rotate: 0 },
  },
  // PLACEHOLDER — seeded off the seal (the other low, long-bodied sitter) so
  // the overlay renders, then tune on /fishing-test when the art lands.
  plesiosaur: {
    rest: { top: 63.2, left: 56.9, width: 41.4, rotate: 0 },
    wait: { top: 59.3, left: 63.5, width: 41.4, rotate: 0 },
    cast: { top: 62.7, left: 62.4, width: 41.4, rotate: 0 },
  },
}

/** Convenience for callsites that have a PetDef in hand. */
// NEEDS TUNING ON /fishing-test once the art lands. Seeded off the seal (the
// other low, long-bodied sitter) purely so the overlay renders at all —
// species coords are never interchangeable here, and shipping a borrowed set
// as if it were tuned is exactly how a pet ends up floating off the hull.
export function getPetOverlay(species: PetSpecies, frame: 'rest' | 'wait' | 'cast'): { top: number; left: number; width: number; rotate: number } {
  return PET_OVERLAYS[species][frame]
}

/** Species split — first roll on a successful pet drop picks which
 *  species the player gets, then the variant roll picks within that
 *  species's pool. Tune the species mix here; variant rarity stays
 *  in the PETS weights. */
// Six species, live as of 2026-08-05 (lizard / raccoon / crab joined once
// their overlay coords were tuned). The parrot stays dominant because it is
// the one players already associate with the game; the other five split the
// rest evenly. Sums to 100 for readability, though the picker normalizes
// against the live sum so these can be changed without doing the math.
/** Species the crate can actually roll. Excluding 'plesiosaur' here is the
 *  enforcement, not a convention: rollPet walks these entries, so the Vigil pet
 *  is unreachable by construction, and adding it back becomes a type error. */
type RollablePetSpecies = Exclude<PetSpecies, 'plesiosaur'>

const PET_SPECIES_WEIGHTS: Record<RollablePetSpecies, number> = {
  parrot: 40,
  monkey: 12,
  seal: 12,
  lizard: 12,
  raccoon: 12,
  crab: 12,
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
  const pool = PETS.filter(p => p.species === species && !p.earnedOnly)
  const totalWeight = pool.reduce((s, p) => s + p.weight, 0)
  let variantRoll = Math.random() * totalWeight
  for (const p of pool) {
    variantRoll -= p.weight
    if (variantRoll <= 0) return p
  }
  return pool[0]
}

/** A pet's share of ALL pet finds, as a fraction.
 *
 *  Two rolls decide which pet you get: the species split, then the variant
 *  weight inside that species. Multiplying them is the only honest way to
 *  compare a Gold Crab against a Sand Parrot, because a variant weight on its
 *  own says nothing about how often its species comes up at all.
 *
 *  Derived from the same two tables rollPet() rolls against, so a tuning change
 *  moves the printed odds with it and the Almanac cannot quietly go stale.
 *  Deliberately NOT the per-crate chance: that depends on the crate tier
 *  (CRATE_PET_CHANCE runs 1 in 200 up to 1 in 10), so there is no single number
 *  to print on a pet. */
export function petDropShare(pet: PetDef): number {
  // Earned pets are not in the roll at all. Without this the lookup below is
  // undefined and the printed odds come out NaN.
  if (pet.earnedOnly) return 0
  const speciesTotal = Object.values(PET_SPECIES_WEIGHTS).reduce((s, w) => s + w, 0)
  const pool = PETS.filter(p => p.species === pet.species)
  const poolTotal = pool.reduce((s, p) => s + p.weight, 0)
  if (!speciesTotal || !poolTotal) return 0
  return ((PET_SPECIES_WEIGHTS[pet.species as RollablePetSpecies] ?? 0) / speciesTotal) * (pet.weight / poolTotal)
}
