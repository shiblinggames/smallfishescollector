'use client'

/**
 * TWO HANDS, FACING EACH OTHER.
 *
 * The roster's hardest question is "who do I let go", and players were doing it
 * by hand: adding three stats per card, then trying to guess whether a Lv 1 with
 * good numbers beats a Lv 17 with worse ones. The sorts answer it for a whole
 * roster; this answers it for the two you are actually torn between.
 *
 * WHAT THE PICTURE SAYS WITHOUT WORDS. Each stat is one bar per crew, meeting at
 * a centre line. The SOLID length is what they are today; the faint length
 * behind it is what they reach at Lv 100. So a young hand with a long ghost and
 * a veteran with almost none read instantly, before any number is parsed.
 *
 * WHY NOT A RADAR. Tried it first. Three axes is the natural shape for three
 * stats, but at real values the polygons sit in a knot in the middle of their
 * own frame, and two overlapping translucent triangles on a phone is a puzzle
 * rather than an answer. Facing bars are legible at a glance and scale down.
 *
 * WHY NOT A GROWTH CURVE. Also tried. Level bonuses scale off each crew's own
 * stat affinity, so two hands diverge as they level but never swap: across every
 * pair on a real 21-hand roster, whoever leads at Lv 1 leads at Lv 100. A chart
 * promising a crossover would have had nothing to show. The interesting number
 * is not when they cross, it is how much of today's lead is borrowed from XP.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import { vibrate } from '@/lib/haptics'
import { applyCrewEffects, netTraitStats, traitLabel, traitKind, isDivineTrait } from '@/lib/crewEffects'
import { crewLevelFromXP, CREW_MAX_LEVEL, XP_TABLE as CREW_XP_TABLE } from '@/lib/crewLevel'
import { RARITY_NAMES, RARITY_COLORS, type CrewRarity } from '@/lib/crewGen'
import { classForSlug, CLASSES } from '@/lib/crewClasses'
import type { CrewMember } from './actions'

const MAX_LEVEL_XP = CREW_XP_TABLE[CREW_MAX_LEVEL - 1]
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (f: string) => `${SUPA}/storage/v1/object/public/card-arts/${f}`

const STATS = [
  { k: 'power' as const, label: 'Power' },
  { k: 'dodge' as const, label: 'Savvy' },
  { k: 'fortune' as const, label: 'Fortune' },
]

type Side = {
  crew: CrewMember
  color: string
  level: number
  now: { power: number; dodge: number; fortune: number }
  max: { power: number; dodge: number; fortune: number }
  nowTotal: number
  maxTotal: number
}

function sideFor(crew: CrewMember): Side {
  const base = { power: crew.power, dodge: crew.dodge, fortune: crew.fortune }
  const now = applyCrewEffects(base, crew.effects, crew.xp)
  const max = applyCrewEffects(base, crew.effects, MAX_LEVEL_XP)
  return {
    crew,
    color: RARITY_COLORS[(crew.rarity as CrewRarity)] ?? '#8a857c',
    level: crewLevelFromXP(crew.xp),
    now, max,
    nowTotal: now.power + now.dodge + now.fortune,
    maxTotal: max.power + max.dodge + max.fortune,
  }
}

/**
 * The one sentence the picture cannot say: whether today's lead is EARNED or
 * merely older. Three shapes, and nothing else is worth saying.
 */
function verdict(a: Side, b: Side): string {
  const nowGap = a.nowTotal - b.nowTotal
  const maxGap = a.maxTotal - b.maxTotal
  const lead = nowGap === 0 ? null : nowGap > 0 ? a : b
  const grown = maxGap === 0 ? null : maxGap > 0 ? a : b
  const nA = a.crew.name, nB = b.crew.name

  if (!grown) return `Level them together and there is nothing in it. Keep whichever you like the look of.`
  const winner = grown === a ? nA : nB
  const loser = grown === a ? nB : nA
  const by = Math.abs(maxGap)

  // The lead changes hands once they are level: today's leader is only older.
  if (lead && lead !== grown) {
    const levels = Math.abs(a.level - b.level)
    return `${lead === a ? nA : nB} leads today, but the lead is borrowed: ${levels} level${levels === 1 ? '' : 's'} of it. Level them together and ${winner} wins by ${by}.`
  }
  // Same crew ahead both now and later.
  if (lead === grown) {
    return `${winner} is ahead now and stays ahead, by ${by} once both are maxed. ${loser} does not catch up.`
  }
  // Dead level today, but they grow apart.
  return `Nothing between them today, but they do not grow alike: ${winner} ends ${by} ahead.`
}

function StatRow({ a, b, k, label, levelled, scale }: {
  a: Side; b: Side; k: 'power' | 'dodge' | 'fortune'; label: string; levelled: boolean; scale: number
}) {
  const av = levelled ? a.max[k] : a.now[k]
  const bv = levelled ? b.max[k] : b.now[k]
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`
  const bar = (side: Side, v: number, ghost: number, right: boolean) => (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: right ? 'flex-start' : 'flex-end', position: 'relative', height: 20 }}>
      {/* The ghost is the WHOLE Lv 100 length, drawn behind. Reading "how much
          is left" off the gap is the point of the whole screen. */}
      <span aria-hidden style={{
        position: 'absolute', top: 0, bottom: 0, [right ? 'left' : 'right']: 0,
        width: pct(ghost), borderRadius: 4, background: side.color, opacity: 0.17,
      } as React.CSSProperties} />
      <motion.span aria-hidden
        animate={{ width: pct(v) }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        style={{
          position: 'absolute', top: 0, bottom: 0, [right ? 'left' : 'right']: 0,
          borderRadius: 4, background: side.color,
        } as React.CSSProperties} />
    </div>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="font-karla font-800" style={{ width: 26, textAlign: 'right', fontSize: '0.78rem', color: a.color, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{av}</span>
      {bar(a, av, a.max[k], false)}
      <span className="font-karla font-700 uppercase" style={{ width: 58, textAlign: 'center', fontSize: '0.52rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.42)', flexShrink: 0 }}>{label}</span>
      {bar(b, bv, b.max[k], true)}
      <span className="font-karla font-800" style={{ width: 26, fontSize: '0.78rem', color: b.color, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{bv}</span>
    </div>
  )
}

function Portrait({ side, align }: { side: Side; align: 'left' | 'right' }) {
  const { crew, color, level } = side
  const t = netTraitStats(crew.effects)
  const label = traitLabel(t)
  const kind = traitKind(t)
  const divine = isDivineTrait(t)
  const clsKey = classForSlug(crew.slug ?? '')
  const cls = clsKey ? CLASSES[clsKey] : null
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : 'flex-end', gap: 3 }}>
      <div style={{
        width: 62, height: 62, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        border: `2px solid ${color}`, background: `radial-gradient(circle at 50% 34%, ${color}30, #06050a 74%)`,
        boxShadow: `0 0 16px ${color}44`,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artSrc(crew.filename)} alt="" loading="lazy" decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 32%' }} />
      </div>
      <p className="font-cinzel font-800" style={{ fontSize: '0.86rem', color: '#f4ecd8', lineHeight: 1.15, marginTop: 4, textAlign: align, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {crew.name}
      </p>
      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color, width: '100%', textAlign: align }}>
        {RARITY_NAMES[(crew.rarity as CrewRarity)] ?? 'Common'} · Lv {level}
      </p>
      {cls && (
        <p className="font-karla font-600" style={{ fontSize: '0.56rem', color: cls.color, width: '100%', textAlign: align }}>
          {cls.name}
        </p>
      )}
      {/* A trait costing them points is the thing the stat line hides, so it is
          called out rather than left for the player to decode from a label. */}
      {label && (
        <p className={`font-karla font-700${divine ? ' trait-divine' : ''}`} style={{
          fontSize: '0.56rem', width: '100%', textAlign: align,
          ...(divine ? {} : { color: kind === 'buff' ? '#9fd9b1' : kind === 'flaw' ? '#e09a9a' : 'rgba(255,255,255,0.5)' }),
        }}>
          {label}{kind === 'flaw' ? ' (costing them)' : ''}
        </p>
      )}
    </div>
  )
}

export default function CrewCompare({ a, b, open, onClose }: {
  a: CrewMember | null
  b: CrewMember | null
  open: boolean
  onClose: () => void
}) {
  // The toggle IS the reveal: both sides grow into their faint sections and the
  // shorter one can visibly overtake. Reset each time the sheet opens so the
  // moment is always available rather than spent on the previous pair.
  const [levelled, setLevelled] = useState(false)
  if (!a || !b) return null
  const A = sideFor(a), B = sideFor(b)
  // One shared scale across both crew and both states, or the bars would lie
  // about which is longer the moment the toggle moved.
  const scale = Math.max(1, ...STATS.flatMap(s => [A.max[s.k], B.max[s.k]]))
  const totalA = levelled ? A.maxTotal : A.nowTotal
  const totalB = levelled ? B.maxTotal : B.nowTotal

  return (
    <PopupShell open={open} onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 6 }} transition={{ duration: 0.18 }}
        style={{
          position: 'relative', margin: 'auto', width: '100%', maxWidth: 430,
          background: 'linear-gradient(180deg, rgba(13,21,34,0.99) 0%, rgba(6,10,17,0.99) 100%)',
          border: '1px solid rgba(196,169,106,0.4)', borderRadius: 20,
          padding: '1.1rem 1rem 1.2rem', boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}>
        <CloseButton onClick={onClose} style={{ position: 'absolute', top: 8, right: 10, zIndex: 3 }} />
        <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.2em', color: '#c4a96a', textAlign: 'center', marginBottom: 12 }}>
          Who do I keep?
        </p>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <Portrait side={A} align="left" />
          <span className="font-cinzel font-700" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.28)', alignSelf: 'center', flexShrink: 0 }}>vs</span>
          <Portrait side={B} align="right" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {STATS.map(s => (
            <StatRow key={s.k} a={A} b={B} k={s.k} label={s.label} levelled={levelled} scale={scale} />
          ))}
        </div>

        <p className="font-karla font-600 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.26)', textAlign: 'center', marginTop: 9 }}>
          Solid, what they are · Faint, room left to grow
        </p>

        {/* The totals. Same slot in both states so the eye can watch one number
            move rather than hunting for a new one. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 12 }}>
          <motion.span key={`a-${totalA}`} initial={{ scale: 0.8, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="font-cinzel font-800" style={{ fontSize: '1.55rem', color: totalA >= totalB ? '#fff' : 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
            {totalA}
          </motion.span>
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.4)' }}>
            {levelled ? 'At Lv 100' : 'Today'}
          </span>
          <motion.span key={`b-${totalB}`} initial={{ scale: 0.8, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="font-cinzel font-800" style={{ fontSize: '1.55rem', color: totalB >= totalA ? '#fff' : 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
            {totalB}
          </motion.span>
        </div>

        <button type="button" onClick={() => { setLevelled(v => !v); vibrate(12) }}
          className="font-karla font-700 uppercase tracking-[0.12em] tap active:scale-95"
          style={{
            width: '100%', marginTop: 12, padding: '0.6rem', borderRadius: 12, fontSize: '0.62rem',
            background: levelled ? 'rgba(196,169,106,0.24)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${levelled ? 'rgba(196,169,106,0.7)' : 'rgba(255,255,255,0.2)'}`,
            color: levelled ? '#f4ecd8' : 'rgba(255,255,255,0.75)', cursor: 'pointer',
          }}>
          {levelled ? 'Back to today' : 'Level them together'}
        </button>

        <AnimatePresence mode="wait">
          <motion.p key={levelled ? 'v-max' : 'v-now'}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="font-karla" style={{
              fontSize: '0.72rem', color: '#cfe3dd', lineHeight: 1.5, textAlign: 'center',
              marginTop: 12, padding: '0.6rem 0.7rem', borderRadius: 12,
              background: 'rgba(94,234,212,0.07)', border: '1px solid rgba(94,234,212,0.3)',
            }}>
            {verdict(A, B)}
          </motion.p>
        </AnimatePresence>
      </motion.div>
    </PopupShell>
  )
}
