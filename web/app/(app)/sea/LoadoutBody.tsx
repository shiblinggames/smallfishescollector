'use client'

// ── THE LOADOUT IS THE SHIPYARD'S PREVIEW, ON THE WATER ─────────────────────
//
// Same picture, same labels, same hairlines, same tap. Not a copy: it renders
// components/PreviewStage and components/CalloutLayer off lib/callouts, which
// are the exact three the Shipyard draws. Both screens moved out of the
// shipyard folder as each new consumer appeared rather than being duplicated
// into it — a shared thing filed under one of its users is a shared thing
// somebody copies instead of imports.
//
// ── THE ROD IS A SLOT LIKE ANY OTHER NOW ────────────────────────────────────
//
// It was a grid of rod sprites sitting under the preview, permanently open,
// which made the one piece of gear you swap most often the only one that did
// not work like the rest. It is behind its Rod label with everything else, and
// the picker that opens is the same picker.
//
// ── SWAPPING, NOT SHOPPING ──────────────────────────────────────────────────
//
// Everything here equips something you already own. Nothing buys, sells or
// forges, and that is a line rather than an omission: the shops are buildings
// on an island and reaching them is a sail with a decision in it. It is the
// same argument that retired quick-sell, and a till in the middle of the ocean
// would undo it from the other end. See sea/loadoutActions.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PreviewStage from '@/components/PreviewStage'
import CalloutLayer from '@/components/CalloutLayer'
import type { SlotKey } from '@/app/(app)/fishing/GearScreen'
import { vibrate } from '@/lib/haptics'
import { RODS } from '@/lib/rods'
import { HATS } from '@/lib/hats'
import { BOATS } from '@/lib/boats'
import { PETS } from '@/lib/pets'
import { CHARACTER_COLORS } from '@/lib/characters'
import { loadoutGear, type LoadoutGear } from './loadoutActions'
import { equipHat, equipBoat, equipPet } from '@/app/(app)/fishing/actions'
import { updateCharacterColor } from '@/app/(app)/u/actions'

const GOLD = '#f0c040'
const SEA = 'rgba(190,212,228'

export type LoadoutRod = {
  tier: number
  name: string
  slug: string | null
  image: string | null
  catchZoneBonus: number
}

/** One option in a picker. Flattened from four very different tables so the
 *  grid below draws one kind of thing. */
type Option = { id: string; label: string; art: string | null; on: boolean }

export default function LoadoutBody({
  rack, activeRod, locked, onPick, look, onLookChange, reelTier, hookTier, reelName, lineName, hookName,
}: {
  rack: LoadoutRod[]
  activeRod: number
  /** A line in the water pins the rod. Swapping mid-cast would change the dial
   *  under a fish that was hooked with something else. */
  locked: boolean
  onPick: (tier: number) => void
  look: {
    characterColor: string
    hatId: string | null
    boatId: string | null
    petId: string | null
    petBow: string | null
  }
  /** Equipping a cosmetic has to move the boat on the chart behind this sheet,
   *  not just the picture in it. */
  onLookChange: (patch: Partial<{ characterColor: string; hatId: string | null; boatId: string | null; petId: string | null }>) => void
  reelTier: number
  hookTier: number
  reelName: string
  lineName: string
  hookName: string
}) {
  const [slot, setSlot] = useState<SlotKey | null>(null)
  const [gear, setGear] = useState<LoadoutGear | null>(null)
  const [busy, setBusy] = useState(false)

  // ON OPEN, NOT ON MOUNT OF THE CHART. Every hat, boat, pet and colour is a
  // lot of rows to put on the critical path of the most-loaded page in the game
  // for a panel most sessions never open.
  useEffect(() => {
    if (slot === null || gear) return
    let alive = true
    void loadoutGear().then(g => { if (alive) setGear(g) }).catch(() => {})
    return () => { alive = false }
  }, [slot, gear])

  const active = rack.find(r => r.tier === activeRod) ?? rack[0] ?? null

  const nameFor = (s: SlotKey): string => {
    switch (s) {
      case 'rod': return active?.name ?? 'None'
      case 'hat': return HATS.find(h => h.id === look.hatId)?.name ?? 'None'
      case 'boat': return BOATS.find(b => b.id === look.boatId)?.name ?? 'Default'
      case 'pet': return PETS.find(p => p.id === look.petId)?.name ?? 'None'
      case 'skin': return CHARACTER_COLORS.find(c => c.id === look.characterColor)?.name ?? 'Default'
      default: return 'None'
    }
  }

  /** What the open picker offers. Built per slot rather than one big table,
   *  because the four sources genuinely have nothing in common but an id. */
  const options = (): Option[] => {
    if (!gear) return []
    switch (slot) {
      case 'rod':
        return rack.map(r => ({
          id: String(r.tier), label: r.name,
          art: r.slug ? `/${r.slug}_thumb.png` : null,
          on: r.tier === activeRod,
        }))
      case 'hat':
        return [{ id: '', label: 'No hat', art: null, on: !look.hatId }, ...gear.hats
          .map(id => HATS.find(h => h.id === id))
          .filter((h): h is NonNullable<typeof h> => !!h)
          .map(h => ({ id: h.id, label: h.name, art: h.restImageUrl ?? null, on: h.id === look.hatId }))]
      case 'boat':
        return gear.boats
          .map(id => BOATS.find(b => b.id === id))
          .filter((b): b is NonNullable<typeof b> => !!b)
          .map(b => ({ id: b.id, label: b.name, art: b.restImageUrl ?? null, on: b.id === look.boatId }))
      case 'pet':
        return [{ id: '', label: 'No pet', art: null, on: !look.petId }, ...gear.pets
          .map(id => PETS.find(p => p.id === id))
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map(p => ({ id: p.id, label: p.name, art: p.restImageUrl ?? null, on: p.id === look.petId }))]
      case 'skin':
        return gear.colors
          .map(id => CHARACTER_COLORS.find(c => c.id === id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map(c => ({ id: c.id, label: c.name, art: null, on: c.id === look.characterColor }))
      default: return []
    }
  }

  /** Optimistic, then persisted. The picture has to move on the tap — this is a
   *  wardrobe, and a wardrobe that waits on a round trip feels broken. Every
   *  action here is idempotent and server-validated, so the worst a failure
   *  costs is a preview that disagrees until the next load. */
  const choose = async (id: string) => {
    if (busy || !slot) return
    vibrate(8)
    if (slot === 'rod') { onPick(Number(id)); setSlot(null); return }
    setBusy(true)
    const value = id === '' ? null : id
    if (slot === 'hat') { onLookChange({ hatId: value }); await equipHat(value).catch(() => {}) }
    else if (slot === 'boat') { onLookChange({ boatId: value }); await equipBoat(value).catch(() => {}) }
    else if (slot === 'pet') { onLookChange({ petId: value }); await equipPet(value).catch(() => {}) }
    else if (slot === 'skin' && value) { onLookChange({ characterColor: value }); await updateCharacterColor(value).catch(() => {}) }
    setBusy(false)
    setSlot(null)
  }

  const rodLocked = locked && slot === 'rod'

  return (
    <>
      {/* THE PREVIEW AND ITS LABELS, exactly as the Shipyard draws them. Tap a
          label, pick a thing, watch the boat change. */}
      <div style={{ position: 'relative', marginTop: 10 }}>
        <PreviewStage kit={{
          characterColor: look.characterColor,
          equippedHat: look.hatId,
          equippedBoat: look.boatId,
          equippedPet: look.petId,
          equippedPetBow: look.petBow,
          // THE ROD IN HAND, not the one equipped ashore. That distinction is
          // the whole point of this sheet: at sea you hold what you picked here.
          rodTier: active?.tier ?? 0,
          reelTier,
          hookTier,
        }}>
          <CalloutLayer nameFor={nameFor} onPick={s => { vibrate(8); setSlot(s) }} />
        </PreviewStage>
      </div>

      {/* ── THE PICKER ── one grid for four very different tables, in the sheet
          rather than in a modal of its own: this is already a panel, and a
          panel over a panel over painted water is two floors too many. */}
      <AnimatePresence initial={false}>
        {slot && (
          <motion.div key={slot}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}>
            <div style={{
              marginTop: 12, padding: '0.7rem 0.7rem 0.75rem', borderRadius: 14,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.09)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p className="font-karla font-700 uppercase" style={{
                  flex: 1, fontSize: '0.56rem', letterSpacing: '0.18em', color: `${SEA},0.5)`,
                }}>{slot}</p>
                <button type="button" data-no-steer aria-label="Close"
                  onClick={e => { e.stopPropagation(); setSlot(null) }}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
                    color: '#cfcabf', cursor: 'pointer',
                  }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>

              {rodLocked ? (
                <p className="font-karla font-600" style={{
                  fontSize: '0.78rem', color: 'rgba(232,201,138,0.85)', marginTop: 8,
                }}>Rods stay put while a line is in the water.</p>
              ) : !gear && slot !== 'rod' ? (
                <p className="font-karla font-600" style={{
                  fontSize: '0.78rem', color: `${SEA},0.45)`, marginTop: 10,
                }}>Opening the locker…</p>
              ) : (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))',
                  gap: 6, marginTop: 8,
                }}>
                  {options().map(o => (
                    <motion.button key={o.id || 'none'} data-no-steer
                      whileTap={o.on || busy ? undefined : { scale: 0.95 }}
                      onClick={e => { e.stopPropagation(); if (!o.on) void choose(o.id) }}
                      disabled={o.on || busy}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: '0.45rem 0.28rem 0.4rem', borderRadius: 11,
                        background: o.on ? 'rgba(240,192,64,0.13)' : 'rgba(255,255,255,0.035)',
                        border: `1px solid ${o.on ? `${GOLD}80` : 'rgba(255,255,255,0.09)'}`,
                        cursor: o.on || busy ? 'default' : 'pointer',
                        opacity: busy && !o.on ? 0.5 : 1,
                      }}>
                      <div style={{
                        width: 40, height: 40, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {o.art ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.art} alt="" style={{
                            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                            filter: o.on ? `drop-shadow(0 2px 8px ${GOLD}70)` : 'none',
                          }} />
                        ) : (
                          // NO ART IS NOT A HOLE. Skins have no icon of their
                          // own and "None" is a real choice; both get a dot in
                          // the slot's own colour rather than an empty box.
                          <span style={{
                            width: 18, height: 18, borderRadius: '50%',
                            background: o.on ? GOLD : `${SEA},0.28)`,
                          }} />
                        )}
                      </div>
                      <span className="font-karla font-700" style={{
                        fontSize: '0.58rem', lineHeight: 1.2, textAlign: 'center',
                        color: o.on ? GOLD : `${SEA},0.72)`,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>{o.label}</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── THE REST ── still text, and still should be. A reel and a line have
          no sprite of their own out here; what matters about them is the number,
          and they are bought ashore. */}
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.56rem', letterSpacing: '0.18em',
        color: `${SEA},0.45)`, margin: '1.1rem 0 0',
      }}>The rest of your kit</p>
      <div style={{ marginTop: 4 }}>
        {[['Reel', reelName], ['Line', lineName], ['Hook', hookName]].map(([k, v]) => (
          <div key={k} style={{
            display: 'flex', alignItems: 'baseline', gap: 8,
            padding: '0.32rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span className="font-karla font-600" style={{ flex: 1, fontSize: '0.8rem', color: `${SEA},0.6)` }}>{k}</span>
            <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#f2ead8' }}>{v}</span>
          </div>
        ))}
      </div>
    </>
  )
}
