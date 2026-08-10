'use client'

import { useState, useTransition } from 'react'
import { TIDE_RUN_BOATS, tideRunBoat, nextBoat, type TideRunBoat } from '@/lib/tideRunBoats'
import { setTideRunBoat } from './actions'
import { hapticTap, hapticReward } from '@/lib/haptics'

/**
 * THE BOAT LOCKER.
 *
 * Two jobs, and the second one is the one that matters. It lets you equip what
 * you have earned, and it shows you what you have not — because a locker full
 * of blanks is the thing that makes the next run worth starting. Locked boats
 * are therefore SHOWN, not hidden: silhouetted, with the exact distance that
 * opens them, so the ladder reads as a route rather than a mystery.
 *
 * Every locked card is also a target you can measure yourself against. The one
 * you are closest to gets called out at the top, because "38m away" is a far
 * better reason to tap Play again than "you died".
 */
export default function BoatLocker({
  bestDistance, equippedId, onEquip, onClose,
}: {
  bestDistance: number
  equippedId: string
  onEquip: (id: string) => void
  onClose: () => void
}) {
  const [equipped, setEquipped] = useState(equippedId)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const next = nextBoat(bestDistance)
  const owned = TIDE_RUN_BOATS.filter(b => bestDistance >= b.unlockAt).length

  function equip(b: TideRunBoat) {
    if (bestDistance < b.unlockAt || b.id === equipped) return
    hapticTap()
    setErr(null)
    setBusy(b.id)
    // Optimistic: the locker is a cosmetic and the server has already agreed
    // this boat is earned. Snapping back on the rare failure beats a spinner
    // between every tap.
    const previous = equipped
    setEquipped(b.id)
    startTransition(async () => {
      const res = await setTideRunBoat(b.id)
      if ('error' in res) { setEquipped(previous); setErr(res.error) }
      else { onEquip(b.id); hapticReward() }
      setBusy(null)
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto',
        background: 'rgba(3,10,18,0.88)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 520, margin: '0 auto',
          padding: 'calc(env(safe-area-inset-top, 0px) + 1.4rem) 1rem calc(env(safe-area-inset-bottom, 0px) + 2rem)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.2em', color: '#7fd0e8' }}>
              The Boathouse
            </p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f2f7fb', lineHeight: 1.1, marginTop: 3 }}>
              Your Boats
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)',
              color: '#dce8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Progress, then the single nearest target. The count says how far you
            have come; the target says what the next run is FOR. */}
        <p className="font-karla" style={{ fontSize: '0.78rem', color: '#8fa6b8' }}>
          {owned} of {TIDE_RUN_BOATS.length} earned
        </p>
        {next && (
          <div style={{
            marginTop: 11, padding: '0.7rem 0.85rem', borderRadius: 12,
            background: 'rgba(127,208,232,0.09)', border: '1px solid rgba(127,208,232,0.3)',
          }}>
            <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#dff1f8' }}>
              <span style={{ color: '#7fd0e8' }}>{Math.max(1, Math.ceil(next.unlockAt - bestDistance))}m</span>
              {' '}further and the <span style={{ color: '#7fd0e8' }}>{next.name}</span> is yours
            </p>
          </div>
        )}

        {err && (
          <p className="font-karla font-600" style={{ fontSize: '0.76rem', color: '#f0a9a9', marginTop: 10 }}>{err}</p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 14 }}>
          {TIDE_RUN_BOATS.map(b => {
            const unlocked = bestDistance >= b.unlockAt
            const isOn = equipped === b.id
            const src = b.image ?? '/boatrun.png'
            return (
              <button
                key={b.id}
                onClick={() => equip(b)}
                disabled={!unlocked || busy !== null}
                aria-label={unlocked ? `${b.name}${isOn ? ', equipped' : ', tap to equip'}` : `${b.name}, locked until ${b.unlockAt} metres`}
                className="tap"
                style={{
                  position: 'relative', textAlign: 'left', padding: '0.7rem 0.7rem 0.75rem',
                  borderRadius: 14, overflow: 'hidden',
                  background: isOn ? 'rgba(127,208,232,0.13)' : 'rgba(255,255,255,0.035)',
                  border: `1px solid ${isOn ? 'rgba(127,208,232,0.65)' : 'rgba(255,255,255,0.1)'}`,
                  boxShadow: isOn ? '0 0 20px rgba(127,208,232,0.16)' : 'none',
                  cursor: unlocked ? 'pointer' : 'default',
                  opacity: busy && busy !== b.id ? 0.55 : 1,
                  transition: 'background 0.16s ease, border-color 0.16s ease',
                  touchAction: 'manipulation',
                }}
              >
                <span style={{ display: 'block', height: 74, position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src} alt="" decoding="async" loading="lazy"
                    style={{
                      width: '100%', height: '100%', objectFit: 'contain',
                      // Locked boats are SILHOUETTED rather than hidden. You can
                      // see the shape of what you are working towards, which is
                      // the whole reason to show them at all.
                      filter: unlocked
                        ? 'drop-shadow(0 3px 8px rgba(0,0,0,0.45))'
                        : 'brightness(0) opacity(0.34)',
                    }}
                  />
                </span>

                <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: unlocked ? '#f2f7fb' : '#6e808f', marginTop: 6, lineHeight: 1.15 }}>
                  {unlocked ? b.name : '???'}
                </p>

                {unlocked ? (
                  <p className="font-karla" style={{ fontSize: '0.68rem', color: '#8fa6b8', lineHeight: 1.35, marginTop: 2 }}>
                    {b.blurb}
                  </p>
                ) : (
                  <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#7fd0e8', marginTop: 2 }}>
                    {b.unlockAt}m
                  </p>
                )}

                {isOn && (
                  <span className="font-karla font-800 uppercase" style={{
                    position: 'absolute', top: 8, right: 8,
                    fontSize: '0.46rem', letterSpacing: '0.14em', color: '#04202b',
                    background: '#7fd0e8', borderRadius: 999, padding: '0.2rem 0.45rem',
                  }}>
                    Sailing
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
