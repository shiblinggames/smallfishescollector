'use client'

import { useState } from 'react'
import ZoneLanding, { type ZoneKey } from './ZoneLanding'
import FishingGame from './FishingGame'
import type { FishSpecies } from './actions'

type BaitItem = { bait_type: string; quantity: number }
type InventoryItem = {
  fish_id: number
  quantity: number
  fish_species: FishSpecies
}

export default function FishingPageClient({
  hookTier, rodTier, reelTier, lineTier,
  initialDoubloons, initialFishingXP, initialBait, initialInventory, uniqueSpeciesCaught,
}: {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  initialDoubloons: number
  initialFishingXP: number
  initialBait: BaitItem[]
  initialInventory: InventoryItem[]
  uniqueSpeciesCaught: number
}) {
  const [selectedZone, setSelectedZone] = useState<ZoneKey | null>(null)

  if (!selectedZone) {
    return <ZoneLanding rodTier={rodTier} onSelect={setSelectedZone} />
  }

  return (
    <FishingGame
      hookTier={hookTier}
      rodTier={rodTier}
      reelTier={reelTier}
      lineTier={lineTier}
      initialDoubloons={initialDoubloons}
      initialFishingXP={initialFishingXP}
      initialBait={initialBait}
      initialInventory={initialInventory}
      uniqueSpeciesCaught={uniqueSpeciesCaught}
      selectedZone={selectedZone}
      onBack={() => setSelectedZone(null)}
    />
  )
}
