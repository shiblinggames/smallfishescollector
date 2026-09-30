// THE CAPTAIN SELECT (Steam prep, 2026-09-30).
//
// The title screen. A player keeps as many captains as they like, each with a
// save and a home sea of their own (decided with Kong); this is where one is
// picked, a new one signed on, or an old one retired. It opens on launch, and
// again from the Nav's Captains link.
//
// Choosing a captain RELOADS THE WINDOW with that captain named for the tab
// (sessionStorage), rather than swapping the save underneath the mounted game:
// the screens and the Steam sync keep module state for the captain they
// started with, and a fresh page is the one way to be sure none of it leaks
// from one captain to the next.
//
// Retiring moves the save to retired/ in the save folder (electron/captains.cjs);
// nothing is deleted.

import { useEffect, useState } from 'react'
import { listCaptains, retireCaptain, newCaptainId, type CaptainEntry } from './saveStorage'
import { getLevelFromXP as fishingLevel } from '@/lib/fishingLevel'
import { getLevelFromXP as expeditionLevel } from '@/lib/expeditionLevel'
import CharacterAvatar from '@/components/CharacterAvatar'

const CHOSEN = 'stb:captain'

/** The captain this window is playing, if one has been chosen. */
export function chosenCaptain(): string | null {
  try { return sessionStorage.getItem(CHOSEN) } catch { return null }
}

/** Play this captain: name it for the tab and start the game fresh. */
export function playCaptain(id: string): void {
  try { sessionStorage.setItem(CHOSEN, id) } catch { /* the reload below still lands on the select */ }
  window.location.assign('/sea')
}

const GOLD = '#f0c040'
const INK = '#f0ede8'

export default function CaptainSelect() {
  const [captains, setCaptains] = useState<CaptainEntry[] | null>(null)
  const [retiring, setRetiring] = useState<string | null>(null)
  const current = chosenCaptain()

  const load = () => { void listCaptains().then(setCaptains).catch(() => setCaptains([])) }
  useEffect(load, [])

  async function retire(id: string) {
    await retireCaptain(id)
    if (id === current) { try { sessionStorage.removeItem(CHOSEN) } catch { /* nothing to clear */ } }
    setRetiring(null)
    load()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'radial-gradient(ellipse at 50% 20%, #16384a 0%, #0b1a24 70%)', color: INK, fontFamily: 'var(--font-karla)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '8vh 16px 48px' }}>
        <h1 style={{ fontFamily: 'var(--font-cinzel)', fontSize: 34, textAlign: 'center', letterSpacing: '0.04em', margin: 0 }}>Seas the Booty</h1>
        <p style={{ textAlign: 'center', opacity: 0.65, margin: '8px 0 32px', fontSize: 14 }}>Choose your captain</p>

        {captains === null ? null : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {captains.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 14, background: '#10263a', border: `1px solid ${c.id === current ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.08)'}` }}>
                <div style={{ width: 48, height: 48, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                  {!c.damaged && <CharacterAvatar characterColor={c.color ?? 'default'} equippedHat={c.hat ?? null} size={46} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-cinzel)', fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.damaged ? 'A save that will not open' : c.setUp ? c.name : 'A captain not yet signed on'}
                  </div>
                  {!c.damaged && (
                    <div style={{ fontSize: 12.5, opacity: 0.65, marginTop: 3 }}>
                      Fishing {fishingLevel(c.fishingXp ?? 0)} · Expeditions {expeditionLevel(c.expeditionXp ?? 0)} · <span style={{ color: GOLD }}>{(c.doubloons ?? 0).toLocaleString()} ⟡</span>
                      {c.savedAt ? <> · last played {new Date(c.savedAt).toLocaleDateString()}</> : null}
                    </div>
                  )}
                </div>
                {retiring === c.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, opacity: 0.75 }}>Retire?</span>
                    <button onClick={() => void retire(c.id)} style={small('rgba(239,68,68,0.8)')}>Retire</button>
                    <button onClick={() => setRetiring(null)} style={small(INK)}>Keep</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!c.damaged && <button onClick={() => playCaptain(c.id)} style={primary}>Play</button>}
                    <button onClick={() => setRetiring(c.id)} aria-label="Retire this captain" style={small('rgba(240,237,232,0.55)')}>Retire</button>
                  </div>
                )}
              </div>
            ))}
            <button onClick={() => playCaptain(newCaptainId())} style={{ ...primary, marginTop: 10, padding: '13px 0', fontSize: 15 }}>
              New Captain
            </button>
            {captains.some(c => !c.damaged) && (
              <p style={{ textAlign: 'center', fontSize: 12, opacity: 0.5, marginTop: 14 }}>
                A retired captain's save is set aside in the save folder, not deleted.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const primary: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 999, border: '1px solid rgba(240,192,64,0.6)',
  background: 'rgba(240,192,64,0.12)', color: GOLD, cursor: 'pointer', fontFamily: 'var(--font-cinzel)', fontWeight: 700,
}
const small = (color: string): React.CSSProperties => ({
  padding: '7px 12px', borderRadius: 999, border: `1px solid ${color}`, background: 'transparent', color, cursor: 'pointer', fontSize: 12,
})
