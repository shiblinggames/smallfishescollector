'use client'

// ── CAPTAIN'S ORDERS ─────────────────────────────────────────────────────────
// One task at a time, derived from the player's ACTUAL state.
//
// The Expeditions page hands a new captain ships, crew, crew classes, crew levels,
// recruiting, voyages, routes, raids, chapters, story nodes, puzzles, raid items, item
// slots, the Forge, the Gauntlet, Ultimate Arms and PvP — and taught it with two
// tooltips. The result was not confusion so much as SILENT FAILURE: players did the
// obvious thing (voyages), assumed they were done, and sailed into a raid with nobody
// aboard.
//
// This is not a tour. A tour is a thing you dismiss and forget, and it cannot help you
// two days later when you are stuck. This is a live checklist: it reads your roster and
// your ship and your progress every time you open the page, and it shows the ONE thing
// to do next. It disappears for good once a captain has done all of it, so a veteran
// never sees it.

import Link from 'next/link'
import { motion } from 'framer-motion'

export interface OrdersState {
  crewOwned: number
  raidCrew: number
  voyageCrew: number
  crewSlots: number
  equippedItems: number
  ownedItems: number
  raidsCleared: number
  voyagesRun: number
}

export type OrderAction = 'campaign' | 'voyages' | 'loadout'

interface Order {
  id: string
  title: string
  why: string
  cta: string
  /** A real route. */
  href?: string
  /** Or an action the HUB implements. Never an invented window event: two of the three
   *  I first reached for had no listener anywhere, which would have made this card
   *  silently do nothing — the precise failure it exists to prevent. */
  action?: OrderAction
  done: (s: OrdersState) => boolean
}

/**
 * The order matters. Recruit before you can crew; crew before you fight; fight before
 * anything else opens. Voyages sit AFTER the first raid deliberately: they are the
 * thing every new captain finds on their own, and finding them first is precisely how
 * they end up with an empty raid deck.
 */
const ORDERS: Order[] = [
  {
    id: 'recruit',
    title: 'Recruit your first crew',
    why: 'A ship with no crew loses. Every captain who cleared the first raid sailed with four or more.',
    cta: 'Go to the Crew Hall',
    href: '/crew',
    done: s => s.crewOwned > 0,
  },
  {
    id: 'crew_the_deck',
    title: 'Put your crew in the RAID slots',
    why: 'Voyage crew and raid crew are separate. A crew member sails one track or the other, never both, so crew assigned to voyages will not fight for you.',
    cta: 'Assign raid crew',
    href: '/crew?tab=roster&filter=raid',
    done: s => s.raidCrew > 0,
  },
  {
    id: 'first_raid',
    title: 'Sail your first raid',
    why: 'The campaign is the spine of the game. It pays the items, the story and the ship classes.',
    cta: 'Open the campaign',
    action: 'campaign',
    done: s => s.raidsCleared > 0,
  },
  {
    id: 'equip_item',
    title: 'Equip a raid item',
    why: 'Items are half your power in a fight, and they sit in your hold doing nothing until you slot them.',
    cta: 'Open your loadout',
    action: 'loadout',
    done: s => s.equippedItems > 0 || s.ownedItems === 0,
  },
  {
    id: 'first_voyage',
    title: 'Send a voyage',
    why: 'Voyages earn while you are away. Use the crew you are NOT taking into raids.',
    cta: 'Send a voyage',
    action: 'voyages',
    done: s => s.voyagesRun > 0,
  },
]

export default function CaptainsOrders({ state, onAction }: {
  state: OrdersState
  onAction: (a: OrderAction) => void
}) {
  const next = ORDERS.find(o => !o.done(state))
  if (!next) return null   // a veteran never sees this again

  const doneCount = ORDERS.filter(o => o.done(state)).length
  const ACCENT = '#f0c040'

  const go = () => { if (next.action) onAction(next.action) }

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.5rem', color: `${ACCENT}cc` }}>
          Captain&rsquo;s Orders
        </p>
        <div style={{ display: 'flex', gap: 4 }} aria-label={`${doneCount} of ${ORDERS.length} done`}>
          {ORDERS.map(o => (
            <span key={o.id} aria-hidden style={{
              width: 14, height: 3, borderRadius: 999,
              background: o.done(state) ? ACCENT : 'rgba(255,255,255,0.16)',
            }} />
          ))}
        </div>
      </div>

      <p className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: '#f4ecd8', lineHeight: 1.18, marginTop: 6 }}>
        {next.title}
      </p>
      <p className="font-karla" style={{ fontSize: '0.76rem', color: '#b0a99c', lineHeight: 1.45, marginTop: 5 }}>
        {next.why}
      </p>

      <div className="font-cinzel font-800 uppercase tracking-[0.06em]" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 11,
        padding: '0.55rem 0.95rem', borderRadius: 10, fontSize: '0.8rem',
        color: '#1a1206', background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}cc)`,
        boxShadow: `0 0 18px ${ACCENT}33`,
      }}>
        {next.cta}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>
    </>
  )

  const shell: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
    marginBottom: 12, padding: '0.9rem 1rem 1rem', borderRadius: 16,
    background: `radial-gradient(ellipse at 0% 0%, ${ACCENT}1a 0%, rgba(8,13,22,0.7) 70%)`,
    border: `1px solid ${ACCENT}55`,
    boxShadow: `0 0 26px ${ACCENT}14`,
  }

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {next.href
        ? <Link href={next.href} className="tap" style={shell}>{body}</Link>
        : <button type="button" onClick={go} className="tap" style={{ ...shell, border: `1px solid ${ACCENT}55`, background: shell.background as string }}>{body}</button>}
    </motion.div>
  )
}
