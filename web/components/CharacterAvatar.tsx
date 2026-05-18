'use client'

// Circular avatar that composites the player's character sprite + equipped
// hat (bandana) overlay, zoomed onto the head. Crop values match the tuned
// /dev/avatar settings — width 317%, focal point (-63%, -65%).
//
// Pass the player's character_color id + equipped_hat id and the size in px.
// Used by the desktop nav, /profile, leaderboard rows, and the in-raid
// player nameplate so the player's character shows up everywhere consistently.

import { getCharacterSprites } from '@/lib/characters'
import { getHat } from '@/lib/hats'
import {
  DEFAULT_AVATAR_BG_COLOR,
  DEFAULT_AVATAR_BORDER_COLOR,
} from '@/lib/avatarColors'

interface Props {
  characterColor: string | null
  equippedHat: string | null
  /** Pixel size of the circle. */
  size: number
  /** Outer ring color. Defaults to DEFAULT_AVATAR_BORDER_COLOR; the user
   *  can override this via the profile picker. */
  ringColor?: string
  /** Inner background gradient hue. Defaults to DEFAULT_AVATAR_BG_COLOR;
   *  the user can override this via the profile picker. */
  bgColor?: string
  /** Extra inline style hook for borders / outlines from the call site. */
  borderStyle?: string
}

export default function CharacterAvatar({
  characterColor,
  equippedHat,
  size,
  ringColor = DEFAULT_AVATAR_BORDER_COLOR,
  bgColor   = DEFAULT_AVATAR_BG_COLOR,
  borderStyle,
}: Props) {
  const sprites = getCharacterSprites(characterColor ?? 'default')
  const hat = getHat(equippedHat)
  // 'none' (or empty / nullish) renders transparent — no gradient, no border.
  // Otherwise apply the player's chosen color as a soft radial gradient + ring.
  const bgIsNone     = !bgColor   || bgColor   === 'none'
  const ringIsNone   = !ringColor || ringColor === 'none'
  // Aurora is a special animated ring, not a color. It only applies when
  // the call site hasn't forced its own borderStyle.
  const isAurora     = !borderStyle && ringColor === 'aurora'
  const background   = bgIsNone
    ? 'transparent'
    : `radial-gradient(circle at 38% 35%, ${bgColor}ee 0%, ${bgColor}77 100%)`
  const resolvedBorder = borderStyle ?? (ringIsNone ? 'none' : `2px solid ${ringColor}`)

  const inner = (
    <div style={{
      position: 'absolute',
      width: '317%',
      left: '50%', top: '50%',
      transform: 'translate(-63%, -65%)',
      pointerEvents: 'none',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sprites.rest} alt="" style={{ width: '100%', display: 'block' }} />
      {hat && (() => {
        const hp = hat.positions.rest
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hat.restImageUrl} alt="" style={{
            position: 'absolute',
            top: `${hp.top}%`,
            left: `${hp.left}%`,
            width: `${hp.width}%`,
            transform: `rotate(${hp.rotate}deg)`,
            transformOrigin: 'center center',
            pointerEvents: 'none',
          }} />
        )
      })()}
    </div>
  )

  if (isAurora) {
    // The rotating conic ring is its own layer behind a non-rotating inner
    // circle (inset by the ring thickness) so the sprite never spins.
    // Thickness scales with size so it's proportional everywhere — ~2px in
    // the small nav, but a substantial ring on the large 132px profile
    // avatar (a flat 2px read as a hairline there).
    const RING = Math.max(2, Math.round(size * 0.06))
    return (
      <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
        <div className="avatar-aurora" aria-hidden style={{ position: 'absolute', inset: 0 }} />
        <div style={{
          position: 'absolute', inset: RING, borderRadius: '50%',
          background, overflow: 'hidden',
        }}>
          {inner}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background,
      border: resolvedBorder,
      overflow: 'hidden',
      position: 'relative',
      flexShrink: 0,
    }}>
      {inner}
    </div>
  )
}
