'use client'

// ── THE DAILY HAUL DISC, TOP RIGHT ──────────────────────────────────────────
//
// Three claims — gems, bait, a Monday crate — that used to live at the end of a
// three-tap walk: open the Tavern, find the Login Bonus card down in "The day",
// tap through to a page. Free currency behind a hunt, and nothing anywhere else
// in the app ever said it was waiting. The only way to know was to go and look,
// which means the people who forgot were the people it was for.
//
// So the page is gone and this is the whole feature: a disc on the chart, in
// front of the settings gear, that FLASHES while something is unclaimed and
// goes quiet the moment it is not.
//
// ── WHY IT FLASHES, AND WHY IT STOPS ────────────────────────────────────────
//
// This is the one HUD element allowed to ask for attention, because it is the
// only one whose answer expires. A trawl waits, an island waits, the Salt Road
// waits; today's gems are gone at midnight. That is the whole justification and
// it is also the limit: the pulse is a slow breath on the ring rather than a
// blink, and it is GONE once claimed rather than dimming to a quieter state.
// A badge you can never fully clear is a badge people learn to stop seeing.
//
// ── IT ASKS FOR ITS OWN STATE ───────────────────────────────────────────────
//
// Rather than threading four more props down through the chart, which is a
// 6,000 line component whose prop list is already the hard part of working in
// it. Same pattern the pact button and the golden prompt use out here.

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import DailyHaul from '@/components/DailyHaul'
import { bonusState } from '@/app/actions/dailyBonus'
import { vibrate } from '@/lib/haptics'

/** The chest gold every crate and every claim in this feature already wears. */
const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'

type State = Awaited<ReturnType<typeof bonusState>>

export default function SeaBonus({ size, top, right }: {
  /** The HUD's disc size, so this matches the settings gear beside it. */
  size: number
  /** Same vertical as the gear. */
  top: number
  /** Where its right edge sits, so the two discs can be laid out by the caller
   *  rather than each guessing at the other's width. */
  right: number
}) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>(null)

  useEffect(() => {
    let alive = true
    void bonusState().then(s => { if (alive) setState(s) }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Anything at all still on the table. Undecided (still loading) counts as
  // nothing, so the disc never flashes and then sheepishly stops.
  const waiting = !!state && (!state.gemsClaimed || !state.baitClaimed || !state.crateClaimed)

  const onClaimed = useCallback((all: boolean) => {
    // The modal reports what it just resolved. `all` is whether the OTHER two
    // were already done, so this is the last one and the disc goes quiet now
    // rather than on the next chart load.
    if (all) setState(s => s && { ...s, gemsClaimed: true, baitClaimed: true, crateClaimed: true })
  }, [])

  return (
    <>
      <div data-no-steer
        onPointerDown={e => e.stopPropagation()}
        style={{ position: 'absolute', top, right, zIndex: 40 }}>
        <button type="button"
          aria-label={waiting ? 'Daily haul, unclaimed' : 'Daily haul'}
          title="Daily haul"
          onClick={() => { vibrate(8); setOpen(true) }}
          style={{
            position: 'relative',
            width: size, height: size, borderRadius: '50%', padding: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: waiting ? 'rgba(40,30,8,0.82)' : 'rgba(8,16,24,0.72)',
            border: `1px solid ${waiting ? `${GOLD}88` : `${SEA},0.22)`}`,
            color: waiting ? GOLD : `${SEA},0.72)`,
            backdropFilter: 'blur(2px)',
          }}>
          {/* THE PULSE. A ring that breathes outward, on the ring only, so the
              icon inside stays legible and the disc does not change size and
              shove the gear about. Transform and opacity, so it composites and
              cannot cost a frame on the chart it is sitting on. */}
          <AnimatePresence>
            {waiting && (
              <motion.span aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.55, 0, 0.55], scale: [1, 1.5, 1] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                style={{
                  position: 'absolute', inset: -2, borderRadius: '50%',
                  border: `1px solid ${GOLD}`, pointerEvents: 'none',
                }} />
            )}
          </AnimatePresence>

          {/* A CHEST, drawn, not an emoji. Same language as every other disc on
              this chart and the same chest the crate art has always been. */}
          <svg width={Math.round(size * 0.54)} height={Math.round(size * 0.54)}
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 10.5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            <path d="M3 13h18" />
            <path d="M10.5 13h3v3h-3z" />
          </svg>
        </button>
      </div>

      <PopupShell open={open} onClose={() => setOpen(false)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          onClick={e => e.stopPropagation()}
          style={{
            margin: 'auto', width: '100%', maxWidth: 420,
            // OPAQUE. It floats over painted, moving water like everything else
            // out here, and a translucent panel over the sea reads as a smear.
            background: 'rgba(8,12,18,0.98)',
            border: `1px solid ${GOLD}3a`,
            borderRadius: 18, padding: '1.2rem 1rem 1.3rem',
            boxShadow: '0 22px 60px rgba(0,0,0,0.7)',
          }}>
          {state ? (
            <DailyHaul
              isPremium={state.isPremium}
              gemsClaimed={state.gemsClaimed}
              baitClaimed={state.baitClaimed}
              crateClaimed={state.crateClaimed}
              onClaimed={onClaimed}
            />
          ) : (
            <p className="font-karla" style={{
              textAlign: 'center', padding: '2rem 0', color: `${SEA},0.5)`, fontSize: '0.8rem',
            }}>Counting the haul…</p>
          )}
        </motion.div>
      </PopupShell>
    </>
  )
}
