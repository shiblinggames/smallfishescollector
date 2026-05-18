'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import type { RaidNodeView } from '@/lib/raidMap'
import { RARITY_COLOR } from '@/lib/bossRaids'
import { claimMilestoneNode } from './raidMapActions'

const TYPE_ACCENT: Record<string, string> = {
  combat: '#f97316',
  milestone: '#c4a96a',
  shop: '#a78bfa',
}

// Winding sea-chart layout. Nodes cycle through these x positions (% of
// width) top→bottom so the route zig-zags like a Slay-the-Spire map. The
// pattern repeats, so appending nodes to RAID_MAP just extends the route.
const COLS = [50, 73, 27, 62, 38, 70, 30]
const ROW = 116          // vertical pitch between node centres
const TOKEN = 60         // token diameter
const PAD_TOP = 30
const PAD_BOTTOM = 16

function NodeGlyph({ type, color, size = 22 }: { type: string; color: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (type === 'combat') return <svg {...common}><path d="M3 17l6-6M14.5 6.5L21 13M6 21l-3-3M9 3l12 12-3 3L6 6z" /></svg>
  if (type === 'shop') return <svg {...common}><path d="M3 9l1.5-5h15L21 9M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 13h6" /></svg>
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
}: {
  views: RaidNodeView[]
  doubloons: number
  onSelect: (v: RaidNodeView) => void
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
              strokeWidth={lit ? 3 : 2}
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
        const locked = status === 'locked'
        const cleared = status === 'cleared'
        const isCurrent = i === currentIdx
        const statusWord = cleared ? (node.type === 'combat' ? 'Cleared' : 'Done') : locked ? 'Locked' : 'Available'

        return (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              left: `${cx(i)}%`,
              top: cy(i),
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              width: 116,
            }}
          >
            <motion.button
              onClick={() => onSelect(v)}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 520, damping: 20 }}
              aria-label={node.label}
              className={isCurrent ? 'raid-node-current' : undefined}
              style={{
                width: TOKEN,
                height: TOKEN,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: 'pointer',
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
                opacity: locked ? 0.6 : 1,
                // The pulse animation drives box-shadow; let it own the prop.
                ...(isCurrent ? { boxShadow: undefined } : {}),
                touchAction: 'manipulation',
              }}
            >
              {node.image ? (
                <div style={{
                  position: 'absolute', inset: 3, borderRadius: '50%', overflow: 'hidden',
                  filter: locked ? 'grayscale(1) brightness(0.5)' : undefined,
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={node.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : locked ? <LockGlyph size={20} /> : <NodeGlyph type={node.type} color={accent} size={24} />}

              {locked && node.image && (
                <span
                  style={{
                    position: 'absolute', right: -3, bottom: -3,
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#1a1814', border: '2px solid #0a0907',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <LockGlyph size={10} />
                </span>
              )}

              {cleared && (
                <span
                  style={{
                    position: 'absolute', right: -3, bottom: -3,
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#1b3a24', border: '2px solid #0a0907',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
              )}
            </motion.button>

            <div style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.7rem', lineHeight: 1.2, color: locked ? 'rgba(240,237,232,0.4)' : '#f0ede8' }}>
                {node.label}
              </p>
              <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', marginTop: 2, color: cleared ? '#4ade80' : locked ? '#5a5856' : accent }}>
                {statusWord}
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
  onClose,
}: {
  view: RaidNodeView
  doubloons: number
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const { node, status, claimable, lockReason } = view
  const accent = TYPE_ACCENT[node.type] ?? '#c4a96a'
  const locked = status === 'locked'
  const cleared = status === 'cleared'
  const detail = node.detail

  const dropsTitle = node.type === 'combat' ? 'Possible Loot' : node.type === 'shop' ? 'Planned Stock' : 'Reward'

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

  function enter() {
    if (node.route) router.push(node.route)
  }

  // Bottom CTA — varies by node type / state.
  let cta: React.ReactNode = null
  if (node.type === 'combat') {
    cta = (
      <button
        onClick={enter}
        disabled={locked}
        className="font-cinzel font-700 uppercase tracking-[0.08em]"
        style={{
          width: '100%', padding: '0.85rem', borderRadius: 12, border: 'none',
          fontSize: '0.95rem',
          background: locked ? 'rgba(255,255,255,0.06)' : accent,
          color: locked ? '#5a5856' : '#1a0f02',
          cursor: locked ? 'not-allowed' : 'pointer',
        }}
      >
        {locked ? 'Locked' : cleared ? 'Sail Again →' : 'Enter Raid →'}
      </button>
    )
  } else if (node.type === 'milestone') {
    if (cleared) {
      cta = <div className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '0.95rem', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}>Backing Secured ✓</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '0.95rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    } else if (claimable) {
      cta = (
        <button
          onClick={claim}
          disabled={pending}
          className="font-cinzel font-700 uppercase tracking-[0.08em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, border: 'none', fontSize: '0.95rem', background: accent, color: '#1a0f02', cursor: pending ? 'wait' : 'pointer' }}
        >
          {pending ? '…' : `Claim${node.milestone?.rewardDoubloons ? ` · +${node.milestone.rewardDoubloons} ⟡` : ''}`}
        </button>
      )
    } else if (node.milestone) {
      const pct = Math.min(1, doubloons / node.milestone.amount)
      cta = (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.6rem', color: '#8a8880' }}>Coffers</span>
            <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#c4a96a' }}>
              {Math.min(doubloons, node.milestone.amount).toLocaleString()} / {node.milestone.amount.toLocaleString()} ⟡
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, background: accent, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
          <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: 8, textAlign: 'center' }}>
            Hold {node.milestone.amount.toLocaleString()} ⟡ at once to claim — you won&apos;t spend it.
          </p>
        </div>
      )
    }
  } else {
    cta = <div className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '0.95rem', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)', color: '#a78bfa' }}>Coming Soon</div>
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
        // position:relative;z-index:1 wrapper — otherwise the tab bar
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
              {node.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={node.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: locked ? 'grayscale(1) brightness(0.6)' : undefined }} />
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
                  {cleared ? (node.type === 'combat' ? 'Cleared' : 'Done') : locked ? 'Locked' : 'Available'}
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
        <p className="font-karla" style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'rgba(240,237,232,0.72)' }}>
          {detail.description}
        </p>

        {/* Locked reason */}
        {locked && lockReason && (
          <div style={{ marginTop: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <LockGlyph size={15} />
            <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#9a9690' }}>{lockReason}</span>
          </div>
        )}

        {/* Foes */}
        {detail.enemies && detail.enemies.length > 0 && (
          <div style={{ marginTop: '1.1rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>You&apos;ll Face</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detail.enemies.map(e => (
                <span key={e} className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#d8d2c8', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.22)', borderRadius: 7, padding: '0.3rem 0.6rem' }}>
                  {e}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Drops / rewards */}
        {detail.drops && detail.drops.length > 0 && (
          <div style={{ marginTop: '1.1rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>{dropsTitle}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {detail.drops.map(d => {
                const rc = d.rarity ? RARITY_COLOR[d.rarity] : '#9ca3af'
                return (
                  <div key={d.label} style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem',
                    background: 'rgba(255,255,255,0.03)', border: `1px solid ${rc}26`,
                    borderRadius: 10, padding: '0.5rem 0.7rem',
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${rc}1a`, fontSize: '1rem', overflow: 'hidden',
                    }}>
                      {d.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={d.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        : <span>{d.emoji}</span>}
                    </div>
                    <span className="font-karla font-600" style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', color: '#e8e2d8' }}>{d.label}</span>
                    {d.chance && (
                      <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.56rem', color: rc, background: `${rc}1c`, border: `1px solid ${rc}40`, borderRadius: 6, padding: '0.22rem 0.45rem', flexShrink: 0 }}>
                        {d.chance}
                      </span>
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

        {err && <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#f08a8a', marginTop: '0.9rem' }}>{err}</p>}

        <div style={{ marginTop: '1.3rem' }}>{cta}</div>
      </motion.div>
    </motion.div>
  )

  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : null
}

/* ─────────────────────── Collapsible section ─────────────────── */

export default function RaidsSection({ views, doubloons }: { views: RaidNodeView[]; doubloons: number }) {
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
          background: 'linear-gradient(180deg, rgba(12,10,8,0.6) 0%, rgba(8,7,6,0.6) 100%)',
          border: '1px solid rgba(196,169,106,0.14)',
          borderRadius: 16,
          padding: '0.5rem 0.25rem',
        }}>
          <RaidMap views={views} doubloons={doubloons} onSelect={setSelected} />
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <NodeDetailSheet
            key={selected.node.id}
            view={selected}
            doubloons={doubloons}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
