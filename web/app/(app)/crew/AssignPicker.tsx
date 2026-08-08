'use client'

/** FILL AN OPEN SEAT.
 *
 *  Art-forward, three across, in the same language as the assign board it opens
 *  from. It shows the WHOLE roster rather than only the bench, because "why
 *  isn't so-and-so in this list" is a worse question than "why is so-and-so
 *  greyed out" — the second one answers itself.
 *
 *  Two things it refuses to let you do quietly:
 *
 *  - Crew out on a trawl or at sea on a live voyage are locked. They cannot be
 *    reassigned server-side either, so offering the tap would just produce an
 *    error after the fact.
 *  - Assigning a SECOND copy of a card already on this track benches the first
 *    (applyAssignment does this deliberately), which spends your tap and leaves
 *    the seat you were filling still open. That is occasionally what you want,
 *    so it is a warning rather than a block.
 */

import { useState } from 'react'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { effectiveStats } from './AssignBoard'
import { getCrewSkinByFilename, skinArtGlow } from '@/lib/crewSkins'
import type { CrewMember } from './actions'

const RARITY_DIM = 'rgba(255,255,255,0.14)'

/** Sorts, in the order a raid actually cares about them. Power first because
 *  it is the damage stat; Savvy is the dodge roll; Fortune drives loot. Level
 *  is here because the class Special does not unlock until Lv 10, so "who is
 *  furthest along" is a real question when filling a seat. */
const SORTS = [
  { k: 'power'   as const, label: 'Power',   color: '#e08a7a' },
  { k: 'dodge'   as const, label: 'Savvy',   color: '#7fc4a8' },
  { k: 'fortune' as const, label: 'Fortune', color: '#e0c47a' },
  { k: 'level'   as const, label: 'Level',   color: '#e0b062' },
]

export default function AssignPicker({
  track, label, roster, lockedCrewIds, trawlingCrewIds, bunkedCrewIds, artSrc,
  pending, busyId, accent, rarityColor, onPick, onClose,
}: {
  track: 'raid' | 'voyage'
  label: string
  roster: CrewMember[]
  lockedCrewIds: number[]
  trawlingCrewIds: number[]
  /** Mid-stint in the Crew Hall. Locked the same way a trawl locks. */
  bunkedCrewIds: number[]
  artSrc: (filename: string) => string
  pending: boolean
  busyId: number | string | null
  accent: string
  rarityColor: (rarity: number) => string
  onPick: (crew: CrewMember) => void
  onClose: () => void
}) {
  // Default sort is the stat the TRACK cares about: damage for a raid seat,
  // payout for a voyage one.
  const [sort, setSort] = useState<'power' | 'dodge' | 'fortune' | 'level'>(track === 'raid' ? 'power' : 'fortune')
  const [who, setWho] = useState<'all' | 'free' | 'other'>('all')

  const atSea = new Set(lockedCrewIds)
  const trawling = new Set(trawlingCrewIds)
  const training = new Set(bunkedCrewIds)
  const slotOf = (c: CrewMember) => (track === 'raid' ? c.raidSlot : c.voyageSlot)
  const otherSlotOf = (c: CrewMember) => (track === 'raid' ? c.voyageSlot : c.raidSlot)
  const otherLabel = track === 'raid' ? 'On voyage duty' : 'In raid party'
  const otherChip  = track === 'raid' ? 'On voyage' : 'In raid'

  // Already seated on THIS track — nothing to pick, they are the seats.
  const seatedHere = roster.filter(c => slotOf(c) != null)
  const seatedCardIds = new Map(seatedHere.map(c => [c.cardId, c]))
  const choices = roster.filter(c => slotOf(c) == null)

  const allRows = choices.map(c => {
    const locked = trawling.has(c.id) ? 'Out trawling' : atSea.has(c.id) ? 'At sea' : training.has(c.id) ? 'Training' : null
    const dupe = seatedCardIds.get(c.cardId) ?? null
    const elsewhere = otherSlotOf(c) != null
    // The SAME numbers the assign board prints on its seats: level bonuses and
    // the crew's trait folded in. Sorting on anything else would rank the grid
    // by figures it isn't showing.
    return { crew: c, locked, dupe, elsewhere, eff: effectiveStats(c), level: crewLevelFromXP(c.xp) }
  })

  const rows = allRows
    .filter(r => who === 'all' ? true : who === 'other' ? r.elsewhere : !r.elsewhere && !r.locked)
    .sort((a, b) => (sort === 'level' ? b.level - a.level : b.eff[sort] - a.eff[sort]))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(2,6,12,0.72)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '84vh', display: 'flex', flexDirection: 'column', background: 'rgba(10,15,23,0.99)', borderTop: `2px solid ${accent}`, borderRadius: '18px 18px 0 0', boxShadow: '0 -12px 44px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '1rem 1rem 0.8rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.56rem', color: accent }}>Fill an open seat</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1.1 }}>Assign to {label}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="tap" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e0ddd8', cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Sort + filter, same chip language as the trawl sheet so picking a
            hand feels identical wherever you do it. Hidden when there is
            nothing to sort. */}
        {allRows.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 1rem 0.7rem' }}>
            {([
              { key: 'sort' as const, value: sort, set: setSort as (v: string) => void, opts: SORTS },
              { key: 'who' as const, value: who, set: setWho as (v: string) => void, opts: [
                { k: 'all', label: 'All', color: '#bcb29a' },
                { k: 'free', label: 'Free', color: '#bcb29a' },
                { k: 'other', label: otherChip, color: track === 'raid' ? '#5fa8c9' : '#e07c7c' },
              ] },
            ]).map(group => (
              <div key={group.key} style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                {group.opts.map(o => {
                  const on = group.value === o.k
                  return (
                    <button key={o.k} type="button" onClick={() => group.set(o.k)}
                      className="font-karla font-700 uppercase tracking-[0.06em]"
                      aria-pressed={on}
                      style={{
                        padding: '0.28rem 0.55rem', borderRadius: 999, fontSize: '0.56rem',
                        background: on ? `${o.color}26` : 'transparent',
                        border: `1px solid ${on ? `${o.color}88` : 'transparent'}`,
                        color: on ? o.color : 'rgba(255,255,255,0.5)',
                        cursor: 'pointer', whiteSpace: 'nowrap', touchAction: 'manipulation',
                      }}>
                      {o.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <div className="scrollbar-hide" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 1rem 1.4rem' }}>
          {rows.length === 0 ? (
            <p className="font-karla text-center" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.55, padding: '1.6rem 0.5rem' }}>
              {allRows.length === 0
                ? 'Every hand you own is already on this party. Recruit more to grow your fleet.'
                : 'No crew match that filter.'}
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {rows.map(({ crew: m, locked, dupe, elsewhere, eff, level }) => {
                const busy = busyId === m.id
                const rc = rarityColor(m.rarity) || RARITY_DIM
                // Same rule as the seat they are about to sit in: the skin's own
                // colour when one is worn. Chase animation stays off HERE — this
                // is a dense scrolling list of the whole roster and a screenful
                // of competing auras would be noise, not reward.
                const pSkin = getCrewSkinByFilename(m.filename)
                const pColor = pSkin?.color ?? rc
                const disabled = !!locked || pending
                // The note under the name, in the order that matters: a hard
                // block first, then the thing that costs you a seat, then a
                // simple move.
                const note = locked ?? (dupe ? `Replaces ${dupe.name}` : elsewhere ? otherLabel : null)
                const noteColor = locked ? '#8b93a0' : dupe ? '#e0b062' : elsewhere ? '#9aa3b1' : null
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(m)}
                    aria-label={`${m.name}${note ? `, ${note}` : ''}${locked ? '' : '. Tap to assign.'}`}
                    className="tap"
                    style={{
                      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '0.5rem 0.35rem 0.5rem', borderRadius: 12, textAlign: 'center',
                      background: busy ? `${accent}26` : 'rgba(20,27,38,0.96)',
                      border: `1px solid ${busy ? accent : dupe ? 'rgba(224,176,98,0.5)' : `${rc}66`}`,
                      cursor: disabled ? 'not-allowed' : 'pointer', font: 'inherit',
                      opacity: locked ? 0.42 : pending && !busy ? 0.55 : 1,
                      touchAction: 'manipulation',
                    }}
                  >
                    <div style={{ width: '100%', height: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={artSrc(m.filename)} alt="" aria-hidden loading="lazy" decoding="async"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: locked ? 'grayscale(0.85) brightness(0.75)' : pSkin ? skinArtGlow(pColor, m.rarity) : `drop-shadow(0 3px 8px ${rc}55)` }} />
                      {locked && (
                        <span aria-hidden style={{ position: 'absolute', top: 6, right: 6, display: 'flex' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c3cad6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        </span>
                      )}
                    </div>
                    <span className="font-pirata" style={{ display: 'block', width: '100%', fontSize: '0.86rem', lineHeight: 1.12, letterSpacing: '0.02em', color: '#ecdcbd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {busy ? '…' : m.name}
                    </span>
                    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#a9a29a', fontVariantNumeric: 'tabular-nums' }}>
                      {/* Effective, so the grid agrees with what it is sorted
                          by and with the seats on the board behind it. The
                          sorted stat is picked out so the order is legible. */}
                      {(['power', 'dodge', 'fortune'] as const).map((k, i) => (
                        <span key={k} style={{ color: sort === k ? SORTS.find(x => x.k === k)!.color : undefined }}>
                          {i > 0 ? ' · ' : ''}{eff[k]}
                        </span>
                      ))}
                      <span style={{ marginLeft: 6, color: sort === 'level' ? '#e0b062' : 'rgba(255,255,255,0.35)' }}>Lv {level}</span>
                    </span>
                    {note && (
                      <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ display: 'block', width: '100%', fontSize: '0.5rem', lineHeight: 1.2, color: noteColor ?? '#9aa3b1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {note}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Said once, under the grid, rather than repeated on every tile. */}
          {rows.some(r => r.dupe) && (
            <p className="font-karla" style={{ fontSize: '0.64rem', color: '#c9a05e', lineHeight: 1.45, marginTop: 12, textAlign: 'center' }}>
              A crew marked <span style={{ color: '#e0b062' }}>Replaces</span> is already on this party as another copy. Assigning them benches the one aboard, so the seat stays open.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
