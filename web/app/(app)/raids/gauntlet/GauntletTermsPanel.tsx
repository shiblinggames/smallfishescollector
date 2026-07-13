'use client'

// ── SIGN DAVY'S TERMS ────────────────────────────────────────────────────────
// The hardcore pre-dive difficulty selector (the ToA-invocation model). You sign
// terms, each adds Pressure, Pressure multiplies your Blood Gems on cash-out.
//
// The design brief: a newcomer must be able to open this, read one card, and know
// exactly what they agreed to. So each card carries its plain consequence in full
// size (never hidden behind a tooltip), the running Pressure and the payout it
// buys are pinned to the top where they animate as you toggle, and the two rules
// that actually catch people out ("you only get paid if you SURVIVE" and
// "Pressure pays nothing shallow") are stated in the header rather than left to
// be discovered the expensive way. Cards run two-up so the whole board is
// scannable without endless scrolling.

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
  signed, onChange, onDone,
}: {
  signed: SignedTerms
  onChange: (next: SignedTerms) => void
  /** Close the board and hand control back to the dive modal, which is where the
   *  signing is confirmed and the descent actually happens. */
  onDone: () => void
}) {
  const [detail, setDetail] = useState<{ name: string; tier: number; flavor: string; text: string } | null>(null)
  // The four rules are for a first read, not a permanent fixture. They collapse
  // the moment you start scrolling the board (which is when you have stopped
  // reading them and started needing the space) and unfold again at the top.
  const [rulesOpen, setRulesOpen] = useState(true)

  const pressure = useMemo(() => termPressure(signed), [signed])
  // The multiplier at FULL depth: the number worth advertising, with the honest
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

  if (typeof document === 'undefined') return null

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1320,
      // 100dvh tracks the DYNAMIC viewport, so the footer isn't hidden under
      // mobile browser chrome the way a plain 100vh / inset:0 can be.
      height: '100dvh',
      background: 'linear-gradient(180deg, #14060a 0%, #0a0407 100%)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Header: the live readout. Everything you need to decide, pinned. ── */}
      <div style={{
        flexShrink: 0, padding: 'calc(env(safe-area-inset-top, 0px) + 0.9rem) 1rem 0.9rem',
        borderBottom: `1px solid ${DANGER}33`,
        background: 'linear-gradient(180deg, rgba(40,12,16,0.96), rgba(20,6,10,0.96))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button onClick={onDone} className="font-karla font-700 tap" aria-label="Back"
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#a89898', fontSize: '0.82rem', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Back
          </button>
          <p className="font-cinzel font-800 uppercase" style={{ fontSize: '1rem', color: '#f3d7d7', letterSpacing: '0.1em' }}>
            Davy&rsquo;s Terms
          </p>
          <button onClick={() => { vibrate([0, 12]); onChange({}) }} disabled={signedCount === 0}
            className="font-karla font-700 tap"
            style={{ flexShrink: 0, background: 'none', border: 'none', color: signedCount === 0 ? '#5a4a4a' : '#a89898', fontSize: '0.82rem', cursor: signedCount === 0 ? 'default' : 'pointer' }}>
            Clear
          </button>
        </div>

        {/* The two numbers that matter, side by side. */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, marginTop: 12 }}>
          <Readout label="Pressure" accent={DANGER}>
            <motion.span key={pressure} initial={{ scale: 1.35 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 460, damping: 17 }}
              className="font-cinzel font-800" style={{ fontSize: '2.1rem', color: pressure > 0 ? '#ffb3b3' : '#6a5a5a', lineHeight: 1, textShadow: pressure > 0 ? `0 0 18px ${DANGER}66` : 'none' }}>
              {pressure}
            </motion.span>
          </Readout>
          <Readout label={`Blood Gems at depth ${PRESSURE_DEPTH_FULL}+`} accent={GOLD}>
            <motion.span key={fullMult} initial={{ scale: 1.35 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 460, damping: 17 }}
              className="font-cinzel font-800" style={{ fontSize: '2.1rem', color: pressure > 0 ? GOLD : '#6a5a5a', lineHeight: 1, textShadow: pressure > 0 ? `0 0 18px ${GOLD}55` : 'none' }}>
              ×{fullMult.toFixed(2)}
            </motion.span>
          </Readout>
        </div>

        {/* Pressure track: how far along the whole board you are. */}
        <div style={{ marginTop: 10, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <motion.div
            animate={{ width: `${Math.min(100, (pressure / MAX_AVAILABLE_PRESSURE) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${DANGER}, ${GOLD})`, boxShadow: `0 0 8px ${DANGER}88` }}
          />
        </div>

        {/* How the whole thing works, in plain steps. A newcomer should be able to
            read this once and never be surprised by the payout. Folds away on
            scroll so the board gets the room. */}
        <motion.div
          initial={false}
          animate={{ height: rulesOpen ? 'auto' : 0, opacity: rulesOpen ? 1 : 0, marginTop: rulesOpen ? 11 : 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          style={{ overflow: 'hidden' }}
        >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Step n={1}>
            Each term you sign makes the run <strong style={{ color: '#fca5a5' }}>harder</strong> and adds <strong style={{ color: '#fca5a5' }}>Pressure</strong>.
          </Step>
          <Step n={2}>
            More Pressure means more <strong style={{ color: GOLD }}>Blood Gems</strong> when you cash out. It changes nothing else. No extra doubloons, no extra XP.
          </Step>
          <Step n={3}>
            You have to <strong style={{ color: '#fca5a5' }}>survive and cash out</strong> to be paid. If you sink, you get nothing at all.
          </Step>
          <Step n={4}>
            The bonus grows the <strong style={{ color: GOLD }}>deeper</strong> you go. It starts paying at depth {PRESSURE_DEPTH_FLOOR} and pays in full from depth {PRESSURE_DEPTH_FULL}.
          </Step>
          {pressure >= PRESSURE_CAP && (
            <p className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(240,220,220,0.5)', lineHeight: 1.45, marginTop: 1 }}>
              Past {PRESSURE_CAP} Pressure the gems stop climbing. Anything beyond it is for glory alone.
            </p>
          )}
        </div>
        </motion.div>
        {pressure >= PRESSURE_SKIN_THRESHOLD && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="font-karla font-700" style={{ fontSize: '0.78rem', color: GOLD, marginTop: 7 }}>
            ✦ At {PRESSURE_SKIN_THRESHOLD}+ Pressure, a cash-out earns colors nobody can buy.
          </motion.p>
        )}
      </div>

      {/* ── The board: two cards across, so it scans at a glance ──────────── */}
      <div
        onScroll={e => setRulesOpen(e.currentTarget.scrollTop <= 6)}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '1rem 0.9rem 1.2rem' }}>
        {groups.map(g => {
          const meta = TERM_GROUP_META[g]
          const terms = GAUNTLET_TERMS.filter(t => t.group === g)
          return (
            <div key={g} style={{ marginBottom: '1.5rem' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: meta.accent, letterSpacing: '0.03em' }}>{meta.label}</p>
              <p className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.45)', marginTop: 1, marginBottom: 10 }}>{meta.blurb}</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                {terms.map(t => {
                  const tier = signed[t.id] ?? 0
                  const on = tier >= 1
                  // Show the consequence of the tier you HAVE signed; if none,
                  // preview tier I so a card is never a mystery box.
                  const shown = t.tiers[Math.max(1, tier) - 1]
                  return (
                    <div key={t.id} style={{
                      display: 'flex', flexDirection: 'column',
                      borderRadius: 14, padding: '0.7rem 0.7rem 0.65rem',
                      background: on ? `${meta.accent}18` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${on ? `${meta.accent}99` : 'rgba(255,255,255,0.09)'}`,
                      boxShadow: on ? `0 0 16px ${meta.accent}22` : 'none',
                      transition: 'background 0.18s, border-color 0.18s, box-shadow 0.18s',
                    }}>
                      {/* Title row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                        <p className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.98rem', color: on ? '#f8eded' : '#d4c8c8', lineHeight: 1.15 }}>
                          {t.name}
                        </p>
                        <button onClick={() => setDetail({ name: t.name, tier: Math.max(1, tier), flavor: t.flavor, text: shown.detail })}
                          aria-label={`What ${t.name} does`} className="font-cinzel font-700 tap"
                          style={{ flexShrink: 0, width: 21, height: 21, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.7rem', fontStyle: 'italic', lineHeight: 1 }}>
                          i
                        </button>
                      </div>

                      {on && (
                        <motion.span initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                          className="font-karla font-800 uppercase"
                          style={{ alignSelf: 'flex-start', fontSize: '0.52rem', letterSpacing: '0.1em', color: '#1a0c0c', background: meta.accent, borderRadius: 999, padding: '0.14rem 0.42rem', marginTop: 5 }}>
                          Signed {ROMAN[tier]}
                        </motion.span>
                      )}

                      {/* What it actually DOES, plainly, at a readable size. */}
                      <p className="font-karla font-600" style={{ flex: 1, fontSize: '0.84rem', color: on ? '#f4e2e2' : 'rgba(255,255,255,0.58)', lineHeight: 1.4, marginTop: 7 }}>
                        {shown.desc}
                      </p>

                      {/* Tier chips: tap to sign, tap again to tear up. */}
                      <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
                        {t.tiers.map((tt, i) => {
                          const n = i + 1
                          const active = tier === n
                          const multi = t.tiers.length > 1
                          return (
                            <button key={n} onClick={() => setTier(t.id, active ? 0 : n)}
                              className="font-karla font-800 tap"
                              style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                padding: '0.5rem 0.2rem', borderRadius: 9,
                                fontSize: '0.76rem', cursor: 'pointer',
                                color: active ? '#1a0c0c' : meta.accent,
                                background: active ? meta.accent : `${meta.accent}16`,
                                border: `1px solid ${active ? meta.accent : `${meta.accent}55`}`,
                                boxShadow: active ? `0 0 12px ${meta.accent}66` : 'none',
                              }}>
                              {multi && <span style={{ opacity: 0.75 }}>{ROMAN[n]}</span>}
                              <span>+{tt.pressure}</span>
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

      {/* ── The commit: values spelled out, then one plain button ─────────── */}
      <div style={{
        flexShrink: 0,
        // Generous bottom padding: safe-area inset PLUS clearance, so the button
        // never sits under a home indicator or a browser's bottom chrome.
        padding: '0.8rem 1rem calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
        borderTop: `1px solid ${DANGER}33`,
        background: 'linear-gradient(180deg, rgba(20,6,10,0.97), rgba(12,4,7,0.99))',
      }}>
        {/* A labelled value strip beats a crowded button caption. */}
        <div style={{ display: 'flex', gap: 7, marginBottom: 9 }}>
          <Tally label="Terms Signed" value={String(signedCount)} accent={signedCount > 0 ? '#f3d7d7' : '#6a5a5a'} />
          <Tally label="Pressure" value={String(pressure)} accent={pressure > 0 ? '#ffb3b3' : '#6a5a5a'} />
          <Tally label="Blood Gems" value={`×${fullMult.toFixed(2)}`} accent={pressure > 0 ? GOLD : '#6a5a5a'} />
        </div>

        <button onClick={() => { vibrate([0, 30, 30, 60]); onDone() }}
          className="font-cinzel font-800 tap"
          style={{
            width: '100%', padding: '1.05rem 1rem', borderRadius: 14,
            fontSize: '1.3rem', letterSpacing: '0.01em', lineHeight: 1.1, cursor: 'pointer',
            color: '#170a0a', border: 'none',
            background: pressure > 0
              ? `linear-gradient(180deg, #ffd868, ${GOLD} 55%, #d4a02c)`
              : `linear-gradient(180deg, #f0797d, ${DANGER} 55%, #b83f45)`,
            boxShadow: `0 6px 22px ${pressure > 0 ? GOLD : DANGER}44`,
            textShadow: '0 1px 0 rgba(255,255,255,0.25)',
          }}>
          {pressure > 0 ? 'Take These Terms' : 'Sign Nothing'}
        </button>

        <p className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(240,220,220,0.45)', textAlign: 'center', marginTop: 8, lineHeight: 1.4 }}>
          {pressure > 0
            ? 'Nothing is locked until you descend. You can still tear these up.'
            : 'You can descend without signing anything. He will not think less of you. He will not think of you at all.'}
        </p>
      </div>

      {/* Detail popup: the full plain-English explainer. */}
      {detail && typeof document !== 'undefined' && createPortal(
        <div onClick={() => setDetail(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1330, background: 'rgba(6,2,4,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
          <motion.div onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ width: '100%', maxWidth: 350, borderRadius: 18, padding: '1.25rem 1.1rem', background: 'linear-gradient(180deg, #220d11, #140609)', border: `1px solid ${DANGER}66`, boxShadow: '0 18px 50px rgba(0,0,0,0.6)' }}>
            <p className="font-cinzel font-800" style={{ fontSize: '1.3rem', color: '#f3d7d7' }}>
              {detail.name} <span style={{ color: DANGER }}>{ROMAN[detail.tier]}</span>
            </p>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.42)', fontStyle: 'italic', marginTop: 4 }}>
              {detail.flavor}
            </p>
            <p className="font-karla" style={{ fontSize: '0.92rem', color: 'rgba(240,225,225,0.85)', lineHeight: 1.6, marginTop: 11 }}>
              {detail.text}
            </p>
            <button onClick={() => setDetail(null)} className="font-karla font-700 uppercase tracking-[0.08em] tap"
              style={{ width: '100%', marginTop: 16, padding: '0.75rem', borderRadius: 10, fontSize: '0.8rem', color: '#f3d7d7', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer' }}>
              Understood
            </button>
          </motion.div>
        </div>,
        document.body,
      )}
    </div>,
    document.body,
  )
}

/* A numbered rule in the header explainer. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span className="font-cinzel font-800" style={{
        flexShrink: 0, width: 18, height: 18, borderRadius: '50%', marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.66rem', color: '#f3d7d7',
        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
      }}>{n}</span>
      <p className="font-karla" style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: 'rgba(240,220,220,0.78)', lineHeight: 1.45 }}>
        {children}
      </p>
    </div>
  )
}

/* One of the two headline numbers. */
function Readout({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '0.65rem 0.4rem 0.6rem', borderRadius: 12,
      background: 'rgba(0,0,0,0.3)', border: `1px solid ${accent}44`,
    }}>
      {children}
      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.16em', color: `${accent}bb`, marginTop: 6 }}>{label}</p>
    </div>
  )
}

/* A labelled figure in the footer strip. */
function Tally({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '0.45rem 0.3rem', borderRadius: 10, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <p className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: accent, lineHeight: 1 }}>{value}</p>
      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.42)', marginTop: 4 }}>{label}</p>
    </div>
  )
}
