'use client'

import { useState, useTransition } from 'react'
import { TIDE_RUN_BOATS, tideRunBoat, nextBoat, type TideRunBoat } from '@/lib/tideRunBoats'
import { TIDE_RUN_SEAS, nextSea, type TideRunSea } from '@/lib/tideRunSeas'
import { setTideRunBoat, setTideRunSea } from './actions'
import { hapticTap, hapticReward } from '@/lib/haptics'
import PopupShell from '@/components/PopupShell'

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
  bestDistance, equippedId, equippedSeaId, onEquip, onEquipSea, onClose,
}: {
  bestDistance: number
  equippedId: string
  equippedSeaId: string
  onEquip: (id: string) => void
  onEquipSea: (id: string) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'boats' | 'seas'>('boats')
  const [equippedSea, setEquippedSea] = useState(equippedSeaId)
  const [equipped, setEquipped] = useState(equippedId)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const next = tab === 'boats' ? nextBoat(bestDistance) : nextSea(bestDistance)
  const owned = (tab === 'boats' ? TIDE_RUN_BOATS : TIDE_RUN_SEAS).filter(x => bestDistance >= x.unlockAt).length
  const total = (tab === 'boats' ? TIDE_RUN_BOATS : TIDE_RUN_SEAS).length

  function equipSea(sea: TideRunSea) {
    if (bestDistance < sea.unlockAt || sea.id === equippedSea) return
    hapticTap(); setErr(null); setBusy(sea.id)
    const previous = equippedSea
    setEquippedSea(sea.id)
    startTransition(async () => {
      const res = await setTideRunSea(sea.id)
      if ('error' in res) { setEquippedSea(previous); setErr(res.error) }
      else { onEquipSea(sea.id); hapticReward() }
      setBusy(null)
    })
  }

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
    // PopupShell, not a hand-rolled fixed overlay. The first version padded
    // 1.4rem top and bottom and the nav bar (76px) and mobile tab bar (80px)
    // ate the header and the last row of cards. The shell exists because those
    // two heights are the same on every full-screen sheet in the game, and
    // getting them from one place is the only way they stay right.
    <PopupShell open onClose={onClose} zIndex={200} backdropColor="rgba(3,10,18,0.88)">
      <div
        onClick={e => e.stopPropagation()}
        style={{
          // WIDTH 100%, and that is the fix for the pop-and-expand. The shell's
          // wrapper is a flex container, so a child with only a maxWidth is a
          // flex item sized to its CONTENT: the panel opened at the width of the
          // text, then the lazy card images arrived and shoved it out to 520.
          // A definite width means it is the right size on the first frame and
          // nothing reflows.
          width: '100%', maxWidth: 520, margin: '0 auto', alignSelf: 'flex-start',
          // Horizontal padding only INSIDE the panel — the shell already pads
          // the wrapper 1rem each side, and doubling it was squeezing the grid.
          // The bottom pad is the real clearance for the mobile tab bar: a flex
          // scroll container's own padding-bottom is not reliably honoured at
          // the end of the scroll, which is why the shell's was not enough and
          // the last row of cards still sat under the bar.
          padding: '1.1rem 0.85rem calc(env(safe-area-inset-bottom, 0px) + 96px)',
          // A SOLID BASE. The shell only dims the game behind it, and a locker
          // read against a moving sea with boats sliding past is genuinely hard
          // to look at. Panels over live art need their own opaque ground —
          // near-black rather than pure, so it still reads as part of the sea
          // rather than as a browser dialog dropped on top.
          background: 'linear-gradient(180deg, #0a1622 0%, #060e18 100%)',
          border: '1px solid rgba(127,208,232,0.22)',
          borderRadius: 18,
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.2em', color: '#7fd0e8' }}>
              The Boathouse
            </p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f2f7fb', lineHeight: 1.1, marginTop: 3 }}>
              {tab === 'boats' ? 'Your Boats' : 'Your Waters'}
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

        {/* Two ladders, one screen. Tabs rather than a long scroll, because a
            captain arrives here wanting one of two things and should not have
            to hunt past eleven boats to change the water. */}
        <div style={{ display: 'flex', gap: 7, margin: '12px 0 10px' }}>
          {([['boats', 'Boats'], ['seas', 'Waters']] as const).map(([id, label]) => {
            const on = tab === id
            return (
              <button
                key={id}
                onClick={() => { hapticTap(); setTab(id); setErr(null) }}
                className="font-karla font-700 uppercase tap"
                style={{
                  padding: '0.4rem 0.85rem', borderRadius: 999,
                  fontSize: '0.6rem', letterSpacing: '0.12em',
                  background: on ? 'rgba(127,208,232,0.16)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${on ? 'rgba(127,208,232,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  color: on ? '#dff1f8' : '#8fa6b8',
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Progress, then the single nearest target. The count says how far you
            have come; the target says what the next run is FOR. */}
        <p className="font-karla" style={{ fontSize: '0.78rem', color: '#8fa6b8' }}>
          {owned} of {total} earned
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
          {tab === 'seas' && TIDE_RUN_SEAS.map(sea => {
            const unlocked = bestDistance >= sea.unlockAt
            const isOn = equippedSea === sea.id
            return (
              <button
                key={sea.id}
                onClick={() => equipSea(sea)}
                disabled={!unlocked || busy !== null}
                aria-label={unlocked ? `${sea.name}${isOn ? ', sailing' : ', tap to sail'}` : `${sea.name}, locked until ${sea.unlockAt} metres`}
                className="tap"
                style={{
                  position: 'relative', textAlign: 'left', padding: '0.7rem 0.7rem 0.75rem',
                  borderRadius: 14, overflow: 'hidden',
                  background: isOn ? 'rgba(127,208,232,0.13)' : 'rgba(255,255,255,0.035)',
                  border: `1px solid ${isOn ? 'rgba(127,208,232,0.65)' : 'rgba(255,255,255,0.1)'}`,
                  boxShadow: isOn ? '0 0 20px rgba(127,208,232,0.16)' : 'none',
                  cursor: unlocked ? 'pointer' : 'default',
                  opacity: busy && busy !== sea.id ? 0.55 : 1,
                  transition: 'background 0.16s ease, border-color 0.16s ease',
                  touchAction: 'manipulation',
                }}
              >
                {/* The swatch IS the preview. Sky over sea, the two colours a
                    player actually reads the world by, so a sea is recognisable
                    without launching a run to look at it. Locked ones are
                    desaturated rather than blanked — you can still tell the
                    Ash Reach from the Frozen Reach, which is the point. */}
                {/* Same 74px box as a boat card, and the same visual inset.
                    A boat is drawn with objectFit:'contain' so its own
                    transparent margin holds it off the card edge; a full-bleed
                    swatch ran wider than the boats beside it and the two tabs
                    stopped lining up. The 6% inset matches by eye. */}
                <span style={{ display: 'block', height: 74, padding: '0 6%' }}>
                  <span style={{
                    display: 'block', height: '100%', borderRadius: 9, overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: `linear-gradient(180deg, ${sea.swatch[0]} 0%, ${sea.swatch[0]} 45%, ${sea.swatch[1]} 45%, ${sea.swatch[1]} 100%)`,
                    filter: unlocked ? 'none' : 'saturate(0.25) brightness(0.55)',
                  }} />
                </span>

                <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: unlocked ? '#f2f7fb' : '#6e808f', marginTop: 6, lineHeight: 1.15 }}>
                  {unlocked ? sea.name : '???'}
                </p>
                {unlocked ? (
                  <p className="font-karla" style={{ fontSize: '0.68rem', color: '#8fa6b8', lineHeight: 1.35, marginTop: 2 }}>
                    {sea.blurb}
                  </p>
                ) : (
                  <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#7fd0e8', marginTop: 2 }}>
                    {sea.unlockAt}m
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

          {tab === 'boats' && TIDE_RUN_BOATS.map(b => {
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
    </PopupShell>
  )
}
