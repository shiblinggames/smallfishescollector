export interface ShipSkinDef {
  id: string
  name: string
  description: string
  filter: string
  color: string
  source: string
}

export const SHIP_SKINS: ShipSkinDef[] = [
  {
    id: 'corsair_black',
    name: 'Corsair Black',
    description: "The hull of a ship that's never sailed under honest colours.",
    filter: 'brightness(0.5) saturate(0.2) contrast(1.1) drop-shadow(0 0 5px rgba(200,20,20,0.25))',
    color: '#9ca3af',
    source: "Barnacle Pete's Raid",
  },
  {
    id: 'verdigris_hull',
    name: 'Verdigris Hull',
    description: 'A hull rotted a deep, ominous green by years buried in Krust\'s cold cargo holds.',
    // Same darken-and-desaturate treatment as Corsair Black (a clean
    // black silhouette reads well across every ship tier); the skin's
    // identity comes from the verdigris-green glow alone. Previously
    // used hue-rotate(95deg) on top of saturation 1.4 which produced
    // a garish neon-green tint that fought every ship's base palette.
    filter: 'brightness(0.5) saturate(0.2) contrast(1.1) drop-shadow(0 0 5px rgba(60,165,110,0.35))',
    color: '#43a884',
    source: "Krust's Consignment",
  },
]

export function getShipSkin(id: string): ShipSkinDef | undefined {
  return SHIP_SKINS.find(s => s.id === id)
}
