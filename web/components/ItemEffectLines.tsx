'use client'

import { effectLines, itemFlavor, type RaidItemDef } from '@/lib/raidItems'

/** The Abyssal ember, flat. The gradient version (ABYSSAL_EMBER_TEXT) is for
 *  headings; at bullet size a gradient fill just reads as muddy. */
const SIG = '#ff8a6a'

/**
 * A raid item's mechanics as a LIST rather than a paragraph.
 *
 * The forged tiers carry four effects and the Abyssals five or six, and written
 * as one sentence they became a wall of clauses joined by commas. Two separate
 * mechanics reading as ", and" looked like one mechanic, and nobody got to the
 * end of the sentence anyway. Every line here comes from `effectLines`, which
 * generates them off the item's own effects, so the numbers on the card are the
 * numbers combat uses and a retune cannot leave stale copy behind.
 *
 * THE SIGNATURE gets its own block at the top. An Abyssal is forged from two
 * tier-2 fusions, so most of what it does is inherited and a player reading six
 * identical-looking bullets has no way to tell which one they actually paid the
 * forge chain for. `effectLines` marks the effects neither component could
 * supply; those are lifted out, labelled and tinted ember so the reason to
 * forge the thing is the first thing read.
 *
 * The closing line of character is kept underneath in italic, because it is the
 * item's voice and the list has none.
 *
 * Falls back to the plain description when an item has no static effects (the
 * Primeval Maw grants its own by charge level, so it has nothing to list).
 */
export default function ItemEffectLines({
  def, size = 0.78, color = '#c8c2b8', flavorColor = 'rgba(200,194,184,0.55)', gap = 5,
  showFlavor = true, showSignatureLabel = true,
}: {
  def: RaidItemDef
  /** Body size in rem. The dense surfaces (combat gear sheet, gauntlet locker)
   *  run smaller than the equip modal. */
  size?: number
  color?: string
  flavorColor?: string
  gap?: number
  showFlavor?: boolean
  /** The eyebrow over the signature block. Off on the tightest panels, where
   *  the ember tint alone carries it. */
  showSignatureLabel?: boolean
}) {
  const lines = effectLines(def)
  const flavor = showFlavor ? itemFlavor(def) : null
  const signature = lines.filter(l => l.signature)
  const rest = lines.filter(l => !l.signature)

  if (!lines.length) {
    return (
      <p className="font-karla" style={{ fontSize: `${size}rem`, color, lineHeight: 1.5, margin: 0 }}>
        {def.description}
      </p>
    )
  }

  const bullet = (text: string, i: number, tint: string, marker: string) => (
    <li
      key={i}
      className="font-karla"
      style={{
        fontSize: `${size}rem`, color: tint, lineHeight: 1.4,
        // The marker is a grid column rather than a list-style bullet so a line
        // that wraps stays aligned under its own text, not under the dot. Long
        // effect lines wrap constantly on a phone.
        display: 'grid', gridTemplateColumns: '0.6em minmax(0, 1fr)', columnGap: 6,
      }}
    >
      <span aria-hidden style={{ color: marker, lineHeight: 1.4 }}>·</span>
      <span>{text}</span>
    </li>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {signature.length > 0 && (
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: showSignatureLabel ? '0.45rem 0.6rem' : '0.3rem 0.5rem',
            borderRadius: 9,
            // Translucent tint, never a solid fill, and a single left rule to
            // mark the block off without boxing it in.
            background: 'rgba(255,138,106,0.09)',
            borderLeft: '2px solid rgba(255,138,106,0.55)',
            marginBottom: 2,
          }}
        >
          {showSignatureLabel && (
            <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: SIG, margin: 0 }}>
              {signature.length > 1 ? 'Abyssal Signatures' : 'Abyssal Signature'}
            </p>
          )}
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
            {signature.map((l, i) => bullet(l.text, i, '#ffd2c2', SIG))}
          </ul>
        </div>
      )}
      {rest.length > 0 && (
        <ul style={{ display: 'flex', flexDirection: 'column', gap, listStyle: 'none', margin: 0, padding: 0 }}>
          {rest.map((l, i) => bullet(l.text, i, color, 'rgba(196,176,120,0.75)'))}
        </ul>
      )}
      {flavor && (
        <p
          className="font-karla"
          style={{ fontSize: `${Math.max(0.62, size - 0.04)}rem`, color: flavorColor, lineHeight: 1.45, fontStyle: 'italic', margin: 0 }}
        >
          {flavor}
        </p>
      )}
    </div>
  )
}
