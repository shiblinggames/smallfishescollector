'use client'

// The player's fisher as a static rest-pose composite — character + hat + boat
// + rod + reel + hook + pet, layered with the SAME coordinates the live fishing
// scene (FishingGame) and the profile silhouette use, so it reads identically
// everywhere. Renders at 100% of its container's width; the parent sizes and
// positions it. Purely decorative — pointer-events are off so it never eats a tap.

import { getCharacterSprites } from '@/lib/characters'
import { getBoat, boatGlowClass } from '@/lib/boats'
import { getHat } from '@/lib/hats'
import { getPet, getPetOverlay } from '@/lib/pets'
import { getRod, rodGlowClass } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getHook, hookGlowClass } from '@/lib/hooks'

export default function FisherPose({
  characterColor, equippedHat, equippedBoat, equippedPet, equippedPetBow, rodTier, reelTier, hookTier,
  noGlow = false,
}: {
  characterColor: string
  equippedHat: string | null
  equippedBoat: string | null
  equippedPet: string | null
  /** Front-facing pet, drawn alongside the stern one. */
  equippedPetBow?: string | null
  rodTier: number
  reelTier: number
  hookTier: number
  /** Drop the rod/hook/boat glow classes.
   *
   *  Those glows animate `filter: drop-shadow()` on an INFINITE loop, which
   *  repaints and re-blurs the image every single frame for as long as the
   *  composite is on screen. That is a fair trade in the live fishing scene,
   *  where the rod is large and the glow is part of the moment. It is not a
   *  fair trade in a 150px static preview inside a modal, where it costs one
   *  to three per-frame blur passes to produce a halo you can barely see.
   *
   *  Set this anywhere the pose is decorative rather than the main event. */
  noGlow?: boolean
}) {
  const charSprites = getCharacterSprites(characterColor)
  const rod = getRod(rodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const hd = getHat(equippedHat)
  const bd = getBoat(equippedBoat)
  const pets = [getPet(equippedPet), getPet(equippedPetBow)].filter(Boolean) as NonNullable<ReturnType<typeof getPet>>[]

  return (
    <div style={{ position: 'relative', width: '100%', pointerEvents: 'none' }}>
      {/* Character base (rest frame). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={charSprites.rest} alt="" loading="lazy" decoding="async" style={{ width: '100%', display: 'block' }} />

      {/* Hat. */}
      {hd && (() => {
        const hp = hd.positions.rest
        return (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={hd.restImageUrl} alt="" loading="lazy" decoding="async" style={{
            position: 'absolute', top: `${hp.top}%`, left: `${hp.left}%`,
            width: `${hp.width}%`, transform: `rotate(${hp.rotate}deg)`,
            transformOrigin: 'center center',
          }} />
        )
      })()}

      {/* Boat — matches the iOS rest-frame nudge applied in FishingGame. */}
      {bd && (() => {
        const bp = bd.positions.rest
        return (
          <div style={{
            position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
            width: `${bp.width}%`, transform: `rotate(${bp.rotate}deg) translateX(-2px)`,
            transformOrigin: 'center center',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bd.restImageUrl} alt="" loading="lazy" decoding="async" className={noGlow ? undefined : boatGlowClass(bd)} style={{ width: '100%', display: 'block' }} />
          </div>
        )
      })()}

      {/* Rod — 3-pose rest sprite (coords mirror CHAR_ROD_OVERLAY.rest). */}
      {rod.slug ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={`/${rod.slug}_rest.png`} alt="" loading="lazy" decoding="async" className={noGlow ? undefined : rodGlowClass(rod)} style={{
          position: 'absolute', top: '37%', left: '-12%', width: '107.5%',
          transformOrigin: 'center center', maxWidth: 'none',
          ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : {}),
        } as React.CSSProperties} />
      ) : rod.imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={rod.imageUrl} alt="" loading="lazy" decoding="async" className={noGlow ? undefined : rodGlowClass(rod)} style={{
          position: 'absolute', top: '33%', left: '12%', width: '51%',
          transform: 'rotate(-1deg)', transformOrigin: 'bottom right',
          ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : {}),
        } as React.CSSProperties} />
      )}

      {/* Reel — mirrors CHAR_REEL_OVERLAY.rest. */}
      {reel.imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={reel.imageUrl} alt="" loading="lazy" decoding="async" style={{
          position: 'absolute', top: '15%', left: '-10.3%', width: '222%',
          transform: 'rotate(-18deg)', transformOrigin: 'center center', maxWidth: 'none',
        }} />
      )}

      {/* Hook — mirrors CHAR_HOOK_OVERLAY.rest. */}
      {hook.imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={hook.imageUrl} alt="" loading="lazy" decoding="async" className={noGlow ? undefined : hookGlowClass(hook)} style={{
          position: 'absolute', top: '39.5%', left: '-10.5%', width: '204.5%',
          transformOrigin: 'center center', maxWidth: 'none',
          ...(hook.glow ? { ['--rod-glow-color' as string]: hook.color } : {}),
        } as React.CSSProperties} />
      )}

      {/* Pet — foreground, above every equipment layer. */}
      {/* Up to two: a stern pet and a front-facing bow pet, each on its own
          coords so they never land in the same spot. */}
      {pets.map((pet, i) => {
        const pp = getPetOverlay(pet.species, 'rest')
        return (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img key={i} src={pet.restImageUrl} alt="" loading="lazy" decoding="async" style={{
            position: 'absolute', top: `${pp.top}%`, left: `${pp.left}%`,
            width: `${pp.width}%`, transform: `rotate(${pp.rotate}deg)`,
            transformOrigin: 'center center',
            filter: `drop-shadow(0 0 6px ${pet.accentColor}55)`,
          }} />
        )
      })}
    </div>
  )
}
