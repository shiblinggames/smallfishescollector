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
    filter: 'brightness(0.22) saturate(0.15) contrast(1.6) drop-shadow(0 0 22px rgba(200,20,20,0.9))',
    color: '#dc2626',
    source: "Barnacle Pete's Raid",
  },
]

export function getShipSkin(id: string): ShipSkinDef | undefined {
  return SHIP_SKINS.find(s => s.id === id)
}
