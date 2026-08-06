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

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import HubTile, { HUB_GRID } from '@/components/HubTile'
import FishingLevelBar from '@/components/FishingLevelBar'
import FisherPose from '@/components/FisherPose'
import Almanac from './Almanac'
import FishingHubTour from './FishingHubTour'
import { ZONE_MIN_LEVEL, ZONE_BG, ZONE_LABEL, ZONE_COLOR, ZONE_ORDER } from './zoneData'
import { MOOD_CONFIG } from '@/lib/fishMarket'
import MarketTicker, { type TickerItem } from '@/components/MarketTicker'
import type { ZoneKey } from './ZoneLanding'
import type { RenownAlloc } from '@/lib/renown'


export default function FishingHub({
  fishingLevel, fishingXP, initialFishingRenownAlloc, ancientDeepUnlocked,
  currentZone, baitCount, speciesCaught, speciesTotal, marketMood, marketNextUpdate, exchangeUnveil, ticker, hasSeenHubTour,
  characterColor, equippedHat, equippedBoat, equippedPet, rodTier, reelTier, hookTier,
  onOpenZones,
}: {
  fishingLevel: number
  fishingXP: number
  initialFishingRenownAlloc?: RenownAlloc | null
  ancientDeepUnlocked: boolean
  /** The water they last fished, so the Fishing tile picks up where they left off. */
  currentZone: ZoneKey | null
  baitCount: number
  speciesCaught: number
  speciesTotal: number
  /** The hold at today's prices, which is what the market's portfolio leads with. */
  marketMood: string
  /** ISO time the fish board next turns over. */
  marketNextUpdate: string
  /** Fishing is capped and the Exchange has never been announced. The tile
   *  carries the news, since the market is where it actually opens. */
  exchangeUnveil: boolean
  /** Live board quotes for the strip at the top. Empty for a captain who has
   *  not caught anything yet, which hides it entirely. */
  ticker: TickerItem[]
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
  const mood = MOOD_CONFIG[marketMood] ?? MOOD_CONFIG.calm

  // Seconds until the board turns over, ticking. The tile used to report the
  // hold, which is a FISHING fact the hold's own screen states better; what a
  // captain wants from the door to the market is the market's own state and
  // how long the current prices have left to run.
  const [nextIn, setNextIn] = useState(() =>
    Math.max(0, Math.floor((new Date(marketNextUpdate).getTime() - Date.now()) / 1000)))
  useEffect(() => {
    const tick = () => setNextIn(Math.max(0, Math.floor((new Date(marketNextUpdate).getTime() - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [marketNextUpdate])
  const nextLabel = nextIn <= 0
    ? 'New prices any moment'
    : `New prices in ${Math.floor(nextIn / 60)}:${String(nextIn % 60).padStart(2, '0')}`
  // The bar fills toward the turnover instead of showing how full the hold is,
  // so the tile says the same thing twice in two ways.
  const marketPct = Math.max(0, Math.min(1, 1 - nextIn / 3600))

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
              {/* The board rides INSIDE the hero, the way the quarterdeck rides
                  inside Navigation's. It was a matching panel 0.9rem below,
                  which read as two objects that happened to agree rather than
                  one header.

                  Prices read here rather than on the Tavern where they used to
                  live: they decide what a haul is worth and when to sell it.
                  Once the Exchange is open its indexes lead the strip. */}
              <FishingLevelBar
                fishingXP={fishingXP}
                initialAlloc={initialFishingRenownAlloc}
                footer={ticker.length > 0 ? <MarketTicker items={ticker} /> : null}
              />
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
                // What the hold is WORTH today, not how many fish are in it.
                // A count told you nothing about whether the trip was worth
                // making; this is the number the market's own portfolio leads
                // with, and it moves with the mood named underneath it.
                // The market's own state, not yours. What is in the hold and
                // how full it is are fishing facts the Fishing tile and the
                // market screen both say better; this is the door to the BOARD,
                // so it reports the weather out there and how long these prices
                // have left. The Exchange opening still takes the line while it
                // is news.
                status={exchangeUnveil ? 'The Exchange is open' : mood.label}
                statusColor={exchangeUnveil ? '#38bdf8' : mood.color}
                sub={exchangeUnveil ? 'Fishing 100 earned you the trading floor' : nextLabel}
                progress={exchangeUnveil ? undefined : marketPct}
                dot={exchangeUnveil ? 'new' : null}
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
