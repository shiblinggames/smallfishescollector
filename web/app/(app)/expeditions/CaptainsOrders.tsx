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

import { useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { markCaptainsOrdersDone } from './tourActions'

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
  /** Titles, reasons and destinations are FUNCTIONS of state, because two of them were
   *  traps as constants: "Sail your first raid" opened a STORY node (the campaign starts
   *  with one), and "Send a voyage" could be impossible for a captain whose entire crew
   *  was in raid slots — a dead end the checklist could never clear. */
  title: (s: OrdersState) => string
  why: (s: OrdersState) => string
  cta: (s: OrdersState) => string
  /** A real route. */
  href?: (s: OrdersState) => string | undefined
  /** Or an action the HUB implements. Never an invented window event: two of the three
   *  I first reached for had no listener anywhere, which would have made this card
   *  silently do nothing — the precise failure it exists to prevent. */
  action?: (s: OrdersState) => OrderAction | undefined
  done: (s: OrdersState) => boolean
}

/**
 * CAN this captain send a voyage at all?
 *
 * Not "do they have spare crew" — that was the bug. A captain who has already ASSIGNED
 * someone to the voyage track has zero spare, and would have been nagged to recruit more
 * while a fully crewed voyage sat there ready to sail. They can go if anyone is ON the
 * voyage track, OR if anyone is free to be put there.
 */
const canVoyage = (s: OrdersState) =>
  s.voyageCrew > 0 || (s.crewOwned - s.raidCrew - s.voyageCrew) > 0

/**
 * The order matters. Recruit before you can crew; crew before you fight; fight before
 * anything else opens. Voyages sit AFTER the first raid deliberately: they are the
 * thing every new captain finds on their own, and finding them first is precisely how
 * they end up with an empty raid deck.
 */
const ORDERS: Order[] = [
  {
    id: 'recruit',
    title: () => 'Recruit your first crew',
    // The FIRST thing a captain reads about Expeditions. It has to teach the shape of
    // the whole page in one breath, not just name a button.
    why: () => 'Expeditions are two loops, and both run on crew. The CAMPAIGN is the story: you sail in and fight every battle yourself. VOYAGES are passive: your crew sail without you and bring back doubloons and Nav XP while you are gone. Your first recruit is free.',
    cta: () => 'Go to the Crew Hall',
    // Straight to Recruit. Bare /crew defaults to Roster, so the one order
    // aimed at a captain with NO crew landed them on an empty list.
    href: () => '/crew?tab=recruits',
    done: s => s.crewOwned > 0,
  },
  {
    id: 'crew_the_deck',
    title: () => 'Put your crew in the RAID slots',
    // The single concept the game was failing to teach, and the reason players stalled.
    why: () => 'Raid crew and voyage crew are SEPARATE rosters, and a crew sails one or the other, never both. Crew you put on voyages will not fight for you.',
    cta: () => 'Assign raid crew',
    // ASSIGN, not roster. This pointed at ?tab=roster&filter=raid, which was
    // right before the Crew Hall overhaul split assignment into its own tab.
    // `roster` is still a valid param so it did not error - it just dropped
    // the player on a flat list with no way to seat anyone, which is the one
    // thing this order exists to teach. (`filter` is read by nothing now.)
    href: () => '/crew?tab=assign',
    done: s => s.raidCrew > 0,
  },
  {
    id: 'first_raid',
    // The campaign OPENS on a story node, so promising a fight and delivering a cutscene
    // would be the first thing this card got wrong.
    title: s => (s.raidsCleared === 0 && s.crewOwned > 0 ? 'Start the campaign' : 'Win your first raid'),
    why: () => 'The campaign is the story mode, and you fight every battle in it yourself. It is where the raid items, the ship classes and the plot come from. It opens with a scene, then your first fight.',
    cta: () => 'Open the campaign',
    action: () => 'campaign',
    done: s => s.raidsCleared > 0,
  },
  {
    id: 'equip_item',
    title: () => 'Equip a raid item',
    why: () => 'Items are half your power in a fight. Raids drop them, and they sit in your hold doing nothing until you slot them.',
    cta: () => 'Open your loadout',
    action: () => 'loadout',
    done: s => s.equippedItems > 0 || s.ownedItems === 0,
  },
  {
    id: 'first_voyage',
    // A captain with three crew who just crewed the deck has NONE spare, so "Send a
    // voyage" would be a dead end the checklist could never clear. When that is the case
    // this order teaches the actual lesson instead: you need enough crew for both tracks.
    title: s => (canVoyage(s) ? 'Send a voyage' : 'Recruit crew for voyages'),
    why: s => (canVoyage(s)
      ? 'Voyages are passive. You do not play them: your crew sail off on their own and come back with doubloons, gems and Nav XP whether you are here or not. They go with the crew you did NOT take into raids.'
      : 'Every crew you own is in a raid slot, and a crew sails one track or the other. Recruit a few more for the voyage track, and you will be earning passively while you fight the campaign.'),
    cta: s => (canVoyage(s) ? 'Send a voyage' : 'Recruit more crew'),
    href: s => (canVoyage(s) ? undefined : '/crew?tab=recruits'),
    action: s => (canVoyage(s) ? 'voyages' : undefined),
    done: s => s.voyagesRun > 0,
  },
]

export default function CaptainsOrders({ state, onAction, alreadyDone }: {
  state: OrdersState
  onAction: (a: OrderAction) => void
  /** profiles.captains_orders_done. Once latched, never shown again. */
  alreadyDone: boolean
}) {
  const next = alreadyDone ? undefined : ORDERS.find(o => !o.done(state))
  const allDone = !alreadyDone && !next

  // THE LATCH. It is a LIVE checklist while you are learning, which is the whole point:
  // a tour you dismiss cannot help you two days later when you are stuck. But live means
  // it would come BACK — a veteran who benches their raid crew to run voyages for a day
  // would be served a beginner's card despite eight raids behind them. So the first time
  // every order is complete, it shuts for good. The launch guard still catches an empty
  // deck at the moment it actually matters.
  useEffect(() => {
    if (allDone) void markCaptainsOrdersDone().catch(() => {})
  }, [allDone])

  if (!next) return null

  const doneCount = ORDERS.filter(o => o.done(state)).length
  const ACCENT = '#f0c040'

  const href = next.href?.(state)
  const action = next.action?.(state)
  const go = () => { if (action) onAction(action) }

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
        {next.title(state)}
      </p>
      <p className="font-karla" style={{ fontSize: '0.78rem', color: '#b8b1a4', lineHeight: 1.5, marginTop: 5 }}>
        {next.why(state)}
      </p>

      <div className="font-cinzel font-800 uppercase tracking-[0.06em]" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 11,
        padding: '0.55rem 0.95rem', borderRadius: 10, fontSize: '0.8rem',
        color: '#1a1206', background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}cc)`,
        boxShadow: `0 0 18px ${ACCENT}33`,
      }}>
        {next.cta(state)}
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
      {href
        ? <Link href={href} className="tap" style={shell}>{body}</Link>
        : <button type="button" onClick={go} className="tap" style={{ ...shell, border: `1px solid ${ACCENT}55`, background: shell.background as string }}>{body}</button>}
    </motion.div>
  )
}
