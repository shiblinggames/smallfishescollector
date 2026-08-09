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

import { useState, type ReactNode } from 'react'
import { applyLevelBonuses } from '@/lib/crewLevel'
import { netTraitStats } from '@/lib/crewEffects'
import { RARITY_COLORS, type CrewRarity } from '@/lib/crewGen'
import { CREW_PANEL_BG } from '@/lib/crewPanel'
import { getCrewSkinByFilename, skinArtGlow } from '@/lib/crewSkins'
import { ChaseSkinFx } from '@/components/ChaseSkinFx'
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

/** WHAT THE NUMBER ACTUALLY DOES, per track, in the plainest words that are
 *  still true. Taken from the code that reads each stat — raidDamageProfile and
 *  the dodge contest for the campaign, raidLoot's fortuneMult and
 *  fortuneDoubloonMult for its drops, outcomeChances /
 *  computeVoyageDurationMs / fortuneScale for voyages — so nothing here is a
 *  plausible-sounding guess.
 *
 *  No metaphors. "How hard your broadsides land" sounds like flavour text and
 *  leaves a player still wondering what the number does; "how much damage you
 *  deal" is the same fact and needs no decoding. */
const STAT_MEANING: Record<'raid' | 'voyage', Record<'power' | 'dodge' | 'fortune', string>> = {
  raid: {
    power:   'How much damage you deal.',
    dodge:   'How often you dodge enemy attacks.',
    fortune: 'Your chance at better loot and more doubloons.',
  },
  voyage: {
    power:   'Your chance of a successful voyage.',
    dodge:   'How fast the voyage finishes.',
    fortune: 'How many doubloons you bring home.',
  },
}

/** Every party is drawn to SIX seats. Anything past the hull's capacity shows
 *  locked rather than vanishing, so the ship upgrade has something to unlock
 *  into and the ceiling is legible before you pay for it. */
const MAX_SEATS = 6

/** Empty seats have no crew, so they have no rarity to inherit. Warm neutral
 *  rather than the track accent: the header art carries the party's identity,
 *  so an empty seat glowing red or blue was the last thing making the seat row
 *  look track-coloured. Translucent tints only, never a solid fill. */
const OPEN_SEAT = '#c3b291'

/** One crew's line in the breakdown: what they bring, what the seat pays it at,
 *  and what that comes to. The seat multiplier is the part nobody can see from
 *  the grid, and it is the whole reason the totals are not a plain sum. */
function ContribRow({ crew, slot, accent }: { crew: CrewMember; slot: number; accent: string }) {
  const e = effectiveStats(crew)
  const m = slotMult(slot)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.3rem 0' }}>
      <span className="font-pirata" style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', lineHeight: 1.12, letterSpacing: '0.02em', color: '#e4dccd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {crew.name}
      </span>
      <span className="font-karla font-700" style={{ flexShrink: 0, fontSize: '0.54rem', color: slot === 0 ? accent : '#7d8894', letterSpacing: '0.06em' }}>
        {slot === 0 ? 'CAPTAIN ×1' : '×0.8'}
      </span>
      {(['power', 'dodge', 'fortune'] as const).map(k => (
        <span key={k} className="font-karla font-700" style={{ flexShrink: 0, width: 30, textAlign: 'right', fontSize: '0.72rem', color: STAT_COLOR[k], fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(e[k] * m)}
        </span>
      ))}
    </div>
  )
}

export default function AssignBoard({
  roster, shipCrewSlots, lockedCrewIds, trawlingCrewIds, bunkedCrewIds = [], artSrc,
  onPickSeat, onTapCrew, onClearParty, clearing, raidAccent, voyageAccent,
}: {
  roster: CrewMember[]
  shipCrewSlots: number
  lockedCrewIds: number[]
  trawlingCrewIds: number[]
  /** Holding a Crew Hall bunk. A seat and a bunk CAN overlap: a finished stint
   *  no longer blocks reassignment, so a hand can be seated while still owed
   *  their training. The seat has to say so or the hall looks like it lost them. */
  bunkedCrewIds?: number[]
  artSrc: (filename: string) => string
  /** Open the picker for ONE specific seat. Used by empty seats and by the
   *  swap pip on a filled one - assigning to an occupied slot already benches
   *  whoever holds it (applyAssignment step 1), so picking IS the swap. */
  onPickSeat: (track: 'raid' | 'voyage', slot: number) => void
  /** Tapping a seated crew - opens their detail, which owns swap + remove. */
  onTapCrew: (crew: CrewMember) => void
  /** Empty a whole party. The parent owns the confirm and the refusals. */
  onClearParty: (track: 'raid' | 'voyage') => void
  /** Which track is mid-clear, so its button can say so. */
  clearing: 'raid' | 'voyage' | null
  raidAccent: string
  voyageAccent: string
}) {
  const [openBreakdown, setOpenBreakdown] = useState<'raid' | 'voyage' | null>(null)
  /** Which party's clear button is armed. Two taps, because one stray tap
   *  should not empty six seats — and disarmed whenever the panel closes, so
   *  it can never sit armed behind a collapsed accordion. */
  const [armed, setArmed] = useState<'raid' | 'voyage' | null>(null)
  const atSea = new Set(lockedCrewIds)
  const trawling = new Set(trawlingCrewIds)
  const training = new Set(bunkedCrewIds)

  // The art used to run FULL BLEED behind the whole panel, seats included, with
  // every tile translucent so the plate read through them. It made the part you
  // actually operate — six tiles, each already carrying a portrait, a rarity
  // border, a name, three numbers and up to two badges — sit on top of a moving
  // sea. Too much competing for the same square inch.
  //
  // So the art is now a HEADER plate only: it identifies the party and backs the
  // totals, which is the job it was doing well. Below the divider the seats sit
  // on the plain crew plate, the same one the roster cards use, because they are
  // the same kind of object and the roster reads calm for exactly this reason.
  //
  // `base` is the flat colour under the jpg (it shows for the moment before the
  // image lands, and through the wash). `hdr` is the scrim over it: top value
  // where the title sits, bottom where the stat tiles do.
  // NO PHOTOGRAPHY IN THE HEADERS. Two different plates behind two panels that
  // do the same job read as two designs, and once they were normalised to one
  // treatment the art stopped saying anything the label did not already say —
  // it was just texture behind text, and texture the seats had to compete with.
  //
  // The identity is carried by the things that CANNOT be mistaken instead: a
  // red panel with crossed swords is the fighting party, a blue one with a helm
  // is the sailing party, and the accent runs through the border, the rail, the
  // icon and the count. Colour and symbol, not scenery.
  const STAT_TINT = 'rgba(0,0,0,0.30)'
  const tracks = [
    {
      key: 'raid' as const,
      label: 'Campaign Party',
      sub: 'crew for raids and gauntlets',
      accent: raidAccent,
      party: roster.filter(c => c.raidSlot != null).sort((a, b) => a.raidSlot! - b.raidSlot!),
      slotOf: (c: CrewMember) => c.raidSlot ?? 0,
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="M19 21 3 5" />
        </svg>
      ),
    },
    {
      key: 'voyage' as const,
      label: 'Voyage Party',
      sub: 'crew for passive exploration',
      accent: voyageAccent,
      party: roster.filter(c => c.voyageSlot != null).sort((a, b) => a.voyageSlot! - b.voyageSlot!),
      slotOf: (c: CrewMember) => c.voyageSlot ?? 0,
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
            background: CREW_PANEL_BG,
            overflow: 'hidden',
          }}>
            {/* Header: who this party is, and what it comes to. The art lives
                HERE and nowhere else. Front to back: the track's accent tint, a
                wash so the title and totals hold up, the plate, then the flat
                base under it. */}
            <button type="button"
              onClick={() => { setArmed(null); setOpenBreakdown(o => (o === t.key ? null : t.key)) }}
              aria-expanded={openBreakdown === t.key}
              aria-label={`${t.label} totals. Tap for the breakdown.`}
              style={{
              position: 'relative', zIndex: 1, width: '100%', display: 'block', textAlign: 'left',
              padding: '0.8rem 0.85rem 0.7rem', font: 'inherit', cursor: 'pointer',
              border: 'none', borderBottom: `1px solid ${t.accent}33`,
              background: `linear-gradient(180deg, ${t.accent}26 0%, ${t.accent}0d 100%)`,
              touchAction: 'manipulation',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                <span style={{
                  flexShrink: 0, width: 34, height: 34, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${t.accent}1f`, border: `1px solid ${t.accent}66`, color: t.accent,
                }}>{t.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4efe6', lineHeight: 1.1 }}>{t.label}</p>
                  <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: `${t.accent}cc`, marginTop: 1 }}>{t.sub}</p>
                </span>
                <span className="font-karla font-800" style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '0.8rem', color: t.accent, fontVariantNumeric: 'tabular-nums' }}>
                  {t.party.length}/{shipCrewSlots}
                </span>
                {/* The affordance. A totals row that does something has to look
                    like it does something. */}
                <span aria-hidden style={{
                  flexShrink: 0, display: 'flex', color: `${t.accent}cc`,
                  transform: openBreakdown === t.key ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.18s ease',
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {([['power', 'PWR'], ['dodge', 'SAV'], ['fortune', 'FTN']] as const).map(([k, label]) => (
                  <div key={k} style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5,
                    padding: '0.35rem 0.3rem', borderRadius: 9,
                    background: STAT_TINT, border: `1px solid ${t.accent}26`,
                  }}>
                    <span className="font-cinzel font-800" style={{ fontSize: '1.2rem', lineHeight: 1, color: STAT_COLOR[k], fontVariantNumeric: 'tabular-nums' }}>{totals[k]}</span>
                    <span className="font-karla font-800 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.12em', color: '#9aa3b1' }}>{label}</span>
                  </div>
                ))}
              </div>
            </button>

            {/* THE ARITHMETIC, on tap. The totals above are the only numbers on
                this screen a captain cannot check, because the seat multiplier
                is invisible: a party of six does NOT add up to the sum of six
                crews. Rather than explain that in prose, show the sum. */}
            {openBreakdown === t.key && (
              <div style={{ position: 'relative', zIndex: 1, padding: '0.6rem 0.85rem 0.75rem', borderBottom: `1px solid ${t.accent}22`, background: 'rgba(0,0,0,0.22)' }}>
                {t.party.length === 0 ? (
                  <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a8480', lineHeight: 1.5 }}>
                    No one seated yet. Everyone you add here raises the three numbers above.
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ flex: 1 }} />
                      {(['PWR', 'SAV', 'FTN'] as const).map(l => (
                        <span key={l} className="font-karla font-800 uppercase" style={{ flexShrink: 0, width: 30, textAlign: 'right', fontSize: '0.54rem', letterSpacing: '0.1em', color: '#7d8894' }}>{l}</span>
                      ))}
                    </div>
                    {t.party.map(c => (
                      <ContribRow key={c.id} crew={c} slot={t.slotOf(c)} accent={t.accent} />
                    ))}
                    {/* The line that proves the header. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 5, marginTop: 2, borderTop: `1px solid ${t.accent}44` }}>
                      <span className="font-karla font-800 uppercase" style={{ flex: 1, fontSize: '0.58rem', letterSpacing: '0.1em', color: t.accent }}>Total</span>
                      {(['power', 'dodge', 'fortune'] as const).map(k => (
                        <span key={k} className="font-karla font-800" style={{ flexShrink: 0, width: 30, textAlign: 'right', fontSize: '0.8rem', color: STAT_COLOR[k], fontVariantNumeric: 'tabular-nums' }}>{totals[k]}</span>
                      ))}
                    </div>

                    {/* And what those three numbers BUY, in this track. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 9 }}>
                      {([['power', 'Power'], ['dodge', 'Savvy'], ['fortune', 'Fortune']] as const).map(([k, label]) => (
                        <p key={k} className="font-karla" style={{ fontSize: '0.68rem', color: '#948d85', lineHeight: 1.45 }}>
                          <span className="font-700" style={{ color: STAT_COLOR[k] }}>{label}</span>
                          {' — '}{STAT_MEANING[t.key][k]}
                        </p>
                      ))}
                      <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7d7770', lineHeight: 1.45, marginTop: 2 }}>
                        The first seat is your captain and counts fully. Everyone else counts for 80%, so the total is a little less than adding them up.
                      </p>
                    </div>

                    {/* Emptying a party was six taps through a confirm each. It
                        lives at the foot of the breakdown rather than in the
                        header because the header is itself a button (a nested
                        one is invalid), and because reading who is seated is
                        the right thing to do immediately before clearing them. */}
                    <button type="button" disabled={clearing === t.key}
                      onClick={() => {
                        if (armed === t.key) { setArmed(null); onClearParty(t.key) }
                        else setArmed(t.key)
                      }}
                      className="font-karla font-700"
                      style={{
                        display: 'inline-block', marginTop: 11, padding: '0.4rem 0.7rem',
                        borderRadius: 8, fontSize: '0.68rem', letterSpacing: '0.02em',
                        border: `1px solid rgba(224,124,124,${armed === t.key ? 0.75 : 0.4})`,
                        background: `rgba(224,124,124,${armed === t.key ? 0.2 : 0.1})`,
                        color: clearing === t.key ? '#8a8480' : '#e0a0a0',
                        cursor: clearing === t.key ? 'default' : 'pointer',
                        touchAction: 'manipulation', transition: 'background 0.15s ease, border-color 0.15s ease',
                      }}>
                      {clearing === t.key ? 'Standing them down…'
                        : armed === t.key ? 'Tap again to confirm'
                        : `Remove all ${t.party.length}`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Seats. Always six: filled, open, or locked behind the hull. */}
            <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7, padding: '0.75rem 0.85rem 0.9rem' }}>
              {Array.from({ length: MAX_SEATS }, (_, i) => {
                const crew = seated.get(i)
                const locked = i >= shipCrewSlots
                const captain = i === 0
                const held = crew
                  ? atSea.has(crew.id) ? 'At sea'
                  : trawling.has(crew.id) ? 'Trawling'
                  : training.has(crew.id) ? 'Training'
                  : null
                  : null

                if (locked) {
                  return (
                    <div key={i} title="Upgrade your ship to open this seat" style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                      minHeight: 104, borderRadius: 12,
                      border: '1px dashed rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.028)',
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
                        border: `1px dashed ${OPEN_SEAT}4d`,
                        background: `radial-gradient(120% 80% at 50% 100%, ${OPEN_SEAT}16 0%, rgba(255,255,255,0) 70%)`,
                        boxShadow: `inset 0 -1px 0 ${OPEN_SEAT}30, inset 0 8px 14px -10px rgba(0,0,0,0.75)`,
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

                const rc = RARITY_COLORS[crew.rarity as CrewRarity] ?? '#8a857c'
                // THE SKIN'S OWN COLOUR, not the rarity's. A crew wearing a
                // chase skin has bought an animated aura in ITS palette, and the
                // seat was painting a flat rarity glow over all of it — so the
                // one screen where you look at your whole party showed the least
                // of what you are actually wearing. Falls back to rarity when no
                // skin is equipped, which is what the base art wants anyway.
                const skin = getCrewSkinByFilename(crew.filename)
                const chase = skin?.chase === true
                const artColor = skin?.color ?? rc
                return (
                  <button key={i} type="button" onClick={() => onTapCrew(crew)}
                    aria-label={`${crew.name}, seat ${i + 1}. Tap to view, swap or remove them.`}
                    style={{
                      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      minHeight: 104, padding: '0.4rem 0.3rem 0.45rem', borderRadius: 12,
                      cursor: 'pointer', font: 'inherit', textAlign: 'center',
                      // Rarity, not the track accent. The header art already
                      // says which party this is; the seat is the only place
                      // that can say WHO is sitting in it at a glance.
                      // Rarity lives in the BORDER and the portrait's glow, not
                      // in a tinted plate. Six seats each washing themselves a
                      // different colour put up to six palettes inside one card
                      // and fought the header for attention; the roster reads
                      // calm because its cards share one plate, and this is the
                      // same kind of object.
                      // A SEAT, NOT A CARD. The boxed rarity border drew a hard
                      // square around every hand and turned a row of seats into a
                      // row of trading cards. The well below reads as somewhere a
                      // crew is STANDING; rarity survives as the glow under the
                      // portrait, which sits on the crew rather than around them.
                      border: '1px solid transparent',
                      // The seat is a shallow well with a FLOOR: light pooling up
                      // from the base, a hairline where that floor sits, and an
                      // inset lip so the whole thing is scooped into the panel
                      // rather than laid on it.
                      background: 'radial-gradient(120% 80% at 50% 100%, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0) 70%)',
                      boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.09), inset 0 8px 14px -10px rgba(0,0,0,0.85)',
                      touchAction: 'manipulation',
                    }}>
                    {/* The art IS the seat. Bigger now the stat line and the
                        border are gone: the numbers are one tap away on the
                        crew's own card, and six of them tiled here made a
                        spreadsheet out of what should be a row of portraits. */}
                    <div style={{ position: 'relative', width: '100%', height: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {/* CONTACT SHADOW. The one cue that says a crew is STANDING
                          on something rather than floating in a box: a soft
                          ellipse pooled under the feet, tinted by their rarity so
                          it still belongs to them. */}
                      <span aria-hidden style={{
                        position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)',
                        width: '62%', height: 9, borderRadius: '50%',
                        background: `radial-gradient(closest-side, rgba(0,0,0,0.62) 0%, ${artColor}22 60%, rgba(0,0,0,0) 100%)`,
                        pointerEvents: 'none',
                      }} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={artSrc(crew.filename)} alt="" aria-hidden decoding="async"
                        className={chase ? 'chase-skin-glow' : undefined}
                        style={{
                          position: 'relative', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                          ...(chase
                            ? { ['--chase-c']: artColor }
                            : { filter: skin
                                ? skinArtGlow(artColor, crew.rarity)
                                : `drop-shadow(0 3px 7px ${rc}77)` }),
                        } as React.CSSProperties} />
                      {chase && <ChaseSkinFx skinId={skin?.id} color={artColor} />}
                    </div>
                    {/* Pirata, like every other place a crew is named — the
                        detail modal and the roster card both use it, and the
                        seats were the one screen calling them something else.
                        lineHeight 1.12 rather than 1: the ellipsis clip makes
                        the box exactly cap height at 1, which shaves the
                        descenders off Jelly, Doby and Gar. */}
                    <span className="font-pirata" style={{ display: 'block', width: '100%', fontSize: '0.86rem', lineHeight: 1.12, letterSpacing: '0.02em', color: '#ecdcbd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {crew.name}
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
