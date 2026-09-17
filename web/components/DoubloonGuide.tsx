'use client'

// ── WHAT THE GOLD IS FOR ────────────────────────────────────────────────────
//
// Pressing the gem balance opens the packs, so pressing the doubloon balance
// beside it did nothing at all, which on a row of two numbers reads as one of
// them being broken. This is the other door.
//
// IT SELLS NOTHING. Gems have a store because gems can be bought; doubloons
// cannot be bought at any price and never will be (the house rule lives in the
// gem store's own copy). So this is a GUIDE: what the gold is for, where each
// thing is, and roughly what it costs, for a captain sitting on a pile of it
// with no idea what to do next. Every row ends somewhere you sail to.
//
// THE FIGURES COME FROM THE TABLES, not from prose. Each row reads its own
// price ladder (lib/rods, lib/shipyard, lib/fishHold, lib/crewHall,
// lib/repairKits), so a re-tune moves this panel with it and nothing here can
// quietly go stale. That is the whole reason the rows are computed rather than
// written out: the last set of numbers written into copy by hand was wrong for
// months.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FISH_HOLD_TIERS } from '@/lib/fishHold'
import { CREW_HALL_TIERS } from '@/lib/crewHall'
import { HULL_COSTS } from '@/lib/shipyard'
import { RODS } from '@/lib/rods'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'

export function openDoubloonGuide() {
  window.dispatchEvent(new CustomEvent('open-doubloon-guide'))
}

/** The cheapest and dearest rung of a ladder, ignoring the free first one. */
function span(costs: readonly number[]): [number, number] {
  const paid = costs.filter(c => c > 0)
  return [Math.min(...paid), Math.max(...paid)]
}

// Rounded to thousands only where a thousand is small change. 1,500 as
// "2k" is a price the shop does not charge.
const fmt = (n: number) => n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString()
const range = (costs: readonly number[]) => {
  const [lo, hi] = span(costs)
  return `${fmt(lo)} to ${fmt(hi)}`
}

type Row = { name: string; where: string; cost: string; note: string }

function rows(): Row[] {
  return [
    {
      name: 'Better tackle',
      where: 'The Tackle Shop, on the Mainland',
      cost: range(RODS.map(r => r.cost)),
      note: 'Rods, hooks and reels. They widen the band you are aiming at and slow the needle down, so the deep water stops being a coin toss.',
    },
    {
      name: 'A bigger hold',
      where: 'The Shipyard',
      cost: range(FISH_HOLD_TIERS.map(t => t.cost)),
      note: `Every fish you land takes a slot, and a full hold stops you fishing. ${FISH_HOLD_TIERS[0].capacity} to ${FISH_HOLD_TIERS[FISH_HOLD_TIERS.length - 1].capacity} fish.`,
    },
    {
      name: 'A faster boat',
      where: 'The Shipyard',
      cost: range(HULL_COSTS),
      note: 'Hull, handling and acceleration, bought separately. The chart is big and this is how it gets smaller.',
    },
    {
      name: 'Bunks in the Crew Hall',
      where: 'The Crew Hall, north of the gate',
      cost: range(Object.values(CREW_HALL_TIERS).map(t => t.cost)),
      note: 'Crew left in a bunk train while you are away. Each tier adds one.',
    },
    {
      name: 'Bait, and repairs',
      where: 'The Tackle Shop, and the Gunwharf',
      cost: 'tens to thousands',
      note: 'Bait changes what is biting. Repair kits patch the hull between fights.',
    },
    {
      name: 'Chips, if you fancy it',
      where: 'The Den',
      cost: 'what you dare',
      note: 'One purse plays every table, and you can cash out any time.',
    },
  ]
}

export default function DoubloonGuide() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('open-doubloon-guide', onOpen)
    return () => window.removeEventListener('open-doubloon-guide', onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  const close = () => { vibrate(8); setOpen(false) }

  return (
    <div onClick={close} data-no-steer style={{
      position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.72)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <motion.div onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="What doubloons buy"
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{
          width: '100%', maxWidth: 'var(--modal-w)', maxHeight: '92vh', overflowY: 'auto',
          background: 'linear-gradient(180deg, #17120a 0%, #0a0805 100%)',
          border: `1px solid ${GOLD}40`, borderTop: `2px solid ${GOLD}`,
          borderRadius: 18, padding: '1.15rem 1.1rem 1.25rem',
          boxShadow: `0 18px 60px rgba(0,0,0,0.6), 0 0 40px ${GOLD}14`,
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.56rem', color: `${GOLD}cc` }}>
              Your purse
            </p>
            <h2 className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f4ecd8', lineHeight: 1.1 }}>
              What doubloons buy
            </h2>
          </div>
          <button onClick={close} aria-label="Close" style={{
            flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)', color: '#b2aca3', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <p className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.6, color: '#b8ae98', margin: '0 0 14px' }}>
          Doubloons come from selling what you catch. They are not for sale, and everything here is
          bought with fish.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows().map((r, i) => (
            <div key={r.name} style={{
              padding: '0.7rem 0',
              borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.96rem', color: '#f4ecd8' }}>
                  {r.name}
                </span>
                <span className="font-karla font-700" style={{
                  flexShrink: 0, fontSize: '0.78rem', color: GOLD, fontVariantNumeric: 'tabular-nums',
                }}>
                  ⟡ {r.cost}
                </span>
              </div>
              <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#8a8272', margin: '2px 0 0' }}>
                {r.where}
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.78rem', lineHeight: 1.55, color: '#a89e88', margin: '5px 0 0' }}>
                {r.note}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
