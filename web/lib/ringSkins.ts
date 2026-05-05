export type RingSkinId = 'standard' | 'gilded_compass' | 'whale_bone' | 'coral_spire' | 'abyssal_sigil' | 'navigators_silver'

export interface RingSkinDef {
  id: RingSkinId
  name: string
  stroke: string
  glow: string | null
  color: string
  description: string
  source: string
  imageUrl?: string
}

export const RING_SKINS: RingSkinDef[] = [
  {
    id: 'standard',
    name: 'Standard',
    stroke: 'rgba(255,255,255,0.12)',
    glow: null,
    color: '#6a6764',
    description: 'The default dial ring.',
    source: 'Always available',
  },
  {
    id: 'gilded_compass',
    name: 'Gilded Compass',
    stroke: '#f0c040',
    glow: 'drop-shadow(0 0 7px rgba(240,192,64,0.55))',
    color: '#f0c040',
    description: 'A gold-plated bezel found in the hold of a merchant ship.',
    source: 'Voyage: The Deep',
  },
  {
    id: 'whale_bone',
    name: 'Whale Bone',
    stroke: '#d4c9a8',
    glow: null,
    color: '#d4c9a8',
    description: 'Carved from whale bone. Old and salt-worn.',
    source: 'Voyage: Coastal Run',
    imageUrl: '/whalebone.png',
  },
  {
    id: 'coral_spire',
    name: 'Coral Spire',
    stroke: '#e05a38',
    glow: 'drop-shadow(0 0 5px rgba(224,90,56,0.4))',
    color: '#e05a38',
    description: 'Deep sea coral, still warm to the touch.',
    source: 'Voyage: Open Seas',
    imageUrl: '/coralspire.png',
  },
  {
    id: 'abyssal_sigil',
    name: 'Abyssal Sigil',
    stroke: '#c084fc',
    glow: 'drop-shadow(0 0 10px rgba(192,132,252,0.65))',
    color: '#c084fc',
    description: "No one knows what it means. Found in the deepest wreck.",
    source: 'Voyage: The Deep (rare)',
  },
  {
    id: 'navigators_silver',
    name: "Navigator's Silver",
    stroke: '#c0c8d8',
    glow: 'drop-shadow(0 0 4px rgba(192,200,216,0.45))',
    color: '#c0c8d8',
    description: "Pure silver, polished bright. A navigator's instrument.",
    source: 'Voyage: Open Seas',
    imageUrl: '/navigatorssilver.png',
  },
]

export function getRingSkin(id: string): RingSkinDef {
  return RING_SKINS.find(s => s.id === id) ?? RING_SKINS[0]
}
