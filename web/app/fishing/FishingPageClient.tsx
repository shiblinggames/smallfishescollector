'use client'

import { useState } from 'react'
import ZoneLanding, { type ZoneKey } from './ZoneLanding'
import FishingGame from './FishingGame'
import type { FishSpecies } from './actions'
import { getLevelFromXP } from '@/lib/fishingLevel'

type BaitItem = { bait_type: string; quantity: number }
type InventoryItem = {
  fish_id: number
  quantity: number
  fish_species: FishSpecies
}

type FishSpeciesBasic = { id: number; name: string; scientific_name: string; fun_fact: string; habitat: string; bite_rarity: number; sell_value: number }

export default function FishingPageClient({
  hookTier, rodTier, reelTier, lineTier,
  initialDoubloons, initialFishingXP, initialBait, initialInventory, uniqueSpeciesCaught,
  holdCapacity, shipTier, ownedRods, allFishSpecies, caughtFishIds, initialHighestPerfectStreak,
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
  holdCapacity: number
  shipTier: number
  ownedRods: number[]
  allFishSpecies: FishSpeciesBasic[]
  caughtFishIds: number[]
  initialHighestPerfectStreak: number
}) {
  const [selectedZone, setSelectedZone] = useState<ZoneKey | null>(null)

  if (!selectedZone) {
    return (
      <ZoneLanding
        fishingLevel={getLevelFromXP(initialFishingXP)}
        fishingXP={initialFishingXP}
        uniqueSpeciesCaught={uniqueSpeciesCaught}
        highestPerfectStreak={initialHighestPerfectStreak}
        onSelect={setSelectedZone}
      />
    )
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
      holdCapacity={holdCapacity}
      shipTier={shipTier}
      ownedRods={ownedRods}
      allFishSpecies={allFishSpecies}
      initialCaughtFishIds={caughtFishIds}
      initialHighestPerfectStreak={initialHighestPerfectStreak}
      selectedZone={selectedZone}
      onBack={() => setSelectedZone(null)}
    />
  )
}
