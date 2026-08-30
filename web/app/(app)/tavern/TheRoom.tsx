'use client'

// ── THE ROOM ────────────────────────────────────────────────────────────────
//
// Who is about, at the top of the tavern, because a tavern is a room with
// people in it and this game had nowhere that said so. Your crew are on the
// water somewhere; the chart will show you where once you have a pact, but
// until then the only way to find out anybody else was playing at all was to
// sail into them.
//
// FACES, NOT A LIST OF NAMES. These are the same avatars they wear on the
// water, so somebody you have sailed with is recognised before you have read
// anything, and each one goes to their profile.
//
// ── IT POLLS SLOWLY AND STOPS WHEN NOBODY IS LOOKING ────────────────────────
//
// Thirty seconds. The heartbeat behind it is written every twenty, so asking
// faster cannot return anything newer, and this is a page people leave open.
// Hidden tabs do not ask at all: a room nobody is looking at does not need to
// know who is in it.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import CharacterAvatar from '@/components/CharacterAvatar'
import { whoIsAbout, type TheRoom as RoomState } from './roomActions'

const EVERY_MS = 30_000

export default function TheRoom() {
  const [room, setRoom] = useState<RoomState | null>(null)

  const load = useCallback(() => {
    if (document.visibilityState === 'hidden') return
    void whoIsAbout().then(setRoom).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, EVERY_MS)
    // Coming back to the tab should not mean waiting up to thirty seconds to
    // find out the room emptied while you were away.
    const onShow = () => load()
    document.addEventListener('visibilitychange', onShow)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onShow) }
  }, [load])

  const crew = room?.crew ?? []
  const others = room?.others ?? 0
  const total = crew.length + others

  return (
    <section style={{
      borderRadius: 16, padding: '0.9rem 1rem 1rem',
      background: 'linear-gradient(180deg, rgba(28,22,12,0.55) 0%, rgba(12,10,6,0.75) 100%), #0b0906',
      border: '1px solid rgba(200,170,100,0.22)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.56rem', letterSpacing: '0.18em', color: 'rgba(200,170,100,0.8)', margin: 0,
        }}>Who&rsquo;s about</p>
        {/* A COUNT, NOT A LIST. Everybody out there who is not your crew is a
            number here on purpose — see roomActions. */}
        {room && (
          <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: 'rgba(214,198,166,0.6)', margin: 0 }}>
            {total === 0 ? 'quiet tonight'
              : total === 1 ? '1 captain on the water'
              : `${total} captains on the water`}
          </p>
        )}
      </div>

      {!room ? (
        // A RESERVED BOX rather than nothing, so the page below does not jump
        // when the answer lands.
        <div aria-busy style={{ height: 68 }} />
      ) : crew.length > 0 ? (
        <>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 12,
            margin: '0.75rem 0 0',
          }}>
            {crew.map(p => (
              <Link key={p.username} href={`/u/${p.username}`}
                style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 62 }}>
                <span style={{ position: 'relative', display: 'block' }}>
                  <CharacterAvatar
                    characterColor={p.characterColor}
                    equippedHat={p.equippedHat}
                    bgColor={p.avatarBg ?? undefined}
                    ringColor={p.avatarBorder ?? undefined}
                    size={46}
                  />
                  {/* Lit, because they are here NOW. The dot is the whole
                      difference between this and a follow list. */}
                  <span aria-hidden style={{
                    position: 'absolute', right: 0, bottom: 2,
                    width: 11, height: 11, borderRadius: 999,
                    background: '#8fe0ac', border: '2px solid #0b0906',
                    boxShadow: '0 0 8px rgba(143,224,172,0.9)',
                  }} />
                </span>
                <span className="font-karla font-700" style={{
                  fontSize: '0.62rem', color: '#d8ccb0', maxWidth: 62,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.username}</span>
              </Link>
            ))}
          </div>
          {others > 0 && (
            <p className="font-karla" style={{
              fontSize: '0.68rem', color: 'rgba(214,198,166,0.5)', margin: '0.7rem 0 0', lineHeight: 1.4,
            }}>
              and {others} other {others === 1 ? 'captain' : 'captains'} out there you have not met.
            </p>
          )}
        </>
      ) : (
        <p className="font-karla" style={{
          fontSize: '0.76rem', color: 'rgba(214,198,166,0.6)', margin: '0.6rem 0 0', lineHeight: 1.5,
        }}>
          {others > 0
            ? `${others} ${others === 1 ? 'captain is' : 'captains are'} on the water, none of them yours yet. Follow someone below and they will show up here when they sail.`
            : 'Nobody on the water at the moment. Follow a few captains below and this fills up.'}
        </p>
      )}
    </section>
  )
}
