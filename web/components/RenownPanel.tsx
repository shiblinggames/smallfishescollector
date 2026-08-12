'use client'

// Shared Renown board for both skills (Fishing / Navigation). Post-level-100
// progression: each Renown level banks ONE point you spend here on a small
// board of tiny stat boosts. Points bank until you spend them, and a spend is
// undone only by a RESPEC TOKEN, which clears one board back to banked. So a
// choice still means something; it is just no longer forever.
//
// Server-authoritative: allocate goes through actions/renown.ts, which
// re-derives the level from XP and can't be over-spent. We update optimistically
// for feel, then reconcile with the returned state.

import { useState, useCallback, useEffect } from 'react'
import CloseButton from '@/components/CloseButton'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import { vibrate } from '@/lib/haptics'
import { playRenownPointSfx } from '@/lib/fishingMusic'
import {
  renownStats, formatRenownTotal, RENOWN_RESPEC_GEM_COST,
  type RenownSkill, type RenownStat, type RenownAlloc,
} from '@/lib/renown'
import { commitRenown, respecRenown, buyRenownRespec, getRenownState, type RenownState } from '@/app/(app)/actions/renown'

interface Props {
  open: boolean
  onClose: () => void
  skill: RenownSkill
  /** Server-read state to seed the board (level, spent, available, alloc). */
  initial: RenownState
  /** Fired after every allocate so a parent can sync its own copy of the alloc
   *  (e.g. to update a "points to spend" badge on the XP bar). */
  onChange?: (state: RenownState) => void
}

const SKILL_META: Record<RenownSkill, { title: string; accent: string; sub: string }> = {
  fishing: { title: 'Fishing Renown', accent: '#5eead4', sub: 'Every point sharpens the angler.' },
  nav:     { title: 'Navigation Renown', accent: '#60a5fa', sub: 'Every point hardens the captain.' },
}

export default function RenownPanel({ open, onClose, skill, initial, onChange }: Props) {
  const meta = SKILL_META[skill]
  const stats = renownStats(skill)

  const [state, setState] = useState<RenownState>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Pending, UNSAVED allocations — points added this session that only persist
  // when the player hits Confirm. Committed points live in `state.alloc`.
  const [draft, setDraft] = useState<RenownAlloc>({})
  // Drives the per-stat "pop" — bump a stat's key so its value re-mounts and
  // springs. Also a short color-burst flag per stat id.
  const [burst, setBurst] = useState<string | null>(null)

  // Re-seed from the server-read state each time the panel opens — the derived
  // Renown level can have grown while it was closed — and drop any stale draft.
  useEffect(() => { if (open) { setState(initial); setDraft({}); setErr(null) } }, [open, initial])

  // Then go and get the authoritative numbers. The seed is built client-side by
  // whichever bar opened this, from props read at page load, and it cannot know
  // the respec count or the gem balance: gems move constantly elsewhere in the
  // game, so a page-load figure would misprice the buy button. Render instantly
  // off the seed, correct a beat later.
  useEffect(() => {
    if (!open) return
    let live = true
    getRenownState(skill).then(fresh => { if (live && fresh) setState(fresh) })
    return () => { live = false }
  }, [open, skill])

  const draftTotal = Object.values(draft).reduce((n, v) => n + (v || 0), 0)
  const available = state.available - draftTotal   // banked points still free to stage
  const has = available > 0

  // Stage one point onto a stat (local only — nothing saves until Confirm).
  const addDraft = useCallback((stat: RenownStat) => {
    if (available <= 0) return
    setErr(null)
    setDraft(d => ({ ...d, [stat.id]: (d[stat.id] ?? 0) + 1 }))
    setBurst(stat.id)
    vibrate(12)
    playRenownPointSfx()
    setTimeout(() => setBurst(b => (b === stat.id ? null : b)), 320)
  }, [available])

  // Take a staged point back off (only pending points can be removed).
  const removeDraft = useCallback((stat: RenownStat) => {
    setDraft(d => {
      const cur = d[stat.id] ?? 0
      if (cur <= 0) return d
      const next = { ...d, [stat.id]: cur - 1 }
      if (next[stat.id] === 0) delete next[stat.id]
      return next
    })
    vibrate(8)
  }, [])

  const clearDraft = useCallback(() => { setDraft({}); setErr(null) }, [])

  // Persist the whole draft in one server call. Server re-validates the total.
  const confirmDraft = useCallback(async () => {
    if (busy || draftTotal <= 0) return
    setBusy(true)
    setErr(null)
    try {
      const res = await commitRenown(skill, draft)
      if (res && 'error' in res) { setErr(res.error) }
      else if (res) { setState(res); setDraft({}); onChange?.(res); vibrate([10, 30, 14]) }
    } finally {
      setBusy(false)
    }
  }, [busy, draftTotal, skill, draft, onChange])

  // RESPEC. Two taps, never one: wiping a board a player spent a long grind
  // filling is not something a stray thumb should be able to do, and it costs a
  // token they may have paid gems for. `confirm` holds which action is armed.
  const [confirm, setConfirm] = useState<null | 'respec' | 'buy'>(null)
  useEffect(() => { if (!open) setConfirm(null) }, [open])

  const doRespec = useCallback(async () => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const res = await respecRenown(skill)
      if (res && 'error' in res) setErr(res.error)
      else if (res) { setState(res); setDraft({}); setConfirm(null); onChange?.(res); vibrate([14, 40, 18]) }
    } finally { setBusy(false) }
  }, [busy, skill, onChange])

  const doBuy = useCallback(async () => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const res = await buyRenownRespec(skill)
      if (res && 'error' in res) setErr(res.error)
      else if (res) { setState(res); setConfirm(null); onChange?.(res); vibrate([10, 30, 14]) }
    } finally { setBusy(false) }
  }, [busy, skill, onChange])

  return (
    <PopupShell open={open} onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'relative',
          margin: 'auto', width: '100%', maxWidth: 440,
          background: 'linear-gradient(180deg, rgba(10,16,28,0.99) 0%, rgba(6,10,18,0.99) 100%)',
          border: `1px solid ${meta.accent}44`,
          borderRadius: 20,
          padding: '1.25rem 1.15rem 1.35rem',
          boxShadow: `0 0 60px ${meta.accent}22, 0 24px 60px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Close — X at the top-right, matching the app's other modals. */}
        <CloseButton onClick={onClose} style={{ position: 'absolute', top: 8, right: 10, zIndex: 3 }} />

        {/* Header — title + a single efficient status line: Renown level on the
            left, a prominent (pulsing) "points to spend" pill on the right. No
            big stat cards; the numbers live inline. */}
        <div style={{ marginBottom: '1rem' }}>
          <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
             style={{ fontSize: '0.95rem', color: '#fff', textShadow: `0 0 22px ${meta.accent}66`, textAlign: 'center' }}>
            {meta.title}
          </p>
          <p className="font-karla font-400" style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.4)', marginTop: 2, textAlign: 'center' }}>
            {meta.sub}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: '0.85rem' }}>
            <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: meta.accent, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ opacity: 0.85 }}>✦</span> Renown {state.level}
            </span>
            {has ? (
              <motion.span
                key={available}
                initial={{ scale: 1.18 }}
                animate={{
                  scale: 1,
                  boxShadow: [`0 0 0px ${meta.accent}00`, `0 0 20px ${meta.accent}88`, `0 0 0px ${meta.accent}00`],
                }}
                transition={{ scale: { type: 'spring', stiffness: 480, damping: 18 }, boxShadow: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } }}
                className="font-karla font-700 uppercase tracking-[0.06em]"
                style={{
                  fontSize: '0.64rem', color: '#0a0f1c', background: meta.accent,
                  borderRadius: 999, padding: '0.32rem 0.7rem', whiteSpace: 'nowrap',
                }}
              >
                {available} point{available === 1 ? '' : 's'} to spend
              </motion.span>
            ) : (
              <span className="font-karla font-700 uppercase tracking-[0.06em]"
                style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                {state.spent > 0 ? 'All points spent' : 'Earn Renown for points'}
              </span>
            )}
          </div>
        </div>

        {/* Stat board — each stat is its own card. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stats.map(stat => {
            const committed = state.alloc[stat.id] ?? 0
            const pending = draft[stat.id] ?? 0
            const pts = committed + pending          // projected total if confirmed
            const canBuy = available > 0 && !busy
            const active = pts > 0
            return (
              <div key={stat.id} style={{
                position: 'relative', overflow: 'hidden',
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '0.85rem 0.9rem', borderRadius: 16,
                background: active
                  ? `linear-gradient(180deg, ${stat.color}14 0%, rgba(255,255,255,0.02) 100%)`
                  : 'rgba(255,255,255,0.035)',
                border: `1px solid ${active ? stat.color + '66' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: active ? `inset 3px 0 0 ${stat.color}` : 'inset 3px 0 0 rgba(255,255,255,0.06)',
                transition: 'border-color 0.25s, background 0.25s, box-shadow 0.25s',
              }}>
                {/* Color-burst flash on allocate */}
                <AnimatePresence>
                  {burst === stat.id && (
                    <motion.div
                      key="burst"
                      initial={{ opacity: 0.55, scale: 0.6 }}
                      animate={{ opacity: 0, scale: 1.6 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.32, ease: 'easeOut' }}
                      style={{
                        position: 'absolute', inset: 0, borderRadius: 16,
                        background: `radial-gradient(circle at 82% 50%, ${stat.color}55 0%, transparent 65%)`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </AnimatePresence>

                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#f0ede8' }}>{stat.name}</span>
                    {active ? (
                      // Running total once invested — "+7.5% doubloons".
                      <motion.span
                        key={pts}                       /* re-mount → spring pop on change */
                        initial={{ scale: 1.5, opacity: 0.4 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 16 }}
                        className="font-karla font-700"
                        style={{ fontSize: '0.74rem', color: stat.color, textShadow: `0 0 12px ${stat.color}66` }}
                      >
                        {formatRenownTotal(stat, pts)} {stat.unit}
                      </motion.span>
                    ) : (
                      // Per-point value before you invest — "+1.5% doubloons".
                      <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: `${stat.color}aa` }}>
                        {formatRenownTotal(stat, 1)} {stat.unit}
                      </span>
                    )}
                  </div>
                  <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    {stat.blurb}
                  </p>
                </div>

                {/* Count + −/+ steppers. − only removes points staged this
                    session (committed points are permanent). Nothing saves
                    until Confirm below. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                  {pending > 0 && (
                    <button
                      onClick={() => removeDraft(stat)}
                      aria-label={`Remove a staged point from ${stat.name}`}
                      style={{
                        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                        display: 'grid', placeItems: 'center', fontSize: '1.15rem', lineHeight: 1, fontWeight: 700,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)',
                        color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                      }}
                    >−</button>
                  )}
                  <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: active ? stat.color : 'rgba(255,255,255,0.35)', minWidth: 14, textAlign: 'right' }}>
                    {pts}
                    {pending > 0 && <span className="font-karla font-700" style={{ fontSize: '0.5rem', color: stat.color, marginLeft: 1, verticalAlign: 'super' }}>+{pending}</span>}
                  </span>
                  <button
                    onClick={() => addDraft(stat)}
                    disabled={!canBuy}
                    aria-label={`Stage a point on ${stat.name}`}
                    style={{
                      width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                      display: 'grid', placeItems: 'center',
                      fontSize: '1.3rem', lineHeight: 1, fontWeight: 700,
                      background: canBuy ? `${stat.color}26` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${canBuy ? stat.color + '88' : 'rgba(255,255,255,0.08)'}`,
                      color: canBuy ? stat.color : 'rgba(255,255,255,0.22)',
                      cursor: canBuy ? 'pointer' : 'default',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >+</button>
                </div>
              </div>
            )
          })}
        </div>

        {err && (
          <p className="font-karla font-600" style={{ fontSize: '0.64rem', color: '#f87171', textAlign: 'center', marginTop: '0.9rem' }}>{err}</p>
        )}

        {draftTotal > 0 ? (
          <>
            <p className="font-karla font-400" style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.42)', textAlign: 'center', marginTop: '0.9rem', letterSpacing: '0.03em' }}>
              Not saved yet. Once confirmed it takes a respec to undo.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: '0.55rem' }}>
              <button
                onClick={confirmDraft}
                disabled={busy}
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{ flex: 1, padding: '0.7rem', borderRadius: 12, fontSize: '0.72rem', background: `${meta.accent}26`, border: `1px solid ${meta.accent}88`, color: meta.accent, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Saving…' : `Confirm ${draftTotal} Point${draftTotal === 1 ? '' : 's'}`}
              </button>
              <button
                onClick={clearDraft}
                disabled={busy}
                className="font-karla font-600"
                style={{ padding: '0.7rem 1rem', borderRadius: 12, fontSize: '0.68rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)', cursor: busy ? 'default' : 'pointer' }}
              >
                Clear
              </button>
            </div>
          </>
        ) : (
          <p className="font-karla font-400" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.32)', textAlign: 'center', marginTop: '1rem', letterSpacing: '0.03em' }}>
            Points bank until you spend them. Choose deliberately, or keep a respec in your pocket.
          </p>
        )}

        {/* THE RESPEC BENCH. Below the board and quiet, because it is the thing
            you reach for once rather than the thing you came here to do. Hidden
            entirely while a draft is staged: Clear already undoes unsaved
            points for nothing, and offering a token beside it would sell a
            player something they do not need yet. */}
        {draftTotal === 0 && (
          <div style={{ marginTop: '1.1rem', paddingTop: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.42)' }}>Respec</span>
              <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: state.respecs > 0 ? meta.accent : 'rgba(255,255,255,0.3)' }}>
                {state.respecs} in hand
              </span>
            </div>

            {confirm === 'respec' ? (
              <>
                <p className="font-karla" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.66)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                  Returns all {state.spent} point{state.spent === 1 ? '' : 's'} on this board to spend again. Your {skill === 'fishing' ? 'Navigation' : 'Fishing'} board is untouched. Costs one respec.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: '0.55rem' }}>
                  <button onClick={doRespec} disabled={busy} className="font-karla font-700 uppercase tracking-[0.1em]"
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 12, fontSize: '0.68rem', background: `${meta.accent}26`, border: `1px solid ${meta.accent}88`, color: meta.accent, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                    {busy ? 'Returning…' : 'Return the points'}
                  </button>
                  <button onClick={() => setConfirm(null)} disabled={busy} className="font-karla font-600"
                    style={{ padding: '0.65rem 1rem', borderRadius: 12, fontSize: '0.66rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                    Keep it
                  </button>
                </div>
              </>
            ) : confirm === 'buy' ? (
              <>
                <p className="font-karla" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.66)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                  One respec for <span style={{ color: '#c084fc', fontWeight: 700 }}>◆ {RENOWN_RESPEC_GEM_COST.toLocaleString()}</span>. You hold ◆ {state.gems.toLocaleString()}. It keeps until you use it, on either board.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: '0.55rem' }}>
                  <button onClick={doBuy} disabled={busy || state.gems < RENOWN_RESPEC_GEM_COST} className="font-karla font-700 uppercase tracking-[0.1em]"
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 12, fontSize: '0.68rem', background: 'rgba(192,132,252,0.16)', border: '1px solid rgba(192,132,252,0.55)', color: '#d8b4fe', cursor: busy ? 'wait' : 'pointer', opacity: busy || state.gems < RENOWN_RESPEC_GEM_COST ? 0.5 : 1 }}>
                    {busy ? 'Buying…' : `Buy for ◆ ${RENOWN_RESPEC_GEM_COST.toLocaleString()}`}
                  </button>
                  <button onClick={() => setConfirm(null)} disabled={busy} className="font-karla font-600"
                    style={{ padding: '0.65rem 1rem', borderRadius: 12, fontSize: '0.66rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                    Not now
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: '0.55rem' }}>
                <button
                  onClick={() => setConfirm('respec')}
                  disabled={state.respecs <= 0 || state.spent <= 0}
                  className="font-karla font-700"
                  style={{ flex: 1, padding: '0.6rem', borderRadius: 12, fontSize: '0.68rem',
                    background: state.respecs > 0 && state.spent > 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${state.respecs > 0 && state.spent > 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                    color: state.respecs > 0 && state.spent > 0 ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.28)',
                    cursor: state.respecs > 0 && state.spent > 0 ? 'pointer' : 'default' }}>
                  {state.spent <= 0 ? 'Nothing spent yet' : 'Respec this board'}
                </button>
                <button onClick={() => setConfirm('buy')} className="font-karla font-700"
                  style={{ padding: '0.6rem 0.9rem', borderRadius: 12, fontSize: '0.68rem', background: 'rgba(192,132,252,0.12)', border: '1px solid rgba(192,132,252,0.4)', color: '#d8b4fe', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Buy ◆ {RENOWN_RESPEC_GEM_COST.toLocaleString()}
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </PopupShell>
  )
}
