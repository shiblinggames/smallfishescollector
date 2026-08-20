'use client'

// THE REFIT - the one free re-choice of every class pick, earned by putting the
// don under.
//
// Built as a WALK, not a form. The ladder is the whole reason a per-chapter
// reset is impossible (drop the Mark I and the Mark II above it becomes a
// loadout the game would never hand out), so this re-walks the chapters in play
// order and asks the same question the class node asked at the time: here is the
// menu, as your choices so far have shaped it. Making the player feel that rule
// beats explaining it in a paragraph nobody reads.
//
// Nothing is written until the last confirm, and the server re-validates the
// whole ladder anyway (see refitShipClasses).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import { offeredShipClasses, getShipClass, SHIP_CLASS_CHAPTER_ORDER, type ShipClassDef } from '@/lib/shipClasses'
import { refitShipClasses } from './raidMapActions'

const ACCENT = '#c084fc'

/** Chapter labels, so a step reads as the moment it belongs to rather than as a
 *  database key. */
const CHAPTER_NAME: Record<string, string> = {
  thread:      'Chapter I',
  sunken_hand: 'Chapter II',
  the_coffers: 'Chapter III',
}

function ClassCard({ def, onPick }: { def: ShipClassDef; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '0.7rem 0.8rem', borderRadius: 12,
        background: `${def.color}10`, border: `1px solid ${def.color}40`,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: `${def.color}22`, border: `1px solid ${def.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem', color: def.color }}>{def.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#f0ede8', lineHeight: 1.15 }}>{def.name}</p>
          <p className="font-karla font-700" style={{ fontSize: '0.6rem', color: def.color }}>{def.tagline}</p>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
        {def.bullets.map(b => (
          <span key={b.label} className="font-karla font-700"
            style={{ fontSize: '0.58rem', padding: '0.16rem 0.42rem', borderRadius: 999, color: b.positive ? '#7fdfa3' : '#e08a8a', background: b.positive ? 'rgba(127,223,163,0.12)' : 'rgba(224,138,138,0.12)' }}>
            {b.label}
          </span>
        ))}
      </div>
    </button>
  )
}

export default function ShipRefitPanel({ picks, onClose }: {
  picks: Record<string, string>
  onClose: () => void
}) {
  const router = useRouter()
  // Only the chapters this captain actually sailed, in play order.
  const chapters = SHIP_CLASS_CHAPTER_ORDER.filter(c => !!picks[c])
  const [step, setStep] = useState(0)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const done = step >= chapters.length
  const chapter = chapters[step]
  // The menu as the picks BEFORE this step have shaped it - the same call the
  // class node makes, so a refit can only ever build a loadout the game offers.
  const menu = done ? [] : offeredShipClasses(chosen)

  function pick(id: string) {
    vibrate(14)
    setChosen(c => ({ ...c, [chapter]: id }))
    setStep(s => s + 1)
  }

  function back() {
    if (step === 0) return
    const prev = chapters[step - 1]
    setChosen(c => { const n = { ...c }; delete n[prev]; return n })
    setStep(s => s - 1)
  }

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
      <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: ACCENT }}>The Refit</p>
      <p className="font-karla" style={{ fontSize: '0.74rem', color: '#8a8480', marginTop: 4, lineHeight: 1.45 }}>
        The don&rsquo;s shipwright will strip your colors back to bare hull and let you choose again, once. Pick your way back up the chapters. Nothing changes until you sign for it.
      </p>

      {!done && (
        <>
          <p className="font-karla font-800 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.16em', color: '#6f7887', marginTop: 16, marginBottom: 7 }}>
            {CHAPTER_NAME[chapter] ?? chapter} &middot; was {getShipClass(picks[chapter])?.name ?? 'nothing'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {menu.map(def => <ClassCard key={def.id} def={def} onPick={() => pick(def.id)} />)}
          </div>
        </>
      )}

      {done && (
        <>
          <p className="font-karla font-800 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.16em', color: '#6f7887', marginTop: 16, marginBottom: 7 }}>
            Your new colors
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chapters.map(c => {
              const was = getShipClass(picks[c])
              const now = getShipClass(chosen[c])
              if (!now) return null
              const changed = picks[c] !== chosen[c]
              return (
                <div key={c} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '0.44rem 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>{CHAPTER_NAME[c] ?? c}</span>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: changed ? now.color : 'rgba(255,255,255,0.6)', textAlign: 'right' }}>
                    {now.name}
                    {changed && was && (
                      <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.58rem', color: '#7a7470' }}>was {was.name}</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          <motion.button type="button" onClick={commit} disabled={busy} whileTap={{ scale: 0.97 }}
            className="font-cinzel font-800 uppercase"
            style={{ width: '100%', marginTop: 16, padding: '0.8rem', borderRadius: 12, letterSpacing: '0.1em', fontSize: '0.86rem', color: '#f4ecd8', cursor: busy ? 'wait' : 'pointer', background: `${ACCENT}26`, border: `1px solid ${ACCENT}88`, boxShadow: `0 0 18px ${ACCENT}22` }}>
            {busy ? 'Cutting the deck' : 'Sign for the refit'}
          </motion.button>
          <p className="font-karla" style={{ fontSize: '0.62rem', color: '#7a7470', marginTop: 8, textAlign: 'center', lineHeight: 1.4 }}>
            This is the only refit you get. After this your colors are permanent again.
          </p>
        </>
      )}

      {err && <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#e08a8a', marginTop: 10, textAlign: 'center' }}>{err}</p>}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 14 }}>
        {step > 0 && (
          <button type="button" onClick={back} disabled={busy} className="font-karla font-600"
            style={{ background: 'none', border: 'none', color: '#8a8480', fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Back a chapter
          </button>
        )}
        <button type="button" onClick={onClose} disabled={busy} className="font-karla font-600"
          style={{ background: 'none', border: 'none', color: '#8a8480', fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Leave it be
        </button>
      </div>
    </div>
  )
}
