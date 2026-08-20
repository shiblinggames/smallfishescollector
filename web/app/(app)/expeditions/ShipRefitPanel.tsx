'use client'

// THE REFIT - the one free re-choice of every class pick, earned by putting the
// don under.
//
// It was a wizard: one chapter per screen, forward only. That hid the only thing
// the player actually wants to see, which is all three picks side by side and
// what they add up to. It is a BOARD now. Every chapter is on screen with what it
// currently gives you, any row opens a picker, and the totals underneath say what
// you are trading before anything is signed.
//
// The ladder still rules it: the menu for a chapter is built from the chapters
// ABOVE it, so a Mark II can only be chosen on a line already sailed. Change an
// early chapter and the later ones it no longer supports are cleared, said out
// loud rather than silently repaired. The server re-checks the whole thing
// anyway (see refitShipClasses).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import {
  offeredShipClasses, offeredShipClassIds, getShipClass, aggregateShipClasses,
  SHIP_CLASS_CHAPTER_ORDER, type ShipClassDef, type ShipClassId,
} from '@/lib/shipClasses'
import { refitShipClasses } from './raidMapActions'

const ACCENT = '#c084fc'

const CHAPTER_NAME: Record<string, string> = {
  thread:      'Chapter 1',
  sunken_hand: 'Chapter 2',
  the_coffers: 'Chapter 3',
}

/** A multiplier as plain English. 1.15 -> "+15%", 0.9 -> "-10%". */
function pct(mult: number): string {
  const n = Math.round((mult - 1) * 100)
  return `${n > 0 ? '+' : ''}${n}%`
}
function flat(n: number): string {
  return `${n > 0 ? '+' : ''}${n}`
}

/** Every stat a class can touch, in one place, so the before/after table and the
 *  per-class lines can never describe the same effect differently. */
function statRows(agg: ReturnType<typeof aggregateShipClasses>) {
  return [
    { key: 'Damage',    text: pct(agg.damageMult),   neutral: agg.damageMult === 1 },
    { key: 'Hull',      text: pct(agg.hpMult),       neutral: agg.hpMult === 1 },
    { key: 'Speed',     text: flat(agg.speedFlat),   neutral: agg.speedFlat === 0 },
    { key: 'Doubloons', text: pct(agg.doubloonMult), neutral: agg.doubloonMult === 1 },
  ]
}

function ClassLines({ def }: { def: ShipClassDef }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {def.bullets.map(b => (
        <span key={b.label} className="font-karla font-700"
          style={{
            fontSize: '0.78rem', padding: '0.2rem 0.55rem', borderRadius: 999,
            color: b.positive ? '#7fdfa3' : '#e08a8a',
            background: b.positive ? 'rgba(127,223,163,0.14)' : 'rgba(224,138,138,0.14)',
          }}>
          {b.label}
        </span>
      ))}
    </div>
  )
}

export default function ShipRefitPanel({ picks, onClose }: {
  picks: Record<string, string>
  onClose: () => void
}) {
  const router = useRouter()
  const chapters = SHIP_CLASS_CHAPTER_ORDER.filter(c => !!picks[c])
  // Opens with what you already sail, so doing nothing is visibly the same ship.
  const [chosen, setChosen] = useState<Record<string, string>>({ ...picks })
  const [editing, setEditing] = useState<number | null>(null)
  const [cleared, setCleared] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // The picker has to PORTAL. This panel already sits inside a modal card that
  // framer-motion animates with scale + y, and a transform on an ancestor makes
  // it the containing block for position:fixed children -- so a nested
  // PopupShell would be trapped inside the card instead of covering the screen.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  /** The menu for a chapter: whatever the chapters above it leave on the table. */
  function menuFor(i: number): ShipClassDef[] {
    const above: Record<string, string> = {}
    for (let k = 0; k < i; k++) {
      const id = chosen[chapters[k]]
      if (id) above[chapters[k]] = id
    }
    return offeredShipClasses(above)
  }

  function choose(i: number, id: string) {
    const next = { ...chosen, [chapters[i]]: id }
    // Anything below this that the new pick no longer supports is cleared. Once
    // one goes, everything under it goes too: re-picking around a hole is a
    // puzzle nobody asked for.
    const above: Record<string, string> = {}
    for (let k = 0; k <= i; k++) above[chapters[k]] = next[chapters[k]]
    const dropped: string[] = []
    for (let k = i + 1; k < chapters.length; k++) {
      const c = chapters[k]
      const cur = next[c]
      if (cur && offeredShipClassIds(above).includes(cur as ShipClassId)) {
        above[c] = cur
      } else {
        for (let j = k; j < chapters.length; j++) {
          if (next[chapters[j]]) dropped.push(chapters[j])
          delete next[chapters[j]]
        }
        break
      }
    }
    vibrate(14)
    setChosen(next)
    setCleared(dropped)
    setEditing(null)
  }

  const complete = chapters.every(c => !!chosen[c])
  const changed = chapters.some(c => chosen[c] !== picks[c])
  const before = aggregateShipClasses(picks)
  const after = aggregateShipClasses(chosen)
  const rowsBefore = statRows(before)
  const rowsAfter = statRows(after)

  function commit() {
    setErr(''); setBusy(true)
    refitShipClasses(chosen).then(res => {
      setBusy(false)
      if ('error' in res) { setErr(res.error); return }
      vibrate([22, 50, 22, 50, 40])
      onClose()
      router.refresh()
    })
  }

  return (
    <div>
      <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: ACCENT }}>The Refit</p>
      <p className="font-karla" style={{ fontSize: '0.92rem', color: '#b8b2aa', marginTop: 6, lineHeight: 1.5 }}>
        You get one of these, ever. Tap any chapter to pick a different class. Nothing is saved until you confirm.
      </p>

      {/* THE BOARD. All three at once, because the picks only make sense against
          each other. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        {chapters.map((c, i) => {
          const def = chosen[c] ? getShipClass(chosen[c]) : undefined
          const was = getShipClass(picks[c])
          const isChanged = chosen[c] !== picks[c]
          const color = def?.color ?? '#6f7887'
          return (
            <button key={c} type="button" onClick={() => setEditing(i)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '0.85rem 0.9rem', borderRadius: 13,
                background: def ? `${color}12` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${def ? `${color}55` : 'rgba(224,138,138,0.55)'}`,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="font-karla font-800 uppercase" style={{ fontSize: '0.68rem', letterSpacing: '0.12em', color: '#8a96a8', flex: 1 }}>
                  {CHAPTER_NAME[c] ?? c}
                </span>
                <span className="font-karla font-700" style={{ fontSize: '0.76rem', color: ACCENT }}>Change</span>
              </div>
              {def ? (
                <>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.12rem', color: '#f4f0ea', marginTop: 4, lineHeight: 1.2 }}>
                    {def.name}
                  </p>
                  {isChanged && was && (
                    <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#8a8480', marginTop: 2 }}>
                      instead of {was.name}
                    </p>
                  )}
                  <ClassLines def={def} />
                </>
              ) : (
                <p className="font-karla font-700" style={{ fontSize: '0.92rem', color: '#e08a8a', marginTop: 4 }}>
                  Pick one
                </p>
              )}
            </button>
          )
        })}
      </div>

      {cleared.length > 0 && (
        <p className="font-karla font-600" style={{ fontSize: '0.86rem', color: '#e0b070', marginTop: 12, lineHeight: 1.45 }}>
          {cleared.map(c => CHAPTER_NAME[c] ?? c).join(' and ')} needed the class you just replaced, so {cleared.length > 1 ? 'they are' : 'it is'} cleared. Pick again.
        </p>
      )}

      {/* WHAT YOU END UP WITH. Every stat, old next to new, in the same words the
          class cards use. This is the whole reason to open the panel. */}
      <p className="font-karla font-800 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.16em', color: '#8a96a8', marginTop: 22, marginBottom: 8 }}>
        Your ship after the refit
      </p>
      <div style={{ borderRadius: 13, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.09)', padding: '0.5rem 0.9rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 4.6rem 1.2rem 4.6rem', alignItems: 'center', padding: '0.4rem 0' }}>
          <span />
          <span className="font-karla font-800 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: '#6f7887', textAlign: 'right' }}>Now</span>
          <span />
          <span className="font-karla font-800 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: ACCENT, textAlign: 'right' }}>After</span>
        </div>
        {rowsAfter.map((row, i) => {
          const old = rowsBefore[i]
          if (old.neutral && row.neutral) return null
          const moved = old.text !== row.text
          return (
            <div key={row.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 4.6rem 1.2rem 4.6rem', alignItems: 'baseline', padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="font-karla font-600" style={{ fontSize: '0.92rem', color: '#d8d2c8' }}>{row.key}</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#8a8480', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{old.text}</span>
              <span className="font-karla" style={{ fontSize: '0.8rem', color: '#6f7887', textAlign: 'center' }}>{moved ? '›' : ''}</span>
              <span className="font-cinzel font-800" style={{ fontSize: '1.02rem', color: moved ? ACCENT : '#8a8480', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.text}</span>
            </div>
          )
        })}
        {rowsAfter.every((r, i) => r.neutral && rowsBefore[i].neutral) && (
          <p className="font-karla" style={{ fontSize: '0.88rem', color: '#8a8480', padding: '0.5rem 0' }}>No changes yet.</p>
        )}
      </div>

      {err && <p className="font-karla font-600" style={{ fontSize: '0.88rem', color: '#e08a8a', marginTop: 12, textAlign: 'center' }}>{err}</p>}

      <motion.button type="button" onClick={commit} disabled={busy || !complete || !changed} whileTap={{ scale: 0.97 }}
        className="font-cinzel font-800 uppercase"
        style={{
          width: '100%', marginTop: 18, padding: '0.95rem', borderRadius: 13,
          letterSpacing: '0.1em', fontSize: '0.98rem',
          color: complete && changed ? '#f4ecd8' : '#6f7887',
          cursor: busy ? 'wait' : complete && changed ? 'pointer' : 'not-allowed',
          background: complete && changed ? `${ACCENT}2e` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${complete && changed ? `${ACCENT}99` : 'rgba(255,255,255,0.12)'}`,
        }}>
        {busy ? 'Saving' : !complete ? 'Pick every chapter' : !changed ? 'Nothing changed yet' : 'Confirm the refit'}
      </motion.button>
      <p className="font-karla" style={{ fontSize: '0.8rem', color: '#8a8480', marginTop: 10, textAlign: 'center', lineHeight: 1.45 }}>
        This is your only refit. After you confirm, your classes are permanent again.
      </p>
      <button type="button" onClick={onClose} disabled={busy} className="font-karla font-600"
        style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: '#8a8480', fontSize: '0.88rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
        Cancel
      </button>

      {/* THE PICKER. One chapter at a time, but reached by tapping the row it
          belongs to, so it reads as editing that line rather than as a step in a
          sequence you are being marched through. */}
      {mounted && createPortal(
        <PopupShell open={editing !== null} onClose={() => setEditing(null)} zIndex={140}>
        {editing !== null && (
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 4 }} transition={{ duration: 0.18 }}
            onClick={e => e.stopPropagation()}
            style={{ position: 'relative', margin: 'auto', width: '100%', maxWidth: 400, background: 'rgba(8,14,24,0.98)', border: `1px solid ${ACCENT}66`, borderRadius: 18, padding: '1.1rem 1rem 1.2rem', maxHeight: '86vh', overflowY: 'auto' }}>
            <CloseButton onClick={() => setEditing(null)} style={{ position: 'absolute', top: 8, right: 10, zIndex: 6 }} />
            <p className="font-karla font-800 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.16em', color: '#8a96a8' }}>
              {CHAPTER_NAME[chapters[editing]] ?? chapters[editing]}
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f4f0ea', marginTop: 3 }}>Pick a class</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
              {menuFor(editing).map(def => {
                const isCurrent = chosen[chapters[editing]] === def.id
                return (
                  <button key={def.id} type="button" onClick={() => choose(editing, def.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '0.8rem 0.85rem', borderRadius: 12,
                      background: isCurrent ? `${def.color}24` : `${def.color}10`,
                      border: `1px solid ${def.color}${isCurrent ? 'cc' : '40'}`,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, background: `${def.color}22`, border: `1px solid ${def.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: def.color }}>{def.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8', lineHeight: 1.15 }}>{def.name}</p>
                        <p className="font-karla font-700" style={{ fontSize: '0.76rem', color: def.color }}>{def.tagline}</p>
                      </div>
                      {isCurrent && <span className="font-karla font-800 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: def.color, flexShrink: 0 }}>Current</span>}
                    </div>
                    <p className="font-karla" style={{ fontSize: '0.86rem', color: '#b8b2aa', marginTop: 7, lineHeight: 1.45 }}>{def.description}</p>
                    <ClassLines def={def} />
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
        </PopupShell>,
        document.body,
      )}
    </div>
  )
}
