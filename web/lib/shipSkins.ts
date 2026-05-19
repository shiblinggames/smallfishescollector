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
    filter: 'brightness(0.46) saturate(1.4) hue-rotate(95deg) contrast(1.18) drop-shadow(0 0 5px rgba(10,55,32,0.55))',
    color: '#1d4a30',
    source: "Krust's Consignment",
  },
]

export function getShipSkin(id: string): ShipSkinDef | undefined {
  return SHIP_SKINS.find(s => s.id === id)
}
