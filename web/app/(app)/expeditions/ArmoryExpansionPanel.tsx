'use client'

// The Expanded Armory — a purchasable extra raid-item mount, unlocked by
// beating Raid 8 (the Throne). Don Finleone's shipwright bolts one more mount
// to your deck: one more piece of gear working every fight. Lives in Manage
// Ship → Ship, alongside the Sixth Berth. Three states: locked teaser (Don
// not beaten), buyable, and installed.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { buyArmoryExpansion } from './actions'
import { ARMORY_EXPANSION_COST } from '@/lib/shipBerth'
import { vibrate } from '@/lib/haptics'

const ACCENT = '#a78bfa'

export default function ArmoryExpansionPanel({
  throneCleared, hasArmoryExpansion, baseItemSlots, doubloons,
}: {
  throneCleared: boolean
  hasArmoryExpansion: boolean
  /** The ship's raid-item mounts WITHOUT the refit (4 on the Man-o-War). */
  baseItemSlots: number
  doubloons: number
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Server prop, mirrored so the purchase can flip it optimistically. Resynced when the
  // prop changes (a later refresh, another tab) so it can never drift.
  const [installed, setInstalled] = useState(hasArmoryExpansion)
  useEffect(() => { setInstalled(hasArmoryExpansion) }, [hasArmoryExpansion])

  // Nothing to show until Don Finleone falls (that clear is the reveal).
  if (!throneCleared && !installed) return null

  const canAfford = doubloons >= ARMORY_EXPANSION_COST

  async function buy() {
    if (busy || installed) return
    setBusy(true); setErr(null)
    const res = await buyArmoryExpansion()
    setBusy(false)
    if (!res.ok) { setErr(res.error ?? 'Could not bolt on the mount.'); return }
    // Flip it OURSELVES so the celebration is instant, not waiting on the prop.
    setInstalled(true)
    setCelebrate(true)
    setConfirming(false)
    vibrate([0, 45, 55, 90])
    if (typeof res.doubloons === 'number') window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
  }

  const HEADER = (
    <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#b0a0d8', marginBottom: '0.6rem' }}>
      The Expanded Armory <span className="font-400" style={{ color: '#6f6a74', textTransform: 'none', letterSpacing: 'normal' }}>· one more raid-item mount, every fight</span>
    </p>
  )

  // ── Just bought it: the celebration, before anything else can steal the beat ──
  if (celebrate) return (
    <div style={{ marginBottom: '1.7rem' }}>
      {HEADER}
      <ArmoryCelebration mounts={baseItemSlots + 1} onDone={() => { setCelebrate(false); router.refresh() }} />
    </div>
  )

  // ── Installed ──────────────────────────────────────────────────────────────
  if (installed) {
    return (
      <div style={{ marginBottom: '1.7rem' }}>
        {HEADER}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, padding: '0.95rem 1rem', background: `${ACCENT}14`, border: `1px solid ${ACCENT}55`, boxShadow: `0 0 22px ${ACCENT}1a` }}>
          <MountGlyph n={baseItemSlots + 1} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: ACCENT }}>An extra mount, all yours</p>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a94a4', marginTop: 2 }}>Fit {baseItemSlots + 1} raid items on every raid.</p>
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
          <MountGlyph n={baseItemSlots + 1} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#f5f2ec' }}>
              <span style={{ color: '#9a94a4' }}>{baseItemSlots} mounts</span> → <span style={{ color: ACCENT }}>{baseItemSlots + 1} mounts</span>
            </p>
            <p className="font-karla" style={{ fontSize: '0.66rem', color: '#9a94a4', marginTop: 2, lineHeight: 1.4 }}>One more raid item bolted to your deck, working every fight you ever sail.</p>
          </div>
        </div>
        {confirming ? (
          <div>
            <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#c4a8f0', lineHeight: 1.4, marginBottom: 8, textAlign: 'center' }}>
              {ARMORY_EXPANSION_COST.toLocaleString()} ⟡, once. A permanent extra raid-item mount.
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
                {busy ? 'Bolting it on…' : canAfford ? 'Bolt on the mount' : `Need ${(ARMORY_EXPANSION_COST - doubloons).toLocaleString()} more ⟡`}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setConfirming(true); setErr(null) }}
            className="font-cinzel font-700 uppercase tracking-[0.1em] tap"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 10, fontSize: '0.76rem', color: ACCENT, background: `${ACCENT}18`, border: `1px solid ${ACCENT}66`, cursor: 'pointer' }}>
            Add the Expanded Armory · {ARMORY_EXPANSION_COST.toLocaleString()} ⟡
          </button>
        )}
      </div>
      {err && <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#fca5a5', textAlign: 'center', marginTop: 6 }}>{err}</p>}
    </div>
  )
}

/* Raid-item mounts as little bolted squares — the last one lit in the accent (the new mount). */
function MountGlyph({ n }: { n: number }) {
  const cols = Math.min(n, 5)
  return (
    <div aria-hidden style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, 8px)`, gap: 4, padding: 8, borderRadius: 12, background: 'rgba(0,0,0,0.25)', border: `1px solid ${ACCENT}33` }}>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: i === n - 1 ? ACCENT : '#cfc9bf', boxShadow: i === n - 1 ? `0 0 7px ${ACCENT}` : 'none' }} />
      ))}
    </div>
  )
}

/* Install celebration — a short stamp beat. */
function ArmoryCelebration({ mounts, onDone }: { mounts: number; onDone: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: 'relative', borderRadius: 16, padding: '1.25rem 1rem', overflow: 'hidden', textAlign: 'center', background: `radial-gradient(ellipse 100% 70% at 50% 0%, ${ACCENT}22 0%, transparent 70%), linear-gradient(180deg, rgba(16,12,24,0.92), rgba(10,10,14,0.96))`, border: `1.5px solid ${ACCENT}`, boxShadow: `0 0 40px ${ACCENT}33` }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.div key={i} aria-hidden
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: [0, 1, 0], y: -46, x: (i % 2 ? 1 : -1) * (8 + i * 4) }}
          transition={{ duration: 2 + (i % 3) * 0.5, delay: (i * 0.17) % 1.5, repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', left: `${(i * 34) % 100}%`, bottom: 0, width: 4, height: 4, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
      ))}
      <div style={{ position: 'relative' }}>
        <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.54rem', color: ACCENT, marginBottom: 8 }}>Mount Bolted On</p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f5f2ec', textShadow: `0 0 20px ${ACCENT}66`, marginBottom: 10 }}>{mounts} Raid-Item Mounts</p>
        <p className="font-karla" style={{ fontSize: '0.74rem', color: '#c4bad8', lineHeight: 1.45, marginBottom: 12 }}>
          The don's shipwright cut the frame and set the iron. One more piece of gear working for you, in every fight from here on.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><MountGlyph n={mounts} /></div>
        <button type="button" onClick={onDone}
          className="font-cinzel font-700 uppercase tracking-[0.16em] tap"
          style={{ width: '100%', padding: '12px 0', borderRadius: 12, fontSize: '0.76rem', color: '#0c0f14', background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}cc)`, border: 'none', cursor: 'pointer', boxShadow: `0 0 22px ${ACCENT}55` }}>
          Fit the loadout →
        </button>
      </div>
    </motion.div>
  )
}
