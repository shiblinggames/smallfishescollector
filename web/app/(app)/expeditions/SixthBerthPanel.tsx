'use client'

// The Sixth Berth — a purchasable Man-o-War crew slot (5 → 6), unlocked by
// beating Raid 7 (the Blockade). A deliberate power-spike sink: it opens the
// full six-crew bench Don Finleone's six phases demand. Lives in Manage Ship →
// Ship, right under the ultimate build. Three states: locked teaser (Sal Brackwater
// not beaten), buyable, and installed.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { buySixthBerth } from './actions'
import { SIXTH_BERTH_COST } from '@/lib/shipBerth'
import { vibrate } from '@/lib/haptics'

const ACCENT = '#e0a44a'

export default function SixthBerthPanel({
  blockadeCleared, hasSixthBerth, baseCrewSlots, doubloons,
}: {
  blockadeCleared: boolean
  hasSixthBerth: boolean
  /** The ship's own crew slots WITHOUT the berth (5 on the Man-o-War). */
  baseCrewSlots: number
  doubloons: number
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Nothing to show until Sal Brackwater falls (that clear is the reveal).
  if (!blockadeCleared && !hasSixthBerth) return null

  const canAfford = doubloons >= SIXTH_BERTH_COST

  async function buy() {
    if (busy) return
    setBusy(true); setErr(null)
    const res = await buySixthBerth()
    setBusy(false)
    if (!res.ok) { setErr(res.error ?? 'Could not add the crew slot.'); return }
    vibrate([0, 45, 55, 90])
    setCelebrate(true)
    setConfirming(false)
    if (typeof res.doubloons === 'number') window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
  }

  const HEADER = (
    <>
      <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#ffd56b', marginBottom: '0.3rem', letterSpacing: '0.04em' }}>A Sixth Crew Slot</p>
      <p className="font-karla" style={{ fontSize: '0.74rem', color: '#8a8480', marginBottom: '0.85rem', lineHeight: 1.45 }}>
        Re-frame the Man-o-War's deck for a sixth crew slot. One more crew aboard, permanently, on every raid and every voyage.
      </p>
    </>
  )

  // ── Installed ──────────────────────────────────────────────────────────────
  if (hasSixthBerth) {
    if (celebrate) return (
      <div style={{ marginBottom: '1.7rem' }}>
        {HEADER}
        <BerthCelebration crew={baseCrewSlots + 1} onDone={() => { setCelebrate(false); router.refresh() }} />
      </div>
    )
    return (
      <div style={{ marginBottom: '1.7rem' }}>
        {HEADER}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, padding: '0.95rem 1rem', background: `${ACCENT}14`, border: `1px solid ${ACCENT}55`, boxShadow: `0 0 22px ${ACCENT}1a` }}>
          <CrewGlyph n={baseCrewSlots + 1} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: ACCENT }}>Six crew slots, all yours</p>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a948c', marginTop: 2 }}>Field a full crew of {baseCrewSlots + 1} every fight.</p>
          </div>
          <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ flexShrink: 0, fontSize: '0.5rem', color: '#0c0f14', background: ACCENT, borderRadius: 999, padding: '0.2rem 0.6rem' }}>Installed</span>
        </div>
      </div>
    )
  }

  // ── Buyable ────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginBottom: '1.7rem' }}>
      {HEADER}
      <div style={{ borderRadius: 16, padding: '1rem', background: `linear-gradient(180deg, ${ACCENT}12 0%, rgba(12,14,20,0.6) 100%)`, border: `1px solid ${ACCENT}55`, boxShadow: `0 0 26px ${ACCENT}16` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <CrewGlyph n={baseCrewSlots + 1} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#f5f2ec' }}>
              <span style={{ color: '#9a948c' }}>{baseCrewSlots} crew</span> → <span style={{ color: ACCENT }}>{baseCrewSlots + 1} crew</span>
            </p>
            <p className="font-karla" style={{ fontSize: '0.66rem', color: '#9a948c', marginTop: 2, lineHeight: 1.4 }}>One more crew, and one more ability, in every fight you ever sail.</p>
          </div>
        </div>
        {confirming ? (
          <div>
            <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#e0a955', lineHeight: 1.4, marginBottom: 8, textAlign: 'center' }}>
              {SIXTH_BERTH_COST.toLocaleString()} ⟡, once. A permanent sixth crew slot.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { setConfirming(false); setErr(null) }} disabled={busy}
                className="font-karla font-700 uppercase tracking-[0.08em] tap"
                style={{ flex: 1, padding: '0.7rem', borderRadius: 10, fontSize: '0.7rem', color: '#cfc9bf', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={() => canAfford && buy()} disabled={!canAfford || busy}
                className="font-karla font-700 uppercase tracking-[0.08em] tap"
                style={{ flex: 1.5, padding: '0.7rem', borderRadius: 10, fontSize: '0.7rem', cursor: canAfford && !busy ? 'pointer' : 'default', color: canAfford ? '#0c0f14' : '#6a6764', background: canAfford ? `linear-gradient(180deg, ${ACCENT}, ${ACCENT}cc)` : 'rgba(255,255,255,0.04)', border: 'none', boxShadow: canAfford ? `0 0 18px ${ACCENT}55` : 'none' }}>
                {busy ? 'Cutting the deck…' : canAfford ? 'Add the crew slot' : `Need ${(SIXTH_BERTH_COST - doubloons).toLocaleString()} more ⟡`}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setConfirming(true); setErr(null) }}
            className="font-cinzel font-700 uppercase tracking-[0.1em] tap"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 10, fontSize: '0.76rem', color: ACCENT, background: `${ACCENT}18`, border: `1px solid ${ACCENT}66`, cursor: 'pointer' }}>
            Add the Sixth Berth · {SIXTH_BERTH_COST.toLocaleString()} ⟡
          </button>
        )}
      </div>
      {err && <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#fca5a5', textAlign: 'center', marginTop: 6 }}>{err}</p>}
    </div>
  )
}

/* Six little crew dots — the last one lit in the accent (the new berth). */
function CrewGlyph({ n }: { n: number }) {
  return (
    <div aria-hidden style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 8px)', gap: 4, padding: 8, borderRadius: 12, background: 'rgba(0,0,0,0.25)', border: `1px solid ${ACCENT}33` }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < n ? (i === n - 1 ? ACCENT : '#cfc9bf') : 'rgba(255,255,255,0.12)', boxShadow: i === n - 1 && i < n ? `0 0 7px ${ACCENT}` : 'none' }} />
      ))}
    </div>
  )
}

/* Install celebration — a short stamp beat. */
function BerthCelebration({ crew, onDone }: { crew: number; onDone: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: 'relative', borderRadius: 16, padding: '1.25rem 1rem', overflow: 'hidden', textAlign: 'center', background: `radial-gradient(ellipse 100% 70% at 50% 0%, ${ACCENT}22 0%, transparent 70%), linear-gradient(180deg, rgba(20,14,8,0.92), rgba(12,10,8,0.96))`, border: `1.5px solid ${ACCENT}`, boxShadow: `0 0 40px ${ACCENT}33` }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.div key={i} aria-hidden
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: [0, 1, 0], y: -46, x: (i % 2 ? 1 : -1) * (8 + i * 4) }}
          transition={{ duration: 2 + (i % 3) * 0.5, delay: (i * 0.17) % 1.5, repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', left: `${(i * 34) % 100}%`, bottom: 0, width: 4, height: 4, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
      ))}
      <div style={{ position: 'relative' }}>
        <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.54rem', color: ACCENT, marginBottom: 8 }}>Berth Cut</p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f5f2ec', textShadow: `0 0 20px ${ACCENT}66`, marginBottom: 10 }}>A Crew of {crew}</p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><CrewGlyph n={crew} /></div>
        <button type="button" onClick={onDone}
          className="font-cinzel font-700 uppercase tracking-[0.16em] tap"
          style={{ width: '100%', padding: '12px 0', borderRadius: 12, fontSize: '0.76rem', color: '#0c0f14', background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}cc)`, border: 'none', cursor: 'pointer', boxShadow: `0 0 22px ${ACCENT}55` }}>
          Muster the crew →
        </button>
      </div>
    </motion.div>
  )
}
