'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { isCombatNode, type RaidNodeView } from '@/lib/raidMap'
import { RARITY_COLOR } from '@/lib/bossRaids'
import { getRaidItem } from '@/lib/raidItems'
import { claimMilestoneNode, markStoryNodeRead, claimQuartermasterChoice, solvePuzzleNode } from './raidMapActions'
import BeaconChainPuzzle from './BeaconChainPuzzle'

// Distinct border / glow colour per node type so the route reads at a
// glance: cyan = practice, ember = boss raid, gold = collect goal,
// violet = shop, sage = story.
const TYPE_ACCENT: Record<string, string> = {
  skirmish:  '#46c3d6',
  raid:      '#f0743a',
  milestone: '#e0b358',
  shop:      '#b08bf0',
  story:     '#6fbf73',
  puzzle:    '#7c9fd0',
}

// Default art per node type, used when a node has no own `image`. Lets
// every shop (and any future shops) share one icon without per-node data.
const TYPE_IMAGE: Record<string, string | undefined> = {
  shop: '/raidshop.jpeg',
}

// Winding sea-chart zig-zag (% of width, cycled top→bottom). Map is
// pure icon-nodes (label + story live in the tap modal), so they pack
// very tight. ROW floor is set by the cleared/lock badge overhang so
// it doesn't collide with the next token. Repeats as map grows.
// No dead-centre (50) column: a centred node has no room for its label on
// either side, so a long single word (e.g. "Consignment") overflows the card.
const COLS = [66, 73, 27, 62, 38, 70, 30]
const ROW = 84           // vertical pitch between node centres
const TOKEN = 72         // layout/max token diameter (drives spacing + viewBox)
const PAD_TOP = 18
const PAD_BOTTOM = 14

// Visual token size by type: bigger node = bigger fight. A story beat
// is the smallest, a skirmish small, a full raid the biggest.
const TYPE_SIZE: Record<string, number> = {
  story:     40,
  skirmish:  48,
  milestone: 56,
  shop:      56,
  puzzle:    56,
  raid:      66,
}

function NodeGlyph({ type, color, size = 22 }: { type: string; color: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  // skirmish: crossed cutlasses (a single duel)
  if (type === 'skirmish') return <svg {...common}><path d="M3 17l6-6M14.5 6.5L21 13M6 21l-3-3M9 3l12 12-3 3L6 6z" /></svg>
  // raid: skull (the boss campaign)
  if (type === 'raid') return (
    <svg {...common}>
      <path d="M12 3c-4.4 0-8 3.2-8 7.4 0 2.4 1.2 4.5 3 5.9V19a1 1 0 0 0 1 1h1.6v-2h2.8v2H17a1 1 0 0 0 1-1v-2.7c1.8-1.4 3-3.5 3-5.9C21 6.2 17.4 3 13 3z" />
      <circle cx="9.4" cy="11" r="1.5" fill={color} stroke="none" />
      <circle cx="14.6" cy="11" r="1.5" fill={color} stroke="none" />
      <path d="M11 14.5h2" />
    </svg>
  )
  // shop: market stall
  if (type === 'shop') return <svg {...common}><path d="M3 9l1.5-5h15L21 9M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 13h6" /></svg>
  // story: open book
  if (type === 'story') return <svg {...common}><path d="M12 6.5C10.5 5 8 4.5 4 5v13c4-.5 6.5 0 8 1.5 1.5-1.5 4-2 8-1.5V5c-4-.5-6.5 0-8 1.5zM12 6.5V19" /></svg>
  // puzzle: a signal beacon flame (light the chain)
  if (type === 'puzzle') return <svg {...common}><path d="M12 2c1.6 3 5 4.6 5 9a5 5 0 0 1-10 0c0-2 .8-3.2 2-4.2.2 1.2 1 1.9 1.9 2.1C11.8 6.6 11 4.1 12 2z" /></svg>
  // milestone (default): treasure star
  return <svg {...common}><path d="M12 2l2.4 6.9H22l-6 4.5 2.3 7L12 16.9 5.7 20.4 8 13.4 2 8.9h7.6z" /></svg>
}

function LockGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/* ─────────────────────────── The map ─────────────────────────── */

function RaidMap({
  views,
  doubloons,
  onSelect,
  repairOwed,
}: {
  views: RaidNodeView[]
  doubloons: number
  onSelect: (v: RaidNodeView) => void
  repairOwed: number
}) {
  const n = views.length
  const height = PAD_TOP + TOKEN / 2 + (n - 1) * ROW + TOKEN / 2 + PAD_BOTTOM
  const cx = (i: number) => COLS[i % COLS.length]
  const cy = (i: number) => PAD_TOP + TOKEN / 2 + i * ROW

  // The "current" node = first non-cleared, non-locked node. Gets a gentle pulse.
  const currentIdx = views.findIndex(v => v.status === 'available')

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      {/* Route lines behind the tokens. preserveAspectRatio=none lets x map
          to the fluid width while y stays 1:1; non-scaling-stroke keeps the
          line weight constant regardless of the horizontal stretch. */}
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height, pointerEvents: 'none' }}
      >
        {views.slice(0, -1).map((v, i) => {
          const x1 = cx(i), y1 = cy(i), x2 = cx(i + 1), y2 = cy(i + 1)
          const ym = (y1 + y2) / 2
          const lit = v.status === 'cleared'
          return (
            <path
              key={v.node.id}
              d={`M ${x1} ${y1} C ${x1} ${ym}, ${x2} ${ym}, ${x2} ${y2}`}
              fill="none"
              stroke={lit ? 'rgba(196,169,106,0.85)' : 'rgba(255,255,255,0.12)'}
              strokeWidth={lit ? 3.5 : 2.5}
              strokeDasharray={lit ? undefined : '2 5'}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>

      {views.map((v, i) => {
        const { node, status } = v
        const accent = TYPE_ACCENT[node.type] ?? '#c4a96a'
        const img = node.image ?? TYPE_IMAGE[node.type]
        const size = TYPE_SIZE[node.type] ?? 52
        const glyph = Math.round(size * 0.42)
        const badge = Math.max(15, Math.round(size * 0.34))
        const locked = status === 'locked'
        const cleared = status === 'cleared'
        // Ship sunk: no entering any combat node until it's repaired.
        const raidBlocked = repairOwed > 0 && isCombatNode(node.type)
        const interactive = !locked && !raidBlocked
        const isCurrent = i === currentIdx
        const statusWord = cleared ? (isCombatNode(node.type) ? 'Cleared' : 'Done') : locked ? 'Locked' : raidBlocked ? 'Repair ship' : 'Available'
        // Put the title plate on whichever side has the most room: a
        // node on the left half gets its label to the right, and vice
        // versa. The plate's dark background hides the route behind it.
        const labelRight = cx(i) < 50
        return (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              left: `${cx(i)}%`,
              top: cy(i),
              transform: 'translate(-50%, -50%)',
            }}
          >
            <motion.button
              onClick={() => { if (interactive) onSelect(v) }}
              whileTap={interactive ? { scale: 0.9 } : undefined}
              transition={{ type: 'spring', stiffness: 520, damping: 20 }}
              aria-label={node.label}
              aria-disabled={!interactive || undefined}
              disabled={!interactive}
              className={isCurrent && interactive ? 'raid-node-current' : undefined}
              style={{
                width: size,
                height: size,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: interactive ? 'pointer' : 'default',
                background: locked
                  ? 'radial-gradient(circle at 35% 30%, #14110d, #0a0907)'
                  : cleared
                    ? `radial-gradient(circle at 35% 30%, ${accent}33, ${accent}14)`
                    : `radial-gradient(circle at 35% 30%, ${accent}26, #0c0a08)`,
                border: `2px solid ${locked ? 'rgba(255,255,255,0.08)' : cleared ? `${accent}aa` : accent}`,
                boxShadow: locked
                  ? 'none'
                  : cleared
                    ? `0 0 0 4px ${accent}10`
                    : `0 0 14px ${accent}40, 0 0 0 4px ${accent}12`,
                opacity: locked || raidBlocked ? 0.6 : 1,
                // The pulse animation drives box-shadow; let it own the prop.
                ...(isCurrent && interactive ? { boxShadow: undefined } : {}),
                touchAction: 'manipulation',
              }}
            >
              {img ? (
                <span style={{
                  position: 'absolute', inset: 3, borderRadius: '50%', overflow: 'hidden',
                  filter: locked ? 'grayscale(1) brightness(0.5)' : undefined,
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </span>
              ) : locked ? <LockGlyph size={glyph} /> : <NodeGlyph type={node.type} color={accent} size={glyph} />}

              {locked && img && (
                <span
                  style={{
                    position: 'absolute', right: -3, bottom: -3,
                    width: badge, height: badge, borderRadius: '50%',
                    background: '#1a1814', border: '2px solid #0a0907',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <LockGlyph size={Math.round(badge * 0.52)} />
                </span>
              )}

              {cleared && (
                <span
                  style={{
                    position: 'absolute', right: -3, bottom: -3,
                    width: badge, height: badge, borderRadius: '50%',
                    background: '#1b3a24', border: '2px solid #0a0907',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <svg width={Math.round(badge * 0.55)} height={Math.round(badge * 0.55)} viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
              )}
            </motion.button>

            {/* Title beside the token (open side), vertically centred
                so it adds no height to the node. */}
            {/* Backing sits on the text itself (box-decoration-break: clone)
                so each line's plate hugs its words exactly — no loose empty
                space when a long label wraps. */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 'max-content',
                maxWidth: 124,
                pointerEvents: 'none',
                ...(labelRight
                  ? { left: '100%', marginLeft: 12, textAlign: 'left' as const }
                  : { right: '100%', marginRight: 12, textAlign: 'right' as const }),
              }}
            >
              <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', lineHeight: 1.5, color: locked ? 'rgba(240,237,232,0.45)' : '#f5f2ec', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                <span style={{ background: 'rgba(6,5,4,0.5)', borderRadius: 6, padding: '1px 6px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>
                  {node.label}
                </span>
              </p>
              <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.56rem', marginTop: 3, color: cleared ? '#4ade80' : locked ? '#6a6764' : raidBlocked ? '#f0734a' : accent, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                <span style={{ background: 'rgba(6,5,4,0.5)', borderRadius: 5, padding: '1px 5px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>
                  {statusWord}
                </span>
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ───────────────────────── Detail sheet ───────────────────────── */

function NodeDetailSheet({
  view,
  doubloons,
  ownedRaidItems,
  onClose,
}: {
  view: RaidNodeView
  doubloons: number
  ownedRaidItems: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false) // puzzle solved → show the destination
  const { node, status, claimable, lockReason } = view
  const accent = TYPE_ACCENT[node.type] ?? '#c4a96a'
  const img = node.image ?? TYPE_IMAGE[node.type]
  const locked = status === 'locked'
  const cleared = status === 'cleared'
  const detail = node.detail

  const dropsTitle = isCombatNode(node.type)
    ? 'Possible Loot'
    : node.type === 'shop' ? 'Planned Stock'
    : node.type === 'story' ? 'What You Uncover'
    : 'Reward'

  function claim() {
    setErr(null)
    startTransition(async () => {
      const res = await claimMilestoneNode(node.id)
      if ('error' in res) { setErr(res.error); return }
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
      router.refresh()
      onClose()
    })
  }

  function readStory() {
    setErr(null)
    startTransition(async () => {
      const res = await markStoryNodeRead(node.id)
      if ('error' in res) { setErr(res.error); return }
      router.refresh()
      onClose()
    })
  }

  function chooseItem(itemId: string) {
    setErr(null)
    startTransition(async () => {
      const res = await claimQuartermasterChoice(node.id, itemId)
      if ('error' in res) { setErr(res.error); return }
      router.refresh()
      onClose()
    })
  }

  function solvePuzzle() {
    setErr(null)
    startTransition(async () => {
      const res = await solvePuzzleNode(node.id)
      if ('error' in res) { setErr(res.error); return }
      // Stay open and reveal the destination — the Nav XP is already granted.
      setRevealed(true)
    })
  }

  function finishReveal() {
    router.refresh()
    onClose()
  }

  function enter() {
    if (node.route) router.push(node.route)
  }

  // Bottom CTA: varies by node type / state.
  let cta: React.ReactNode = null
  if (isCombatNode(node.type)) {
    cta = (
      <button
        onClick={enter}
        disabled={locked}
        className="font-cinzel font-700 uppercase tracking-[0.06em]"
        style={{
          width: '100%', padding: '0.85rem', borderRadius: 12,
          fontSize: '1rem',
          background: locked ? 'rgba(255,255,255,0.06)' : `${accent}26`,
          border: `1px solid ${locked ? 'rgba(255,255,255,0.1)' : `${accent}66`}`,
          color: locked ? '#5a5856' : accent,
          cursor: locked ? 'not-allowed' : 'pointer',
        }}
      >
        {locked ? 'Locked' : node.type === 'skirmish' ? 'Pick One Off →' : cleared ? 'Raid Again →' : 'Enter Raid →'}
      </button>
    )
  } else if (node.type === 'milestone') {
    if (cleared) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}>{node.milestone?.spend ? 'Passage Bought ✓' : 'Backing Secured ✓'}</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    } else if (claimable) {
      cta = (
        <button
          onClick={claim}
          disabled={pending}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: pending ? 'wait' : 'pointer' }}
        >
          {pending ? '…' : node.milestone?.spend ? `Pay · ${node.milestone.amount.toLocaleString()} ⟡` : `Claim${node.milestone?.rewardDoubloons ? ` · +${node.milestone.rewardDoubloons} ⟡` : ''}`}
        </button>
      )
    } else if (node.milestone) {
      const pct = Math.min(1, doubloons / node.milestone.amount)
      cta = (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.6rem', color: '#8a8880' }}>Coffers</span>
            <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: accent }}>
              {Math.min(doubloons, node.milestone.amount).toLocaleString()} / {node.milestone.amount.toLocaleString()} ⟡
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, background: accent, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
          <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: 8, textAlign: 'center' }}>
            {node.milestone.spend
              ? `Pay ${node.milestone.amount.toLocaleString()} ⟡ to bribe them into letting you pass.`
              : <>Hold {node.milestone.amount.toLocaleString()} ⟡ at once to claim. You won&apos;t spend it.</>}
          </p>
        </div>
      )
    }
  } else if (node.type === 'shop' && !node.choice) {
    cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>Coming Soon</div>
  } else if (node.type === 'story') {
    if (cleared) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>Logged ✓</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    } else {
      cta = (
        <button
          onClick={readStory}
          disabled={pending}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: pending ? 'wait' : 'pointer' }}
        >
          {pending ? '…' : (detail.ctaLabel ?? 'Continue the Story →')}
        </button>
      )
    }
  } else if (node.type === 'puzzle') {
    // available → the puzzle itself is rendered in the body (auto-solves);
    // cleared/locked just show a status banner here.
    if (cleared) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>Beacons Lit ✓</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    }
  }

  const sheet = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        // zIndex sits above Nav + MobileTabBar (both z-50). This is
        // portaled to <body> so it escapes the expeditions page's
        // position:relative;z-index:1 wrapper, otherwise the tab bar
        // (a body-root sibling) paints over the sheet's bottom.
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.66)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        // Keep the sheet clear of the fixed header on tall content
        // (mobile nav ~44px, desktop ~64px).
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)',
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          maxHeight: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          background: 'linear-gradient(180deg, #14110d 0%, #0a0807 100%)',
          border: `1px solid ${accent}33`,
          borderBottom: 'none',
          borderRadius: '20px 20px 0 0',
          padding: '0.85rem 1.15rem calc(1.4rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Grab handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.7rem' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Header + close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', minWidth: 0 }}>
            <div style={{
              width: 50, height: 50, borderRadius: 12, flexShrink: 0, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${accent}1a`, border: `1px solid ${accent}3a`,
            }}>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: locked ? 'grayscale(1) brightness(0.6)' : undefined }} />
              ) : locked ? <LockGlyph size={20} /> : <NodeGlyph type={node.type} color={accent} size={22} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1.15 }}>{node.label}</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: accent, background: `${accent}1f`, border: `1px solid ${accent}40`, borderRadius: 5, padding: '0.18rem 0.42rem' }}>
                  {node.type}
                </span>
                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{
                  fontSize: '0.5rem', borderRadius: 5, padding: '0.18rem 0.42rem',
                  color: cleared ? '#4ade80' : locked ? '#7a7875' : accent,
                  background: cleared ? 'rgba(74,222,128,0.14)' : locked ? 'rgba(255,255,255,0.05)' : `${accent}1f`,
                  border: `1px solid ${cleared ? 'rgba(74,222,128,0.3)' : locked ? 'rgba(255,255,255,0.12)' : `${accent}40`}`,
                }}>
                  {cleared ? (isCombatNode(node.type) ? 'Cleared' : 'Done') : locked ? 'Locked' : 'Available'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9a9690', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Description */}
        <p className="font-karla" style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'rgba(240,237,232,0.72)', whiteSpace: 'pre-line' }}>
          {detail.description}
        </p>

        {/* Where beating this leads: the story beat */}
        {node.bridge && (
          <p className="font-karla" style={{
            marginTop: '0.85rem',
            paddingLeft: '0.7rem',
            borderLeft: `2px solid ${accent}66`,
            fontSize: '0.8rem',
            lineHeight: 1.55,
            fontStyle: 'italic',
            color: cleared ? 'rgba(240,237,232,0.66)' : 'rgba(240,237,232,0.5)',
          }}>
            {node.bridge}
          </p>
        )}

        {/* Locked reason */}
        {locked && lockReason && (
          <div style={{ marginTop: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <LockGlyph size={15} />
            <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#9a9690' }}>{lockReason}</span>
          </div>
        )}

        {/* Puzzle: the beacon-chain (Lights Out), live when available */}
        {node.type === 'puzzle' && node.puzzle && status === 'available' && !revealed && (
          <div style={{ marginTop: '1.1rem' }}>
            <BeaconChainPuzzle puzzle={node.puzzle} onSolved={solvePuzzle} />
          </div>
        )}

        {/* Puzzle solved → reveal the destination (where the freight all runs) */}
        {node.type === 'puzzle' && node.puzzle && revealed && (
          <div style={{
            marginTop: '1.1rem', borderRadius: 14,
            border: `1px solid ${accent}55`,
            background: `linear-gradient(160deg, ${accent}14, rgba(12,18,28,0.4))`,
            boxShadow: `0 0 20px ${accent}22`, padding: '1.1rem 1rem',
          }}>
            <p className="font-cinzel font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: accent, marginBottom: '0.6rem', textAlign: 'center' }}>
              The Network Reads True
            </p>
            <p className="font-karla" style={{ fontSize: '0.84rem', lineHeight: 1.6, color: 'rgba(240,237,232,0.8)', whiteSpace: 'pre-line', textAlign: 'center' }}>
              {node.puzzle.reveal}
            </p>
            {node.puzzle.rewardNavXp > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.85rem' }}>
                <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
                  fontSize: '0.66rem', color: accent,
                  background: `${accent}1f`, border: `1px solid ${accent}44`,
                  borderRadius: 999, padding: '0.32rem 0.72rem',
                }}>
                  +{node.puzzle.rewardNavXp} Nav XP
                </span>
              </div>
            )}
            <button
              onClick={finishReveal}
              disabled={pending}
              className="font-cinzel font-700 uppercase tracking-[0.06em]"
              style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', borderRadius: 12, fontSize: '0.98rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: pending ? 'wait' : 'pointer' }}
            >
              Set the Heading →
            </button>
          </div>
        )}

        {/* Quartermaster's Cache: pick one, permanent */}
        {node.choice && (
          <div style={{ marginTop: '1.1rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>
              {cleared ? 'You Chose' : 'Choose One'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {node.choice.items.map(itemId => {
                const item = getRaidItem(itemId)
                if (!item) return null
                const owned = ownedRaidItems.includes(itemId)
                const rc = RARITY_COLOR[item.rarity] ?? '#9ca3af'
                const dimmed = cleared && !owned
                return (
                  <div key={itemId} style={{
                    display: 'flex', flexDirection: 'column', gap: 8,
                    background: cleared && owned ? `${rc}1f` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${cleared && owned ? `${rc}80` : `${rc}26`}`,
                    borderRadius: 10, padding: '0.7rem 0.75rem',
                    opacity: dimmed ? 0.45 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${rc}1a`, fontSize: '1rem', overflow: 'hidden' }}>
                        {item.image
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          : <span>{item.emoji}</span>}
                      </div>
                      <span className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', color: '#f0ede8' }}>{item.name}</span>
                      {cleared && owned && (
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: rc, background: `${rc}1c`, border: `1px solid ${rc}40`, borderRadius: 5, padding: '0.2rem 0.45rem', flexShrink: 0 }}>Chosen ✓</span>
                      )}
                      {cleared && !owned && (
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#6a6764', flexShrink: 0 }}>Gone</span>
                      )}
                    </div>
                    <span className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.62)', lineHeight: 1.45 }}>{item.description}</span>
                    {!cleared && (
                      <button
                        onClick={() => chooseItem(itemId)}
                        disabled={pending || locked}
                        className="font-cinzel font-700 uppercase tracking-[0.06em]"
                        style={{
                          marginTop: 2, padding: '0.6rem', borderRadius: 9,
                          fontSize: '0.82rem',
                          background: locked ? 'rgba(255,255,255,0.06)' : `${rc}26`,
                          border: `1px solid ${locked ? 'rgba(255,255,255,0.1)' : `${rc}66`}`,
                          color: locked ? '#5a5856' : rc,
                          cursor: pending ? 'wait' : locked ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {pending ? '…' : locked ? 'Locked' : `Choose ${item.name}`}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {detail.dropsNote && (
              <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: '0.55rem', lineHeight: 1.5 }}>
                {detail.dropsNote}
              </p>
            )}
          </div>
        )}

        {/* Drops / rewards. Raids/skirmishes show compact chips (icon + name)
            to stay scannable — no descriptions, odds, or notes. Story/milestone
            nodes keep the detailed rows so their fragment quotes / notes read. */}
        {((detail.drops && detail.drops.length > 0) || detail.clearReward) && (
          <div style={{ marginTop: '1.1rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>{dropsTitle}</p>
            {isCombatNode(node.type) ? (() => {
              // Raids show the guaranteed clear payout (doubloons + Nav XP)
              // plus only the rare/special crate items — the plain doubloon
              // tiers are noise, so they're rolled into the payout figure.
              const special = (detail.drops ?? []).filter(d => d.rarity === 'rare' || d.rarity === 'epic' || d.rarity === 'legendary')
              return (
                <>
                  {detail.clearReward && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: special.length ? 8 : 0 }}>
                      <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#f0c040', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.32)', borderRadius: 8, padding: '0.3rem 0.6rem' }}>
                        {detail.clearReward.doubloons.toLocaleString()} ⟡
                      </span>
                      <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#8ab0e0', background: 'rgba(112,144,192,0.12)', border: '1px solid rgba(112,144,192,0.32)', borderRadius: 8, padding: '0.3rem 0.6rem' }}>
                        {detail.clearReward.xp.toLocaleString()} Nav XP
                      </span>
                    </div>
                  )}
                  {special.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {special.map(d => {
                        const rc = d.rarity ? RARITY_COLOR[d.rarity] : '#9ca3af'
                        return (
                          <span key={d.label} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                            background: `${rc}14`, border: `1px solid ${rc}33`,
                            borderRadius: 8, padding: '0.28rem 0.5rem 0.28rem 0.35rem',
                          }}>
                            <span style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', overflow: 'hidden' }}>
                              {d.swatch
                                ? <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: 3, background: d.swatch, filter: d.swatchFilter }} />
                                : d.image
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={d.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                  : <span>{d.emoji}</span>}
                            </span>
                            <span className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#e8e2d8', whiteSpace: 'nowrap' }}>{d.label}</span>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            })() : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {(detail.drops ?? []).map(d => {
                  const rc = d.rarity ? RARITY_COLOR[d.rarity] : '#9ca3af'
                  // Plain loot packs two-up; anything with a description
                  // (or a lone reward) spans the row so its text stays
                  // readable.
                  const full = !!d.sublabel || detail.drops!.length === 1
                  return (
                    <div key={d.label} style={{
                      gridColumn: full ? '1 / -1' : undefined,
                      display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0,
                      background: 'rgba(255,255,255,0.03)', border: `1px solid ${rc}26`,
                      borderRadius: 9, padding: '0.4rem 0.5rem',
                    }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${rc}1a`, fontSize: '0.9rem', overflow: 'hidden',
                      }}>
                        {d.swatch
                          ? <div style={{ width: '100%', height: '100%', background: d.swatch, filter: d.swatchFilter }} />
                          : d.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={d.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            : <span>{d.emoji}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.74rem', color: '#e8e2d8', whiteSpace: full ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
                        {d.sublabel && (
                          <span className="font-karla" style={{ display: 'block', fontSize: '0.62rem', color: '#8a8880', lineHeight: 1.35, marginTop: 1 }}>{d.sublabel}</span>
                        )}
                      </div>
                      {d.chance && (
                        <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.54rem', color: rc, background: `${rc}1c`, border: `1px solid ${rc}40`, borderRadius: 5, padding: '0.2rem 0.4rem', flexShrink: 0 }}>
                          {d.chance}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {!isCombatNode(node.type) && detail.dropsNote && (
              <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: '0.55rem', lineHeight: 1.5 }}>
                {detail.dropsNote}
              </p>
            )}
          </div>
        )}

        {err && <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#f08a8a', marginTop: '0.9rem' }}>{err}</p>}

        {cta && <div style={{ marginTop: '1.3rem' }}>{cta}</div>}
      </motion.div>
    </motion.div>
  )

  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : null
}

/* ─────────────────────── Collapsible section ─────────────────── */

export default function RaidsSection({ views, doubloons, repairOwed, ownedRaidItems }: { views: RaidNodeView[]; doubloons: number; repairOwed: number; ownedRaidItems: string[] }) {
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState<RaidNodeView | null>(null)
  const clearedCount = views.filter(v => v.status === 'cleared').length

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          marginBottom: open ? '0.7rem' : 0,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem' }}>
          <span className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', letterSpacing: '0.04em' }}>Raids</span>
          <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#6a6764' }}>{clearedCount}/{views.length} cleared</span>
        </span>
        <span style={{ color: '#6a6764', fontSize: '0.9rem', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {open && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(28,20,10,0.72) 0%, rgba(18,14,6,0.82) 100%)',
          border: '1px solid rgba(240,192,64,0.18)',
          borderRadius: 16,
          padding: '0.9rem 0.75rem',
        }}>
          {/* Next-up objective — surfaces the first non-cleared node at the
              top of the card so the player sees what to do without hunting the
              map. Three states: available (tap → detail sheet), locked (dimmed
              + unlock reason), or all-cleared (a short note). Respects the same
              repair block as the map so it can't bypass a sunk ship. */}
          {(() => {
            const next = views.find(v => v.status !== 'cleared')

            // Everything cleared — celebratory note so the card isn't empty.
            if (!next) {
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  background: 'linear-gradient(135deg, rgba(74,222,128,0.12) 0%, rgba(8,7,6,0.35) 72%)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  borderRadius: 13, padding: '0.75rem 0.85rem', margin: '0.2rem 0 0.7rem',
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.3)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#d6f5e0', lineHeight: 1.15 }}>All raids cleared</p>
                    <p className="font-karla" style={{ fontSize: '0.66rem', color: 'rgba(240,237,232,0.55)', marginTop: 2 }}>New waters are coming. Keep your hold heavy.</p>
                  </div>
                </div>
              )
            }

            const accent = TYPE_ACCENT[next.node.type] ?? '#c4a96a'
            const img = next.node.image ?? TYPE_IMAGE[next.node.type]
            const isLocked = next.status === 'locked'
            const blocked = !isLocked && repairOwed > 0 && isCombatNode(next.node.type)
            const interactive = !isLocked && !blocked
            return (
              <button
                onClick={() => { if (interactive) setSelected(next) }}
                disabled={!interactive}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  textAlign: 'left', width: '100%',
                  cursor: interactive ? 'pointer' : 'default',
                  background: isLocked
                    ? 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(8,7,6,0.35) 72%)'
                    : `linear-gradient(135deg, ${accent}24 0%, rgba(8,7,6,0.35) 72%)`,
                  border: `1px solid ${isLocked ? 'rgba(255,255,255,0.12)' : `${accent}45`}`,
                  borderRadius: 13,
                  padding: '0.7rem 0.8rem',
                  margin: '0.2rem 0 0.7rem',
                  opacity: isLocked ? 0.85 : blocked ? 0.7 : 1,
                }}
              >
                <div style={{ width: 50, height: 50, borderRadius: 11, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isLocked ? 'rgba(255,255,255,0.05)' : `${accent}1a`, border: `1px solid ${isLocked ? 'rgba(255,255,255,0.12)' : `${accent}4a`}` }}>
                  {img
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isLocked ? 'grayscale(1) brightness(0.55)' : undefined }} />
                    : isLocked ? <LockGlyph size={22} /> : <NodeGlyph type={next.node.type} color={accent} size={24} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: isLocked ? '#8a8680' : accent }}>{isLocked ? 'Up next' : 'Next up'}</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: isLocked ? 'rgba(245,242,236,0.7)' : '#f5f2ec', lineHeight: 1.15, margin: '2px 0 3px' }}>{next.node.label}</p>
                  <p className="font-karla" style={{ fontSize: '0.66rem', lineHeight: 1.35, color: blocked ? '#f0a36a' : isLocked ? '#9a9690' : 'rgba(240,237,232,0.6)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {isLocked ? (next.lockReason ?? 'Locked') : blocked ? 'Repair your ship before you can set sail.' : next.node.flavor}
                  </p>
                </div>
                {isLocked ? (
                  <div style={{ flexShrink: 0 }}><LockGlyph size={16} /></div>
                ) : !blocked ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
                ) : null}
              </button>
            )
          })()}

          <RaidMap views={views} doubloons={doubloons} onSelect={setSelected} repairOwed={repairOwed} />
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <NodeDetailSheet
            key={selected.node.id}
            view={selected}
            doubloons={doubloons}
            ownedRaidItems={ownedRaidItems}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
