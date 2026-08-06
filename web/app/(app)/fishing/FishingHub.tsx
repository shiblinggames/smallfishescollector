'use client'

// The Fishing hub — the landing view for /fishing, built to the same plan as
// the Expeditions hub: skill level bar on top, then a 2x2 of painted tiles that
// each open one of fishing's rooms.
//
//   Fishing      -> the zone selector (ZoneLanding), in-page, like the
//                   Campaign tile opening the story map
//   Market       -> /tavern/market
//   Tackle Shop  -> /marketplace/tackle-shop
//   Almanac     -> parked
//
// The tiles are the SAME component the Expeditions hub uses (components/HubTile),
// so the two pages cannot drift into being lookalikes.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import HubTile, { HUB_GRID } from '@/components/HubTile'
import FishingLevelBar from '@/components/FishingLevelBar'
import { getFishHold } from '@/lib/fishHold'
import FisherPose from '@/components/FisherPose'
import Almanac from './Almanac'
import FishingHubTour from './FishingHubTour'
import { ZONE_MIN_LEVEL, ZONE_BG, ZONE_LABEL, ZONE_COLOR, ZONE_ORDER } from './zoneData'
import type { ZoneKey } from './ZoneLanding'
import type { RenownAlloc } from '@/lib/renown'


export default function FishingHub({
  fishingLevel, fishingXP, initialFishingRenownAlloc, ancientDeepUnlocked,
  currentZone, holdCount, fishHoldTier, baitCount, speciesCaught, speciesTotal, hasSeenHubTour,
  characterColor, equippedHat, equippedBoat, equippedPet, rodTier, reelTier, hookTier,
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
  hasSeenHubTour: boolean
  characterColor: string
  equippedHat: string | null
  equippedBoat: string | null
  equippedPet: string | null
  rodTier: number
  reelTier: number
  hookTier: number
  onOpenZones: () => void
}) {
  const router = useRouter()
  const [almanacOpen, setAlmanacOpen] = useState(false)

  const watersOpen = ZONE_ORDER.filter(z =>
    fishingLevel >= (ZONE_MIN_LEVEL[z] ?? 1) && (z !== 'ancient_deep' || ancientDeepUnlocked)).length
  const holdCap = getFishHold(fishHoldTier).capacity
  const holdFull = holdCount >= holdCap
  const holdPct = holdCap > 0 ? Math.min(1, holdCount / holdCap) : 0

  return (
    <>
      {/* Background — the painted water column: sunlit surface and the boat's
          line up top, shoals thinning through the mid water, black by the
          bottom. Expeditions looks out ACROSS the sea; fishing looks down
          through it.

          Four stops, not the usual three. A flat ramp strong enough to carry
          the level bar over that bright surface band crushed the rays and the
          shoals further down, which is the whole reason this art exists. So
          the top 16% is a short dark fade for the header alone, then it opens
          right back up and only closes again toward the tiles. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fishing-zones-bg.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(2,8,14,0.62) 0%, rgba(2,8,14,0.20) 16%, rgba(2,8,14,0.38) 50%, rgba(2,6,10,0.72) 100%)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <main className="min-h-screen pb-24 sm:pb-0">
          <div className="px-5 max-w-lg mx-auto" style={{ paddingTop: '1rem' }}>

            {/* Fishing level + Renown, the counterpart to Navigation on the
                Expeditions hub. Same 1.1rem/1rem block the Ship Hero wraps its
                Navigation header in, on top of the same 1rem of container pad,
                so the two skill titles land on the same line when you flick
                between the tabs. */}
            <div style={{ padding: '1.1rem 0 1rem' }}>
              <FishingLevelBar fishingXP={fishingXP} initialAlloc={initialFishingRenownAlloc} />
            </div>

            {/* Market / Tackle Shop / Almanac use purpose-painted 512x512
                plates, the same shape and density as the Expeditions tiles.
                They were pointed at the full-PAGE backdrops (820x1468 portrait,
                one of them deliberately blurred) whose centre crop at tile size
                was busy noise in the wrong aspect. */}
            <div style={HUB_GRID}>
              {/* The Fishing tile is the water you were last on, with YOU on
                  it — the same read as the "You are here" card in the zone
                  selector, so the hub shows your boat rather than stock art.
                  Falls back to the Shallows before the first cast. */}
              <HubTile
                bgImage={ZONE_BG[currentZone ?? 'shallows']}
                accent={currentZone ? ZONE_COLOR[currentZone] : '#5ec8e8'}
                title="Fishing"
                coachId="fishing"
                status={currentZone ? `Last cast: ${ZONE_LABEL[currentZone]}` : 'Start in the Shallows'}
                sub={`${watersOpen} of ${ZONE_ORDER.length} waters open`}
                onClick={onOpenZones}
                overlay={
                  <div aria-hidden style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '38%', width: '78%', pointerEvents: 'none', filter: 'drop-shadow(0 7px 11px rgba(0,10,25,0.6))' }}>
                    <FisherPose characterColor={characterColor} equippedHat={equippedHat} equippedBoat={equippedBoat} equippedPet={equippedPet} rodTier={rodTier} reelTier={reelTier} hookTier={hookTier} noGlow />
                  </div>
                }
              />

              <HubTile
                bgImage="/fish-market.jpg"
                accent="#f0c040"
                title="Market"
                coachId="market"
                status={holdCount > 0 ? `${holdCount} in the hold` : 'Hold is empty'}
                statusColor={holdFull ? '#f87171' : holdCount > 0 ? '#f0c040' : undefined}
                sub={holdFull ? 'Hold is full, sell to keep fishing' : `Room for ${(holdCap - holdCount).toLocaleString()} more`}
                progress={holdPct}
                dot={holdCount > 0 ? 'returned' : null}
                onClick={() => router.push('/tavern/market')}
              />

              <HubTile
                bgImage="/fish-tackle.jpg"
                accent="#7dd3fc"
                title="Tackle Shop"
                coachId="tackle"
                status={baitCount > 0 ? `${baitCount.toLocaleString()} bait aboard` : 'Out of bait'}
                statusColor={baitCount > 0 ? undefined : '#f87171'}
                sub="Rods, reels, line and bait"
                onClick={() => router.push('/marketplace/tackle-shop')}
              />

              <HubTile
                bgImage="/fish-bestiary.jpg"
                accent="#a78bfa"
                title="Almanac"
                coachId="almanac"
                status={`${speciesCaught} of ${speciesTotal} charted`}
                sub="Goldens, giants and pets"
                onClick={() => setAlmanacOpen(true)}
                progress={speciesTotal > 0 ? speciesCaught / speciesTotal : 0}
              />
            </div>

            <div className="pb-16" />
          </div>
        </main>
      </div>

      <Almanac open={almanacOpen} onClose={() => setAlmanacOpen(false)} />
      <FishingHubTour hasSeen={hasSeenHubTour} />
    </>
  )
}
