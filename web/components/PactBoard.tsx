'use client'

// ── WHO YOU HAVE AGREED TO SAIL WITH ────────────────────────────────────────
//
// The body of the pact panel, with no shell around it, because it now has two
// homes: the overlay you open from the chart while you are sailing, and the
// tavern, which is where the rest of the social graph lives.
//
// SHARED RATHER THAN COPIED, and that is the whole reason this file exists. A
// second implementation of accept/withdraw/part-ways would drift the week
// somebody added a state, and the two would then disagree about a relationship
// while sitting six pixels apart in the same game.
//
// It owns its own load and its own writes: every action here returns nothing
// useful except "it happened", so re-reading is simpler and cheaper than
// threading state up and back down through two very different parents.

import { useCallback, useEffect, useState } from 'react'
import CharacterAvatar from '@/components/CharacterAvatar'
import { vibrate } from '@/lib/haptics'
import {
  pactState, requestPact, acceptPact, endPact, endPactWith,
  type PactState, type PactPerson,
} from '@/app/(app)/sea/pactActions'

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

export default function PactBoard({ atSea, onChanged, active = true }: {
  /** Usernames currently on the water. The chart passes its own poll, so the
   *  panel and the boats never disagree about who is out; the tavern passes an
   *  empty set and the rows simply do not claim anything. */
  atSea: Set<string>
  /** A pact changed hands. The chart re-polls immediately so Accept puts the
   *  boat on the water NOW, not at the next twenty-second tick. */
  onChanged?: () => void
  /** False while the parent is closed, so a shut overlay does not read the
   *  pact table every time it renders. */
  active?: boolean
}) {
  const [state, setState] = useState<PactState | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { void pactState().then(setState) }, [])
  useEffect(() => { if (active) load() }, [active, load])

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    vibrate(8)
    try { await fn(); load(); onChanged?.() } finally { setBusy(false) }
  }

  return (
    <>
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
              Nobody follows you back yet. Follow someone below and ask them out here once
              they follow you back.
            </p>
          )}
        </>
      )}
    </>
  )
}
