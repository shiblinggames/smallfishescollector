'use client'

// ── THE LOADOUT, WITH THE THING IT IS ABOUT IN IT ───────────────────────────
//
// It was a list. A stack of rod names with a 26px thumbnail beside each, then
// three text rows naming the reel, line and hook, then the dial numbers. Every
// fact was there and you could not SEE any of it — the rod you were holding
// looked exactly like the rod you were not, at 26 pixels, in a column.
//
// The Shipyard already solved this and had done for a while: a preview of your
// captain in the boat with the gear actually drawn on, and you change what is
// hanging off it by tapping. That is the same screen this wants to be, so it is
// the same component — components/PreviewStage, moved out of the shipyard folder
// when the second consumer turned up rather than copied into a third.
//
// ── AND YOU CARRY EVERYTHING NOW ────────────────────────────────────────────
//
// The rod rack is gone (see lib/shipyard). This used to show the one to four
// rods you had paid berths for; it shows every rod you own, and swapping is
// free. Which means the list can be long, so it is a GRID of what the rods look
// like rather than a column of what they are called — the sprite is how anybody
// actually recognises a rod, and it was the one thing the old sheet shrank.

import { motion } from 'framer-motion'
import PreviewStage from '@/components/PreviewStage'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'
const SEA = 'rgba(190,212,228'

export type LoadoutRod = {
  tier: number
  name: string
  slug: string | null
  image: string | null
  catchZoneBonus: number
}

export default function LoadoutBody({
  rack, activeRod, locked, onPick, look, reelTier, hookTier, reelName, lineName, hookName,
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
  reelTier: number
  hookTier: number
  reelName: string
  lineName: string
  hookName: string
}) {
  const active = rack.find(r => r.tier === activeRod) ?? rack[0] ?? null

  return (
    <>
      {/* ── THE PREVIEW ── the same stage the Shipyard draws, showing the rod
          that is actually in your hands right now. Tapping a rod below changes
          this, so the swap is something you WATCH rather than something you
          read back off a list. */}
      <PreviewStage style={{ marginTop: 10 }} kit={{
        characterColor: look.characterColor,
        equippedHat: look.hatId,
        equippedBoat: look.boatId,
        equippedPet: look.petId,
        equippedPetBow: look.petBow,
        // THE ROD IN HAND, not the one equipped ashore. That distinction is the
        // whole point of this sheet: at sea you hold what you picked here.
        rodTier: active?.tier ?? 0,
        reelTier,
        hookTier,
      }} />

      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.56rem', letterSpacing: '0.18em',
        color: `${SEA},0.45)`, margin: '1rem 0 0',
      }}>
        {rack.length > 1 ? `Your rods · ${rack.length}` : 'Your rod'}
      </p>

      {/* A GRID, NOT A COLUMN. Every rod you own is here now rather than the
          one to four a rack could hold, so a full-width row each would be a
          scroll. Sprite first and big, because that is how a rod is recognised;
          the name underneath is the confirmation, not the identifier. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
        gap: 7, marginTop: 8,
      }}>
        {rack.map(r => {
          const on = r.tier === activeRod
          return (
            <motion.button key={r.tier} data-no-steer
              whileTap={locked || on ? undefined : { scale: 0.95 }}
              onClick={e => {
                e.stopPropagation()
                if (!locked && !on) { vibrate(10); onPick(r.tier) }
              }}
              disabled={locked || on}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '0.5rem 0.3rem 0.42rem', borderRadius: 12,
                background: on ? 'rgba(240,192,64,0.13)' : 'rgba(255,255,255,0.035)',
                border: `1px solid ${on ? `${GOLD}80` : 'rgba(255,255,255,0.09)'}`,
                cursor: locked || on ? 'default' : 'pointer',
                opacity: locked && !on ? 0.4 : 1,
              }}>
              <div style={{
                width: 44, height: 44, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {r.slug ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/${r.slug}_thumb.png`} alt="" style={{
                    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                    filter: on ? `drop-shadow(0 2px 8px ${GOLD}70)` : 'none',
                  }} />
                ) : (
                  // THE LOW TIERS HAVE NO SPRITE. Their rod is painted into the
                  // character art and has no overlay of its own — that null is
                  // correct rather than missing, so this is a placeholder with
                  // the tier on it rather than an empty hole.
                  <span className="font-cinzel font-700" style={{
                    fontSize: '0.9rem', color: `${SEA},0.4)`,
                  }}>{r.tier}</span>
                )}
              </div>
              <span className="font-karla font-700" style={{
                fontSize: '0.6rem', lineHeight: 1.2, textAlign: 'center',
                color: on ? GOLD : `${SEA},0.72)`,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>{r.name}</span>
              {r.catchZoneBonus > 0 && (
                <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: '#7fd6a0' }}>
                  +{r.catchZoneBonus}°
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      {locked && rack.length > 1 && (
        <p className="font-karla font-600" style={{
          fontSize: '0.75rem', color: 'rgba(232,201,138,0.85)', marginTop: 8,
        }}>
          Rods stay put while a line is in the water.
        </p>
      )}

      {/* ── THE REST ── still text, and still should be. A reel and a line have
          no sprite of their own out here and nothing to look at; what matters
          about them is the number, which is two sections down. */}
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
