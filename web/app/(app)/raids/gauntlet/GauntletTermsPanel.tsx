'use client'

// ── SIGN DAVY'S TERMS ────────────────────────────────────────────────────────
// The hardcore pre-dive difficulty selector (the ToA-invocation model). You sign
// terms, each adds Pressure, Pressure multiplies your Blood Gems on cash-out.
//
// The whole design brief for this screen: a newcomer must be able to open it,
// read one card, and know exactly what they just agreed to. So every term shows
// its plain consequence ON the card (never hidden behind a tooltip), the running
// Pressure and the payout it buys are pinned to the top where they animate as you
// toggle, and the two rules that actually catch people out — "you only get paid if
// you SURVIVE" and "Pressure pays nothing shallow" — are stated in the header
// rather than left to be discovered the expensive way.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { vibrate } from '@/lib/haptics'
import {
  GAUNTLET_TERMS, TERM_GROUP_META, termPressure, pressureGemMult,
  MAX_AVAILABLE_PRESSURE, PRESSURE_CAP, PRESSURE_DEPTH_FLOOR, PRESSURE_DEPTH_FULL,
  PRESSURE_SKIN_THRESHOLD, type SignedTerms, type TermGroup,
} from '@/lib/gauntletTerms'

const GOLD = '#f0c040'
const DANGER = '#e0555a'

const ROMAN = ['', 'I', 'II', 'III']

export default function GauntletTermsPanel({
  signed, onChange, onDive, onBack, diving,
}: {
  signed: SignedTerms
  onChange: (next: SignedTerms) => void
  onDive: () => void
  onBack: () => void
  diving: boolean
}) {
  const [detail, setDetail] = useState<{ name: string; tier: number; text: string } | null>(null)

  const pressure = useMemo(() => termPressure(signed), [signed])
  // The multiplier at FULL depth — the number worth advertising, with the honest
  // caveat right under it (it ramps in, so shallow runs earn none of it).
  const fullMult = pressureGemMult(pressure, PRESSURE_DEPTH_FULL)
  const signedCount = Object.values(signed).filter(t => t >= 1).length

  function setTier(id: string, tier: number) {
    const next = { ...signed }
    if (tier <= 0) delete next[id]
    else next[id] = tier
    vibrate(tier > 0 ? [0, 18] : [0, 10])
    onChange(next)
  }

  const groups: TermGroup[] = ['opposition', 'crew', 'build', 'safety']

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1320,
      background: 'linear-gradient(180deg, #14060a 0%, #0a0407 100%)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Header: the live readout. Everything you need to decide, pinned. ── */}
      <div style={{
        flexShrink: 0, padding: 'calc(env(safe-area-inset-top, 0px) + 0.9rem) 1rem 0.85rem',
        borderBottom: `1px solid ${DANGER}33`,
        background: 'linear-gradient(180deg, rgba(40,12,16,0.96), rgba(20,6,10,0.96))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button onClick={onBack} className="font-karla font-700 tap" aria-label="Back"
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#9a8e8e', fontSize: '0.74rem', cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Back
          </button>
          <p className="font-cinzel font-800 uppercase" style={{ fontSize: '0.9rem', color: '#f3d7d7', letterSpacing: '0.1em' }}>
            Davy&rsquo;s Terms
          </p>
          <button onClick={() => { vibrate([0, 12]); onChange({}) }} disabled={signedCount === 0}
            className="font-karla font-700 tap"
            style={{ flexShrink: 0, background: 'none', border: 'none', color: signedCount === 0 ? '#5a4a4a' : '#9a8e8e', fontSize: '0.72rem', cursor: signedCount === 0 ? 'default' : 'pointer' }}>
            Clear
          </button>
        </div>

        {/* The two numbers that matter, side by side. */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 9, marginTop: 11 }}>
          <Readout label="Pressure" accent={DANGER}>
            <motion.span key={pressure} initial={{ scale: 1.35 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 460, damping: 17 }}
              className="font-cinzel font-800" style={{ fontSize: '1.9rem', color: pressure > 0 ? '#ffb3b3' : '#6a5a5a', lineHeight: 1, textShadow: pressure > 0 ? `0 0 18px ${DANGER}66` : 'none' }}>
              {pressure}
            </motion.span>
          </Readout>
          <Readout label="Blood Gems" accent={GOLD}>
            <motion.span key={fullMult} initial={{ scale: 1.35 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 460, damping: 17 }}
              className="font-cinzel font-800" style={{ fontSize: '1.9rem', color: pressure > 0 ? GOLD : '#6a5a5a', lineHeight: 1, textShadow: pressure > 0 ? `0 0 18px ${GOLD}55` : 'none' }}>
              ×{fullMult.toFixed(2)}
            </motion.span>
          </Readout>
        </div>

        {/* Pressure track — how far along the whole board you are. */}
        <div style={{ marginTop: 9, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <motion.div
            animate={{ width: `${Math.min(100, (pressure / MAX_AVAILABLE_PRESSURE) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${DANGER}, ${GOLD})`, boxShadow: `0 0 8px ${DANGER}88` }}
          />
        </div>

        {/* The two rules that bite people. Said up front, not learned the hard way. */}
        <p className="font-karla" style={{ fontSize: '0.68rem', color: 'rgba(240,220,220,0.62)', lineHeight: 1.45, marginTop: 9 }}>
          Sign his terms to make the dive harder. Pressure pays out more <strong style={{ color: GOLD }}>Blood Gems</strong> and nothing else.
          You only collect if you <strong style={{ color: '#fca5a5' }}>cash out alive</strong> — sink, and you get nothing.
        </p>
        <p className="font-karla" style={{ fontSize: '0.64rem', color: 'rgba(240,220,220,0.42)', lineHeight: 1.4, marginTop: 4 }}>
          The bonus only pays deep: nothing before depth {PRESSURE_DEPTH_FLOOR}, full value from depth {PRESSURE_DEPTH_FULL}.
          {pressure >= PRESSURE_CAP ? ' Pressure is capped for gems past ' + PRESSURE_CAP + ' — beyond that it is pure glory.' : ''}
        </p>
        {pressure >= PRESSURE_SKIN_THRESHOLD && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="font-karla font-700" style={{ fontSize: '0.66rem', color: GOLD, marginTop: 6 }}>
            ✦ At {PRESSURE_SKIN_THRESHOLD}+ Pressure, a cash-out earns colors nobody can buy.
          </motion.p>
        )}
      </div>

      {/* ── The board ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0.9rem 1rem 1.2rem' }}>
        {groups.map(g => {
          const meta = TERM_GROUP_META[g]
          const terms = GAUNTLET_TERMS.filter(t => t.group === g)
          return (
            <div key={g} style={{ marginBottom: '1.3rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: meta.accent, letterSpacing: '0.03em' }}>{meta.label}</p>
                <p className="font-karla" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.4)' }}>{meta.blurb}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {terms.map(t => {
                  const tier = signed[t.id] ?? 0
                  const on = tier >= 1
                  // Show the consequence of the tier you HAVE signed; if none, preview
                  // tier I so the card is never a mystery box.
                  const shown = t.tiers[Math.max(1, tier) - 1]
                  return (
                    <div key={t.id} style={{
                      borderRadius: 14, padding: '0.75rem 0.8rem',
                      background: on ? `${meta.accent}14` : 'rgba(255,255,255,0.028)',
                      border: `1px solid ${on ? `${meta.accent}88` : 'rgba(255,255,255,0.08)'}`,
                      boxShadow: on ? `0 0 16px ${meta.accent}1f` : 'none',
                      transition: 'background 0.18s, border-color 0.18s, box-shadow 0.18s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: on ? '#f5eaea' : '#cfc4c4' }}>{t.name}</p>
                            {on && (
                              <motion.span initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                                className="font-karla font-800" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: '#1a0c0c', background: meta.accent, borderRadius: 999, padding: '0.12rem 0.4rem' }}>
                                SIGNED {ROMAN[tier]}
                              </motion.span>
                            )}
                          </div>
                          <p className="font-karla" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.34)', fontStyle: 'italic', marginTop: 2 }}>{t.flavor}</p>
                        </div>
                        <button onClick={() => setDetail({ name: t.name, tier: Math.max(1, tier), text: shown.detail })}
                          aria-label={`What ${t.name} does`} className="font-cinzel font-700 tap"
                          style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.66)', cursor: 'pointer', fontSize: '0.72rem', fontStyle: 'italic', lineHeight: 1 }}>
                          i
                        </button>
                      </div>

                      {/* What it actually DOES, in plain words, always visible. */}
                      <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: on ? '#f2dede' : 'rgba(255,255,255,0.5)', lineHeight: 1.35, marginTop: 7 }}>
                        {shown.desc}
                      </p>

                      {/* Tier chips — tap to sign, tap again to tear up. */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                        {t.tiers.map((tt, i) => {
                          const n = i + 1
                          const active = tier === n
                          return (
                            <button key={n} onClick={() => setTier(t.id, active ? 0 : n)}
                              className="font-karla font-700 uppercase tap"
                              style={{
                                flex: 1, padding: '0.45rem 0.3rem', borderRadius: 9,
                                fontSize: '0.64rem', letterSpacing: '0.06em', cursor: 'pointer',
                                color: active ? '#1a0c0c' : meta.accent,
                                background: active ? meta.accent : `${meta.accent}14`,
                                border: `1px solid ${active ? meta.accent : `${meta.accent}55`}`,
                                boxShadow: active ? `0 0 12px ${meta.accent}66` : 'none',
                              }}>
                              {t.tiers.length > 1 ? `${ROMAN[n]} · ` : ''}+{tt.pressure}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── The commit ────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: '0.85rem 1rem calc(env(safe-area-inset-bottom, 0px) + 0.9rem)',
        borderTop: `1px solid ${DANGER}33`,
        background: 'linear-gradient(180deg, rgba(20,6,10,0.96), rgba(12,4,7,0.99))',
      }}>
        <button onClick={() => { vibrate([0, 40, 40, 80]); onDive() }} disabled={diving}
          className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
          style={{
            width: '100%', padding: '0.95rem', borderRadius: 14, fontSize: '0.94rem', cursor: diving ? 'wait' : 'pointer',
            color: '#1a0c0c', border: 'none',
            background: pressure > 0
              ? `linear-gradient(180deg, ${GOLD}, #d4a02c)`
              : `linear-gradient(180deg, ${DANGER}, #b83f45)`,
            boxShadow: `0 0 26px ${pressure > 0 ? GOLD : DANGER}55`,
          }}>
          {diving ? 'Descending…'
            : pressure > 0 ? `Sign ${signedCount} & Descend · ×${fullMult.toFixed(2)} Gems`
            : 'Descend Clean'}
        </button>
        <p className="font-karla" style={{ fontSize: '0.64rem', color: 'rgba(240,220,220,0.38)', textAlign: 'center', marginTop: 7 }}>
          {pressure > 0
            ? 'Terms are locked once you dive. There is no renegotiating with him.'
            : 'You can descend without signing anything. He will not think less of you. He will not think of you at all.'}
        </p>
      </div>

      {/* Detail popup — the full plain-English explainer. */}
      {detail && typeof document !== 'undefined' && createPortal(
        <div onClick={() => setDetail(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1330, background: 'rgba(6,2,4,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
          <motion.div onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ width: '100%', maxWidth: 340, borderRadius: 18, padding: '1.15rem 1.05rem', background: 'linear-gradient(180deg, #220d11, #140609)', border: `1px solid ${DANGER}66`, boxShadow: '0 18px 50px rgba(0,0,0,0.6)' }}>
            <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: '#f3d7d7' }}>
              {detail.name} <span style={{ color: DANGER }}>{ROMAN[detail.tier]}</span>
            </p>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(240,225,225,0.8)', lineHeight: 1.55, marginTop: 9 }}>
              {detail.text}
            </p>
            <button onClick={() => setDetail(null)} className="font-karla font-700 uppercase tracking-[0.08em] tap"
              style={{ width: '100%', marginTop: 14, padding: '0.7rem', borderRadius: 10, fontSize: '0.72rem', color: '#f3d7d7', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer' }}>
              Understood
            </button>
          </motion.div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* One of the two headline numbers. */
function Readout({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '0.6rem 0.4rem 0.55rem', borderRadius: 12,
      background: 'rgba(0,0,0,0.3)', border: `1px solid ${accent}44`,
    }}>
      {children}
      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: `${accent}bb`, marginTop: 5 }}>{label}</p>
    </div>
  )
}
