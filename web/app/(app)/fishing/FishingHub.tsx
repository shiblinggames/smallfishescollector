'use client'

// The Fishing hub — the landing view for /fishing, built to the same plan as
// the Expeditions hub: skill level bar on top, then a 2x2 of painted tiles that
// each open one of fishing's rooms.
//
//   Fishing      -> the zone selector (ZoneLanding), in-page, like the
//                   Campaign tile opening the story map
//   Market       -> /tavern/market
//   Tackle Shop  -> /marketplace/tackle-shop
//   Bestiary     -> parked
//
// The tiles are the SAME component the Expeditions hub uses (components/HubTile),
// so the two pages cannot drift into being lookalikes.

import { useRouter } from 'next/navigation'
import HubTile, { HUB_GRID } from '@/components/HubTile'
import FishingLevelBar from '@/components/FishingLevelBar'
import { getFishHold } from '@/lib/fishHold'
import { ZONE_MIN_LEVEL } from './zoneData'
import type { ZoneKey } from './ZoneLanding'
import type { RenownAlloc } from '@/lib/renown'

const ZONE_LABEL: Record<string, string> = {
  shallows: 'Shallows',
  open_waters: 'Open Waters',
  deep: 'Deep',
  abyss: 'Abyss',
  ancient_deep: 'Ancient Deep',
}
const ZONE_ORDER: ZoneKey[] = ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep']

export default function FishingHub({
  fishingLevel, fishingXP, initialFishingRenownAlloc, ancientDeepUnlocked,
  currentZone, holdCount, fishHoldTier, baitCount, speciesCaught, speciesTotal,
  onOpenZones,
}: {
  fishingLevel: number
  fishingXP: number
  initialFishingRenownAlloc?: RenownAlloc | null
  ancientDeepUnlocked: boolean
  /** The water they last fished, so the Fishing tile picks up where they left off. */
  currentZone: ZoneKey | null
  holdCount: number
  fishHoldTier: number
  baitCount: number
  speciesCaught: number
  speciesTotal: number
  onOpenZones: () => void
}) {
  const router = useRouter()

  const watersOpen = ZONE_ORDER.filter(z =>
    fishingLevel >= (ZONE_MIN_LEVEL[z] ?? 1) && (z !== 'ancient_deep' || ancientDeepUnlocked)).length
  const holdCap = getFishHold(fishHoldTier).capacity
  const holdFull = holdCount >= holdCap
  const holdPct = holdCap > 0 ? Math.min(1, holdCount / holdCap) : 0

  return (
    <>
      {/* Background — the painted water column, same scene the zone selector
          uses, under a ramp that darkens toward the tiles so they stay legible. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fishing-zones-bg.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(2,8,14,0.4) 0%, rgba(2,8,14,0.74) 46%, rgba(2,6,10,0.93) 100%)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <main className="min-h-screen pb-24 sm:pb-0">
          <div className="px-5 max-w-lg mx-auto" style={{ paddingTop: '1rem' }}>

            {/* Fishing level + Renown, the counterpart to Navigation on the
                Expeditions hub. */}
            <div style={{ marginBottom: '1rem' }}>
              <FishingLevelBar fishingXP={fishingXP} initialAlloc={initialFishingRenownAlloc} />
            </div>

            <div style={HUB_GRID}>
              <HubTile
                bgImage="/openwaters.jpg"
                accent="#5ec8e8"
                title="Fishing"
                status={currentZone ? `Last cast: ${ZONE_LABEL[currentZone]}` : 'Start in the Shallows'}
                sub={`${watersOpen} of ${ZONE_ORDER.length} waters open`}
                onClick={onOpenZones}
              />

              <HubTile
                bgImage="/page-market.jpg"
                accent="#f0c040"
                title="Market"
                status={holdCount > 0 ? `${holdCount} in the hold` : 'Hold is empty'}
                statusColor={holdFull ? '#f87171' : holdCount > 0 ? '#f0c040' : undefined}
                sub={holdFull ? 'Hold is full, sell to keep fishing' : `Room for ${(holdCap - holdCount).toLocaleString()} more`}
                progress={holdPct}
                dot={holdCount > 0 ? 'returned' : null}
                onClick={() => router.push('/tavern/market')}
              />

              <HubTile
                bgImage="/tackle-shop-page-bg.jpg"
                accent="#7dd3fc"
                title="Tackle Shop"
                status={baitCount > 0 ? `${baitCount.toLocaleString()} bait aboard` : 'Out of bait'}
                statusColor={baitCount > 0 ? undefined : '#f87171'}
                sub="Rods, reels, line and bait"
                onClick={() => router.push('/marketplace/tackle-shop')}
              />

              <HubTile
                bgImage="/hold-bg.jpg"
                accent="#a78bfa"
                title="Bestiary"
                status=""
                sub={`${speciesCaught} of ${speciesTotal} logged`}
                locked
                lockLabel="Coming Soon"
                muted
              />
            </div>

            <div className="pb-16" />
          </div>
        </main>
      </div>
    </>
  )
}
