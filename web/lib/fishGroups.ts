// Fish crew groups → habitat zone. The group is the fish's tier; it drives
// both pack-draw odds (drawPack.ts) and the card backdrop (FishCard.tsx), so
// it lives here as the single source of truth. Keys are card slugs (lowercase
// filename without extension, matching `cards.slug`).
//
// Group 1 = Shallows, 2 = Open Waters, 3 = Deep, 4 = Abyss (rarest;
// legendary tier — Catfish, Doby Mick, Mako, Dole, and Laz the Coelacanth).

export const FISH_GROUPS: Set<string>[] = [
  new Set(['bass','eel','flounder','goldfish','krill','minnow','piranha','pufferfish','red_snapper','salmon','sardine','tuna','clownfish','koi']),
  new Set(['anglerfish','beluga_whale','blobfish','blue_marlin','lionfish','nurse_shark','oarfish','sailfish','swordfish','hammerhead_shark','manta_ray','whale_shark']),
  new Set(['goblin_shark','tiger_shark','blue_whale','giant_squid','great_white_shark','humpback_whale','orca','angelfish']),
  new Set(['catfish','doby_mick','mako','dole','coelacanth']),
]

export type FishZone = 'shallows' | 'open' | 'deep' | 'abyss'

const ZONE_BY_GROUP: FishZone[] = ['shallows', 'open', 'deep', 'abyss']

/** Habitat zone for a card slug (lowercase filename sans extension), or null. */
export function fishZone(slug: string): FishZone | null {
  const i = FISH_GROUPS.findIndex(g => g.has(slug))
  return i >= 0 ? ZONE_BY_GROUP[i] : null
}
