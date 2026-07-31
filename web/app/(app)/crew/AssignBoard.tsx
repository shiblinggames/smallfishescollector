'use client'

/** THE ASSIGN BOARD.
 *
 *  Where you decide who sails. Art-forward, in the same language as the battle
 *  loadout: the crew IS the tile, the name sits under it, an empty seat is a
 *  tap target and a seat past your hull's capacity is visibly locked rather
 *  than absent.
 *
 *  The totals at the top of each party are computed EXACTLY the way
 *  resolveDeployedCrew computes them for the actual expedition: level bonuses
 *  fold into the base, the crew's stat trait adds on top, and seat 0 counts
 *  full while every other seat counts at 80%. A summary that adds up
 *  differently from the thing it is summarising is a lie the player only finds
 *  out about after they launch.
 */

import type { ReactNode } from 'react'
import { applyLevelBonuses } from '@/lib/crewLevel'
import { netTraitStats } from '@/lib/crewEffects'
import { RARITY_COLORS, type CrewRarity } from '@/lib/crewGen'
import type { CrewMember } from './actions'

/** Mirrors lib/crewResolve: the captain's seat pulls full weight, the rest 80%. */
const CAPTAIN_MULT = 1
const CREW_MULT = 0.8
const slotMult = (slot: number) => (slot === 0 ? CAPTAIN_MULT : CREW_MULT)

/** One crew's effective stats: level first, then their trait. Same order as
 *  resolveDeployedCrew, which matters because both are clamped downstream. */
export function effectiveStats(c: CrewMember) {
  const leveled = c.xp > 0
    ? applyLevelBonuses({ power: c.power, dodge: c.dodge, fortune: c.fortune }, c.xp)
    : { power: c.power, dodge: c.dodge, fortune: c.fortune }
  const t = netTraitStats(c.effects)
  return {
    power: leveled.power + t.power,
    dodge: leveled.dodge + t.dodge,
    fortune: leveled.fortune + t.fortune,
  }
}

function partyTotals(party: CrewMember[], slotOf: (c: CrewMember) => number) {
  return party.reduce((s, c) => {
    const e = effectiveStats(c)
    const m = slotMult(slotOf(c))
    return {
      power: s.power + Math.round(e.power * m),
      dodge: s.dodge + Math.round(e.dodge * m),
      fortune: s.fortune + Math.round(e.fortune * m),
    }
  }, { power: 0, dodge: 0, fortune: 0 })
}

const STAT_COLOR = { power: '#e08a7a', dodge: '#7fc4a8', fortune: '#e0c47a' }

/** Every party is drawn to SIX seats. Anything past the hull's capacity shows
 *  locked rather than vanishing, so the ship upgrade has something to unlock
 *  into and the ceiling is legible before you pay for it. */
const MAX_SEATS = 6

/** Empty seats have no crew, so they have no rarity to inherit. Warm neutral
 *  rather than the track accent: with the panel art carrying the party's
 *  identity, an empty seat glowing red or blue was the last thing making the
 *  seat row look track-coloured. Translucent tints only, never a solid fill. */
const OPEN_SEAT = '#c3b291'

export default function AssignBoard({
  roster, shipCrewSlots, lockedCrewIds, trawlingCrewIds, artSrc,
  onPickSeat, onTapCrew, raidAccent, voyageAccent,
}: {
  roster: CrewMember[]
  shipCrewSlots: number
  lockedCrewIds: number[]
  trawlingCrewIds: number[]
  artSrc: (filename: string) => string
  /** Open the picker for ONE specific seat. Used by empty seats and by the
   *  swap pip on a filled one - assigning to an occupied slot already benches
   *  whoever holds it (applyAssignment step 1), so picking IS the swap. */
  onPickSeat: (track: 'raid' | 'voyage', slot: number) => void
  /** Tapping a seated crew - opens their detail, which owns swap + remove. */
  onTapCrew: (crew: CrewMember) => void
  raidAccent: string
  voyageAccent: string
}) {
  const atSea = new Set(lockedCrewIds)
  const trawling = new Set(trawlingCrewIds)

  // Every surface in here used to share ONE navy ramp (13,18,27 / 22,29,40 /
  // 20,26,36 / ...), so the red track was a red BORDER around a blue panel and
  // the accent wash (9%, gone by 62%) never changed that. The base hue is what
  // reads, not the outline. Each track now gets its own opaque ramp pulled
  // toward its accent: warm near-black for the raid, cool for the voyage.
  // Fully opaque hex, no alpha - nothing behind these needs to show through.
  // Full-bleed art per track, with every tile on top of it TRANSLUCENT so the
  // plate reads through them rather than only in the gaps.
  //
  // `base` is the flat colour under the jpg (it shows for the moment before
  // the image lands, and through the wash). The tile values are deliberately
  // dark and semi-opaque: enough contrast for a name and three numbers, little
  // enough that the sea and smoke still come through.
  const RAMP = {
    raid: {
      // Storm water off the campaign's own /raids backdrop, cropped to the
      // horizon band and sized for a panel (1000x824, 61KB, vs the 1536x2752
      // 237KB page plate). Simpler than the fleet-battle art it replaced: open
      // water and one lightning strike, nothing competing with the seats.
      // Wash is near-neutral so the storm keeps its own colour instead of
      // being pulled brown.
      base: '#161016', art: '/crew-raid-panel.jpg', fade: '18,14,18',
      stat: 'rgba(10,5,8,0.52)', locked: 'rgba(10,5,8,0.46)',
      open: 'rgba(10,5,8,0.36)', seat: 'rgba(10,5,8,0.44)',
    },
    voyage: {
      base: '#0c151f', art: '/voyages-modal-bg.jpg', fade: '12,21,31',
      stat: 'rgba(4,10,18,0.52)', locked: 'rgba(4,10,18,0.46)',
      open: 'rgba(4,10,18,0.36)', seat: 'rgba(4,10,18,0.44)',
    },
  }

  const tracks = [
    {
      key: 'raid' as const,
      ramp: RAMP.raid,
      label: 'Raid Party',
      sub: 'who fights',
      accent: raidAccent,
      party: roster.filter(c => c.raidSlot != null).sort((a, b) => a.raidSlot! - b.raidSlot!),
      slotOf: (c: CrewMember) => c.raidSlot ?? 0,
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="M19 21 3 5" />
        </svg>
      ),
    },
    {
      key: 'voyage' as const,
      ramp: RAMP.voyage,
      label: 'Voyage Party',
      sub: 'who sails',
      accent: voyageAccent,
      party: roster.filter(c => c.voyageSlot != null).sort((a, b) => a.voyageSlot! - b.voyageSlot!),
      slotOf: (c: CrewMember) => c.voyageSlot ?? 0,
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="5" r="2" /><path d="M12 22V7" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" /><path d="M8 7h8" />
        </svg>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {tracks.map(t => {
        const totals = partyTotals(t.party, t.slotOf)
        const seated = new Map(t.party.map(c => [t.slotOf(c), c]))
        return (
          <div key={t.key} style={{
            borderRadius: 16,
            border: `1px solid ${t.accent}55`,
            position: 'relative',
            // Front to back: the track's accent tint, a light wash so text
            // holds up, the plate, then the flat base. `cover` fits a square
            // plate to a portrait panel by height, so the whole image runs top
            // to bottom - sky, then the ship, then open water - which is what
            // full-bleed wants. Base colour is space-joined onto the last
            // layer rather than added as a bare comma layer.
            background: `linear-gradient(180deg, ${t.accent}1c 0%, ${t.accent}0a 55%, transparent 100%), `
              + `linear-gradient(180deg, rgba(${t.ramp.fade},0.34) 0%, rgba(${t.ramp.fade},0.46) 45%, rgba(${t.ramp.fade},0.58) 100%), `
              + `url(${t.ramp.art}) center / cover no-repeat ${t.ramp.base}`,
            overflow: 'hidden',
          }}>
            {/* Header: who this party is, and what it comes to. */}
            <div style={{ position: 'relative', zIndex: 1, padding: '0.8rem 0.85rem 0.7rem', borderBottom: `1px solid ${t.accent}2a` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <span style={{ color: t.accent, display: 'flex' }}>{t.icon}</span>
                <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8', lineHeight: 1.1 }}>{t.label}</p>
                <span className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#9aa3b1' }}>{t.sub}</span>
                <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ marginLeft: 'auto', fontSize: '0.66rem', color: t.accent }}>
                  {t.party.length}/{shipCrewSlots}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {([['power', 'PWR'], ['dodge', 'SAV'], ['fortune', 'FTN']] as const).map(([k, label]) => (
                  <div key={k} style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5,
                    padding: '0.35rem 0.3rem', borderRadius: 9,
                    background: t.ramp.stat, border: '1px solid rgba(255,255,255,0.10)',
                  }}>
                    <span className="font-cinzel font-800" style={{ fontSize: '1.2rem', lineHeight: 1, color: STAT_COLOR[k], fontVariantNumeric: 'tabular-nums' }}>{totals[k]}</span>
                    <span className="font-karla font-800 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.12em', color: '#9aa3b1' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Seats. Always six: filled, open, or locked behind the hull. */}
            <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7, padding: '0.75rem 0.85rem 0.9rem' }}>
              {Array.from({ length: MAX_SEATS }, (_, i) => {
                const crew = seated.get(i)
                const locked = i >= shipCrewSlots
                const captain = i === 0
                const held = crew ? (atSea.has(crew.id) ? 'At sea' : trawling.has(crew.id) ? 'Trawling' : null) : null

                if (locked) {
                  return (
                    <div key={i} title="Upgrade your ship to open this seat" style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                      minHeight: 104, borderRadius: 12,
                      border: '1px dashed rgba(255,255,255,0.1)',
                      background: t.ramp.locked,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5c6470" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: '#6b7482', textAlign: 'center', lineHeight: 1.3 }}>Bigger<br />ship</span>
                    </div>
                  )
                }

                if (!crew) {
                  return (
                    <button key={i} type="button" onClick={() => onPickSeat(t.key, i)}
                      aria-label={`Open seat ${i + 1} on the ${t.label}. Tap to assign a crew.`}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                        minHeight: 104, borderRadius: 12, cursor: 'pointer', font: 'inherit',
                        border: `1.5px dashed ${OPEN_SEAT}66`,
                        background: `linear-gradient(180deg, ${OPEN_SEAT}14 0%, ${OPEN_SEAT}08 100%), ${t.ramp.open}`,
                        touchAction: 'manipulation',
                      }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 26, height: 26, borderRadius: '50%',
                        background: `${OPEN_SEAT}22`, border: `1.5px solid ${OPEN_SEAT}aa`,
                        color: OPEN_SEAT, fontSize: '1.1rem', lineHeight: 1,
                      }}>+</span>
                      <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: OPEN_SEAT }}>
                        {captain ? 'Captain' : 'Open seat'}
                      </span>
                    </button>
                  )
                }

                const e = effectiveStats(crew)
                const rc = RARITY_COLORS[crew.rarity as CrewRarity] ?? '#8a857c'
                return (
                  <button key={i} type="button" onClick={() => onTapCrew(crew)}
                    aria-label={`${crew.name}, seat ${i + 1}. Tap to view, swap or remove them.`}
                    style={{
                      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      minHeight: 104, padding: '0.4rem 0.3rem 0.45rem', borderRadius: 12,
                      cursor: 'pointer', font: 'inherit', textAlign: 'center',
                      // Rarity, not the track accent. The panel art already
                      // says which party this is; the seat is the only place
                      // that can say WHO is sitting in it at a glance.
                      border: `1.5px solid ${rc}99`,
                      background: `linear-gradient(180deg, ${rc}26 0%, rgba(0,0,0,0.22) 100%), ${t.ramp.seat}`,
                      touchAction: 'manipulation',
                    }}>
                    {/* The art is the tile. */}
                    <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={artSrc(crew.filename)} alt="" aria-hidden loading="lazy" decoding="async"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: `drop-shadow(0 3px 8px ${rc}66)` }} />
                    </div>
                    <span className="font-karla font-700" style={{ display: 'block', width: '100%', fontSize: '0.7rem', lineHeight: 1.15, color: '#eee8de', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {crew.name}
                    </span>
                    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#a9a29a', fontVariantNumeric: 'tabular-nums' }}>
                      {e.power} · {e.dodge} · {e.fortune}
                    </span>
                    {captain && (
                      <span aria-label="Captain" title="Captain" style={{ position: 'absolute', top: 3, left: 4, display: 'flex', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.85))' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#e8c46a" stroke="#7a5c1c" strokeWidth="1" strokeLinejoin="round" aria-hidden><path d="M3 8l4 3.5L12 5l5 6.5L21 8l-1.6 10.2a1 1 0 0 1-1 .8H5.6a1 1 0 0 1-1-.8L3 8z" /></svg>
                      </span>
                    )}
                    {held && (
                      <span className="font-karla font-800 uppercase" style={{ position: 'absolute', top: 3, right: 4, fontSize: '0.5rem', letterSpacing: '0.08em', color: '#0b1016', background: 'rgba(206,218,232,0.9)', borderRadius: 4, padding: '0.06rem 0.22rem' }}>{held}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function AssignHint({ children }: { children: ReactNode }) {
  return <p className="font-karla" style={{ fontSize: '0.68rem', color: '#8a8480', lineHeight: 1.45 }}>{children}</p>
}
