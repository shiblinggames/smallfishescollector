'use client'

/**
 * WHAT YOUR RIG ADDS UP TO.
 *
 * Lifted out of GearScreen's Stats tab when the Shipyard became the place you
 * commit a loadout. Two screens showing the same five numbers is exactly the
 * shape of bug where one of them quietly stops agreeing with the fishing maths,
 * so there is one component and both mount it.
 *
 * It takes TIERS, not computed values. Handing it "+24°" from the caller would
 * put the derivation back in two places, which is the thing this is for.
 */

import React from 'react'
import { getEffectiveRod, LOCKED_IN } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { BAITS } from '@/lib/bait'
import { boatSpeed, boatAgility, trimLabel, getBoat } from '@/lib/boats'
import { hullSpeed } from '@/lib/shipyard'

function StatCell({ label, value, color, muted }: { label: string; value: string; color?: string; muted?: boolean }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
      <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', marginBottom: 5 }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: muted ? '#2e2c2a' : (color ?? '#f0ede8'), lineHeight: 1 }}>{value}</p>
    </div>
  )
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: `${color}cc`, background: `${color}14`, border: `1px solid ${color}30`, padding: '0.12rem 0.45rem', borderRadius: '2rem' }}>{label}</span>
  )
}

export default function LoadoutStats({
  rodTier, reelTier, hookTier, lineTier,
  completionistEffects = null, selectedBait, fishingLevel,
  zoneGoldenBoostPct = 0,
  boatId, hullTier,
  title = 'Loadout Stats',
  sub = 'What your rig adds up to, piece by piece.',
}: {
  rodTier: number
  reelTier: number
  hookTier: number
  lineTier: number
  completionistEffects?: number[] | null
  /** The bait type currently selected, if any. Bait moves catch zone and bite
   *  speed, so leaving it out understates the rig by however much bait is on. */
  selectedBait?: string | null
  fishingLevel: number
  zoneGoldenBoostPct?: number
  /**
   * THE BOAT UNDER YOU, when the caller has one to show.
   *
   * Only the Shipyard passes these — the fishing screen has no chart to sail
   * across, so speed and agility mean nothing on it. They belong in this panel
   * rather than in a box of their own, because "what my rig adds up to" is one
   * question and the hull is part of the rig: it decides how long the trip out
   * to the fish takes, which is as much a loadout stat as the catch zone.
   */
  boatId?: string | null
  hullTier?: number
  title?: string
  sub?: string
}) {
  const rod  = getEffectiveRod(rodTier, completionistEffects)
  const reel = getReel(reelTier)
  const line = getLine(lineTier)
  const bait = selectedBait ? BAITS.find(b => b.type === selectedBait) : undefined

  const dragPct    = Math.round((1 - reel.needleSpeedMultiplier) * 100)
  const snagRedPct = Math.round((1 - line.penaltyMultiplier) * 100)
  const catchZoneBonus = (hookTier * 3) + rod.catchZoneBonus + (bait?.catchZoneBonus ?? 0)

  const levelBiteBonus  = Math.round(((fishingLevel - 1) / 99) * 33)
  const baitBiteEffect  = bait ? Math.round((1 - bait.waitMult) * 100) : 0
  const totalBiteEffect = baitBiteEffect + levelBiteBonus

  const specialBonuses: { label: string; color: string }[] = []
  if (rod.doubleCatchChance > 0) specialBonuses.push({ label: rod.doubleCatchChance >= 1 ? 'Always double catch' : `${Math.round(rod.doubleCatchChance * 100)}% double catch`, color: rod.color })
  if (rod.retryOnMissChance > 0) specialBonuses.push({ label: `${Math.round(rod.retryOnMissChance * 100)}% retry on miss`, color: rod.color })
  if (rod.snagImmune) specialBonuses.push({ label: 'Snag immune', color: rod.color })
  if ((rod.jackpotChance ?? 0) > 0) specialBonuses.push({ label: `×${rod.jackpotMultiplier} jackpot · odds rise in shallows`, color: rod.color })
  if (rod.rarityBonus > 0) specialBonuses.push({ label: `+${Math.round(rod.rarityBonus * 100)}% rare fish`, color: rod.color })
  if (rod.lockedIn) {
    specialBonuses.push({ label: `Streak ${LOCKED_IN.speedStreak}: ${Math.round((1 - LOCKED_IN.speedWaitMult) * 100)}% faster bites`, color: '#22d3ee' })
    specialBonuses.push({ label: `Streak ${LOCKED_IN.tripleStreak}: ×${LOCKED_IN.tripleQty} haul every catch`, color: '#f0c040' })
    specialBonuses.push({ label: `Streak ${LOCKED_IN.frenzyStreak}: ${Math.round((1 - LOCKED_IN.frenzyWaitMult) * 100)}% faster + ${Math.round(LOCKED_IN.frenzyRarityBonus * 100)}% rare`, color: '#e879f9' })
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '0.9rem' }}>
      <div style={{ marginBottom: 8 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#c4a96a', letterSpacing: '0.04em' }}>{title}</p>
        <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(230,215,180,0.48)', fontStyle: 'italic', marginTop: 2 }}>{sub}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <StatCell label="Catch Zone" value={catchZoneBonus > 0 ? `+${catchZoneBonus}°` : '—'} color="#60a5fa" muted={catchZoneBonus === 0} />
        <StatCell
          label="Bite Speed"
          value={totalBiteEffect > 0 ? `+${totalBiteEffect}%` : totalBiteEffect < 0 ? `${totalBiteEffect}%` : '—'}
          color={totalBiteEffect < 0 ? '#f87171' : '#4ade80'}
          muted={totalBiteEffect === 0}
        />
        <StatCell label="Reel Drag" value={dragPct > 0 ? `${dragPct}%` : 'None'} color={reel.color} muted={dragPct === 0} />
        {zoneGoldenBoostPct > 0 && (
          <StatCell label="Golden Boost" value={`+${zoneGoldenBoostPct}%`} color="#f0c040" />
        )}
        <StatCell label="Snag Zone" value={snagRedPct > 0 ? `\u2212${snagRedPct}%` : 'Normal'} color={line.color} muted={snagRedPct === 0} />
        {/* THE BOAT, in the same grid as everything else. The hull tier and the
            boat's own trim are multiplied together here rather than shown as
            two separate numbers, because what a player wants to know is how
            fast they actually go — not which two things it came from. */}
        {hullTier != null && (<>
          <StatCell
            label="Sailing Speed"
            value={`${Math.round(hullSpeed(hullTier) * boatSpeed(boatId) * 100)}%`}
            color="#9fc9e8"
          />
          <StatCell
            label="Agility"
            value={`${Math.round(boatAgility(boatId) * 100)}%`}
            color="#7dd3fc"
            muted={boatAgility(boatId) === 1}
          />
        </>)}
      </div>
      {hullTier != null && (
        <p className="font-karla font-600" style={{
          fontSize: '0.66rem', color: 'rgba(230,215,180,0.42)', marginTop: 8, lineHeight: 1.5,
        }}>
          {getBoat(boatId)?.name ?? 'Driftwood'} · {trimLabel(getBoat(boatId)?.trim)}.
          Speed is the haul out; agility is answering the helm in tight water.
        </p>
      )}
      {specialBonuses.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {specialBonuses.map((b, i) => <Pill key={i} label={b.label} color={b.color} />)}
        </div>
      )}
    </div>
  )
}
