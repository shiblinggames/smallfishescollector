'use client'

// ── SELL IT OR PUT IT ON THE WALL ───────────────────────────────────────────
//
// The one decision in this game that cannot be deferred and cannot be dodged.
//
// ── WHY IT IS A BLOCKING MODAL, WHICH ALMOST NOTHING ELSE HERE IS ───────────
//
// A golden fish is written into `shiny_catches` at status 'hold' the moment it
// is caught, and the two actions that resolve it lived in exactly one place: a
// block INSIDE the catch card on the fishing overlay. Dismissing that card — a
// tap anywhere, a refresh, walking away — left the row on hold with nothing in
// the app able to reach it again.
//
// The FISH was never lost, and it is worth being precise about that because the
// bug was first reported as a lost catch. A held row still hangs on the Goldens
// wall (AlmanacGoldens filters on `status !== 'sold'`), so the trophy is there
// and always was. What was unrecoverable was the CHOICE: no way back to the
// sell button, so the doubloons for that fish could never be taken. Twenty-six
// catches across six captains were sitting on an answer nobody could give.
//
// So this closes on an ANSWER and on nothing else. No backdrop tap, no Escape,
// no close button — the three ways out that every other overlay in this game
// deliberately offers. That is a rule worth breaking exactly here: everywhere
// else, dismissing costs you a panel you can reopen.
//
// ── AND THE RECOVERY IS THE REAL FIX ────────────────────────────────────────
//
// A blocking modal stops it happening again and does nothing for the ones
// already waiting, and it cannot survive a browser crash mid-choice. So the
// chart asks `heldGolden()` on load and puts this back up. The choice becomes
// something you cannot lose rather than something you must not miss.
//
// It is safe to re-ask ONLY because a mount now marks its row. It did not use
// to: `status: 'mounted'` broke the table's CHECK on every mount ever made and
// the error was swallowed, so fourteen fish that are hanging on the wall right
// now still read as 'hold'. Re-offering those would have sold them a second
// time at full price. See supabase/migrate_shiny_mounted_status.sql.
//
// ── OPAQUE ──────────────────────────────────────────────────────────────────
//
// It was a translucent gold wash sitting over a painted, moving sea, which is
// unreadable for the same reason every other panel on this chart carries a
// solid base. This one has a real backdrop and a real floor.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { FishImg } from '@/components/CatchResultCard'
import { SHINY_FISH_FILTER } from '@/lib/shiny'
import { vibrate } from '@/lib/haptics'
import { sellGoldenTrophy, mountGoldenTrophy } from '@/app/(app)/fishing/actions'

const GOLD = '#f0c040'

export type HeldGolden = {
  id: number
  name: string
  alreadyMounted: boolean
  /** Optional: the catch path has it, the recovery path reads it back. */
  sizeIn?: number
}

export default function GoldenChoice({ held, onDone }: {
  held: HeldGolden | null
  /** Fired only once the server has actually resolved it. */
  onDone: (what: 'sold' | 'mounted') => void
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!held || !mounted) return null

  const act = async (which: 'sell' | 'mount') => {
    if (busy) return
    setBusy(true)
    setNote(null)
    vibrate([0, 18, 40, 26])
    try {
      if (which === 'sell') {
        const r = await sellGoldenTrophy(held.id).catch(() => ({ error: 'It slipped away.' }))
        if ('error' in r) { setNote(r.error); setBusy(false); return }
        // The header reads its balance once at render and never asks again
        // unless it is told. Same event every other earning path fires.
        try { window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.doubloons })) } catch { /* noop */ }
        onDone('sold')
      } else {
        const r = await mountGoldenTrophy(held.id).catch(() => ({ error: 'It slipped away.' }))
        if ('error' in r) { setNote(r.error); setBusy(false); return }
        onDone('mounted')
      }
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    // PORTALLED TO THE BODY. The chart's root carries `touch-action: none` so a
    // drag steers the sea, and a touch's allowed behaviours are worked out from
    // every DOM ancestor — `position: fixed` moves where a box is PAINTED, not
    // where it sits in the tree. Anything mounted inside the map inherits that.
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      // NO onClick. The backdrop is a wall, not a dismiss target.
      data-no-steer
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 9600,
        background: 'rgba(3,6,10,0.9)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', overflowY: 'auto',
      }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 330, damping: 22 }}
        style={{
          margin: 'auto', width: '100%', maxWidth: 380,
          borderRadius: 20, overflow: 'hidden',
          // A SOLID FLOOR. This sits over painted, moving water and the old
          // version was a translucent gold wash on top of it, which is
          // unreadable for the same reason every other panel here has a base.
          background: '#0b0a06',
          border: `1px solid ${GOLD}88`,
          boxShadow: `0 22px 60px rgba(0,0,0,0.75), 0 0 40px ${GOLD}22`,
        }}>
        <div style={{ padding: '1.1rem 1.1rem 0.9rem', textAlign: 'center' }}>
          <p className="font-karla font-700 uppercase" style={{
            fontSize: '0.56rem', letterSpacing: '0.24em', color: GOLD,
          }}>A golden one</p>

          <div style={{
            position: 'relative', width: 132, height: 132, margin: '0.6rem auto 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span aria-hidden style={{
              position: 'absolute', inset: -10, borderRadius: '50%',
              background: `radial-gradient(circle, ${GOLD}44 0%, transparent 68%)`,
            }} />
            <FishImg name={held.name} style={{
              position: 'relative', maxWidth: '100%', maxHeight: '100%',
              objectFit: 'contain', filter: SHINY_FISH_FILTER,
            }} />
          </div>

          <p className="font-cinzel font-800" style={{
            fontSize: '1.35rem', color: '#f6ecd4', marginTop: 6, lineHeight: 1.1,
          }}>{held.name}</p>

          <p className="font-karla" style={{
            fontSize: '0.8rem', color: 'rgba(214,198,166,0.75)', marginTop: 8, lineHeight: 1.5,
          }}>
            {held.alreadyMounted
              ? 'You have one of these on the wall already. This one can only be sold.'
              : 'Sell it, or mount it in your Captain’s Log. One of each species only.'}
          </p>

          {note && (
            <p className="font-karla font-600" style={{
              fontSize: '0.78rem', color: '#f0a890', marginTop: 8,
            }}>{note}</p>
          )}
        </div>

        <div style={{
          display: 'flex', gap: 8, padding: '0.2rem 1.1rem 1.1rem',
        }}>
          <button type="button" disabled={busy} onClick={() => void act('sell')}
            className="tap font-cinzel font-700 uppercase tracking-[0.1em]"
            style={{
              flex: 1, padding: '0.75rem', borderRadius: 12, fontSize: '0.86rem',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.18)', color: '#e2dccf',
            }}>
            Sell
          </button>
          {!held.alreadyMounted && (
            <button type="button" disabled={busy} onClick={() => void act('mount')}
              className="tap font-cinzel font-700 uppercase tracking-[0.1em]"
              style={{
                flex: 1.25, padding: '0.75rem', borderRadius: 12, fontSize: '0.9rem',
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                background: `linear-gradient(180deg, ${GOLD} 0%, ${GOLD}cc 100%)`,
                border: `1px solid ${GOLD}`, color: '#1a1204',
              }}>
              Mount it
            </button>
          )}
        </div>

        {/* NO WAY OUT THAT IS NOT AN ANSWER, and it says so rather than leaving
            somebody hunting for a close button that is not there. */}
        <p className="font-karla" style={{
          fontSize: '0.62rem', color: 'rgba(214,198,166,0.4)', textAlign: 'center',
          padding: '0 1.1rem 0.9rem', lineHeight: 1.4,
        }}>
          {busy ? 'Hold on…' : 'It waits here until you decide. Nothing is lost either way.'}
        </p>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
