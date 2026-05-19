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
    description: 'Cold-water barnacle and old sea-green rot, stripped straight off Krust\'s consignment fleet.',
    filter: 'brightness(0.82) saturate(1.5) hue-rotate(115deg) contrast(1.08) drop-shadow(0 0 5px rgba(70,200,170,0.3))',
    color: '#4f9e8a',
    source: "Krust's Consignment",
  },
]

export function getShipSkin(id: string): ShipSkinDef | undefined {
  return SHIP_SKINS.find(s => s.id === id)
}
