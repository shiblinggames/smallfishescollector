'use client'

// WHO YOU SAIL WITH.
//
// One panel behind one always-there button, covering the whole relationship:
// who is on the water right now, who has asked to sail with you, who you have
// asked, and who you could ask.
//
// ── WHY IT IS ALWAYS THERE ──────────────────────────────────────────────────
//
// The old readout appeared only when somebody was already out, which made it
// useless for the two things people actually want from it. You could not find
// out that nobody was about — the absence of a button is not an answer, it is
// an absence — and you could not do anything about it, because the only way to
// arrange to sail with somebody was to already be sailing with them.
//
// It shows a count when there is one and sits quietly at zero, but it is always
// somewhere you can press.

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { vibrate } from '@/lib/haptics'
import {
  pactState, requestPact, acceptPact, endPact, endPactWith,
  type PactState, type PactPerson,
} from './pactActions'

const GREEN = 'rgba(150,206,172,0.85)'

function Row({ person, atSea, children }: {
  person: PactPerson
  atSea?: boolean
  children?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '0.4rem 0',
      borderTop: '1px solid rgba(180,214,232,0.1)',
    }}>
      <CharacterAvatar
        characterColor={person.characterColor}
        equippedHat={null}
        bgColor="#0d1a16"
        ringColor={atSea ? '#5ee08a' : 'rgba(180,214,232,0.3)'}
        size={30}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.9rem', color: '#e8f2ea', margin: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{person.username}</p>
        {/* A LAPSED MEMBERSHIP IS SAID OUT LOUD. The pact stays on the books and
            simply stops working, and without this the two of them would be
            staring at an empty sea wondering which of them had done something
            wrong. */}
        {!person.captain && (
          <p className="font-karla" style={{
            fontSize: '0.66rem', color: 'rgba(226,180,140,0.9)', margin: 0,
          }}>not a Captain — you will not see each other</p>
        )}
        {person.captain && atSea && (
          <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8fe0ac', margin: 0 }}>
            on the water
          </p>
        )}
      </div>
      {children}
    </div>
  )
}

function Btn({ onClick, tone = 'quiet', children }: {
  onClick: () => void
  tone?: 'go' | 'quiet'
  children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} className="font-karla font-700 uppercase"
      style={{
        padding: '0.32rem 0.62rem', borderRadius: 8, fontSize: '0.6rem',
        letterSpacing: '0.1em', cursor: 'pointer', flexShrink: 0,
        color: tone === 'go' ? '#0d1a10' : 'rgba(226,238,246,0.72)',
        background: tone === 'go' ? '#a8d98a' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${tone === 'go' ? 'rgba(168,217,138,0.9)' : 'rgba(180,214,232,0.22)'}`,
      }}>
      {children}
    </button>
  )
}

export default function CrewPanel({
  open, onClose, atSea, onChanged,
}: {
  open: boolean
  onClose: () => void
  /** Usernames currently on the water, from the chart's own poll — so the
   *  panel and the boats never disagree about who is out. */
  atSea: Set<string>
  /** A pact changed hands. The chart re-polls immediately so Accept puts the
   *  boat on the water NOW, not at the next twenty-second tick. */
  onChanged?: () => void
}) {
  const [state, setState] = useState<PactState | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { void pactState().then(setState) }, [])
  useEffect(() => { if (open) load() }, [open, load])

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    vibrate(8)
    try { await fn(); load(); onChanged?.() } finally { setBusy(false) }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', inset: 0, zIndex: 9200,
            background: 'rgba(3,8,14,0.86)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}>
          <motion.div
            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(100%, 400px)', maxHeight: '80vh', overflowY: 'auto',
              background: 'rgba(8,14,22,0.98)',
              border: '1px solid rgba(180,214,232,0.28)',
              borderRadius: 16, padding: '1rem 1.1rem',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#e8f2ea', margin: 0 }}>
                Sailing crew
              </p>
              <button type="button" onClick={onClose} aria-label="Close"
                style={{
                  width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(180,214,232,0.22)',
                  color: 'rgba(226,238,246,0.8)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', padding: 0,
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <p className="font-karla" style={{
              fontSize: '0.74rem', color: 'rgba(196,214,226,0.72)', margin: '0.35rem 0 0.6rem',
            }}>
              Following each other is not enough. You both have to agree to sail together, and
              either of you can call it off.
            </p>

            {!state && (
              <p className="font-karla" style={{ fontSize: '0.8rem', color: 'rgba(196,214,226,0.6)' }}>
                Reading the log...
              </p>
            )}

            {state && !state.youCanSail && (
              <p className="font-karla" style={{
                fontSize: '0.8rem', color: 'rgba(226,180,140,0.95)', margin: '0 0 0.6rem',
                padding: '0.5rem 0.65rem', borderRadius: 10,
                background: 'rgba(48,32,12,0.7)', border: '1px solid rgba(226,180,140,0.3)',
              }}>
                Sailing together is a Captain&rsquo;s perk. You can still agree pacts here, and they
                will start working the day you become one.
              </p>
            )}

            {state && (
              <>
                {state.asking.length > 0 && (
                  <>
                    <p className="font-karla font-700 uppercase" style={{
                      fontSize: '0.56rem', letterSpacing: '0.16em', color: GREEN, margin: '0.7rem 0 0',
                    }}>Asking to sail with you</p>
                    {state.asking.map(p => (
                      <Row key={p.id} person={p} atSea={atSea.has(p.username)}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <Btn tone="go" onClick={() => act(() => acceptPact(p.pactId))}>Accept</Btn>
                          <Btn onClick={() => act(() => endPact(p.pactId))}>No</Btn>
                        </div>
                      </Row>
                    ))}
                  </>
                )}

                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.56rem', letterSpacing: '0.16em', color: GREEN, margin: '0.9rem 0 0',
                }}>Sailing with you</p>
                {state.sailing.length === 0 && (
                  <p className="font-karla" style={{
                    fontSize: '0.78rem', color: 'rgba(196,214,226,0.6)', margin: '0.3rem 0 0',
                  }}>Nobody yet.</p>
                )}
                {state.sailing.map(p => (
                  <Row key={p.id} person={p} atSea={atSea.has(p.username)}>
                    <Btn onClick={() => act(() => endPactWith(p.id))}>Part ways</Btn>
                  </Row>
                ))}

                {state.asked.length > 0 && (
                  <>
                    <p className="font-karla font-700 uppercase" style={{
                      fontSize: '0.56rem', letterSpacing: '0.16em', color: GREEN, margin: '0.9rem 0 0',
                    }}>Waiting on an answer</p>
                    {state.asked.map(p => (
                      <Row key={p.id} person={p}>
                        <Btn onClick={() => act(() => endPact(p.pactId))}>Withdraw</Btn>
                      </Row>
                    ))}
                  </>
                )}

                {state.couldAsk.length > 0 && (
                  <>
                    <p className="font-karla font-700 uppercase" style={{
                      fontSize: '0.56rem', letterSpacing: '0.16em', color: GREEN, margin: '0.9rem 0 0',
                    }}>Your crew</p>
                    {state.couldAsk.map(p => (
                      <Row key={p.id} person={p}>
                        <Btn tone="go" onClick={() => act(() => requestPact(p.id))}>Ask</Btn>
                      </Row>
                    ))}
                  </>
                )}

                {state.sailing.length === 0 && state.couldAsk.length === 0
                  && state.asking.length === 0 && state.asked.length === 0 && (
                  <p className="font-karla" style={{
                    fontSize: '0.78rem', color: 'rgba(196,214,226,0.6)', margin: '0.6rem 0 0',
                  }}>
                    Nobody follows you back yet. Find someone on the leaderboards and follow them —
                    once you both have, you can ask them out here.
                  </p>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
