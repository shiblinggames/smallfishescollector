'use client'

import { effectLines, itemFlavor, type RaidItemDef } from '@/lib/raidItems'

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
 * The closing line of character is kept underneath in italic, because it is the
 * item's voice and the list has none.
 *
 * Falls back to the plain description when an item has no static effects (the
 * Primeval Maw grants its own by charge level, so it has nothing to list).
 */
export default function ItemEffectLines({
  def, size = 0.78, color = '#c8c2b8', flavorColor = 'rgba(200,194,184,0.55)', gap = 5, showFlavor = true,
}: {
  def: RaidItemDef
  /** Body size in rem. The dense surfaces (combat gear sheet, gauntlet locker)
   *  run smaller than the equip modal. */
  size?: number
  color?: string
  flavorColor?: string
  gap?: number
  showFlavor?: boolean
}) {
  const lines = effectLines(def)
  const flavor = showFlavor ? itemFlavor(def) : null

  if (!lines.length) {
    return (
      <p className="font-karla" style={{ fontSize: `${size}rem`, color, lineHeight: 1.5, margin: 0 }}>
        {def.description}
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      <ul style={{ display: 'flex', flexDirection: 'column', gap, listStyle: 'none', margin: 0, padding: 0 }}>
        {lines.map((line, i) => (
          <li
            key={i}
            className="font-karla"
            style={{
              fontSize: `${size}rem`, color, lineHeight: 1.4,
              // The marker is a grid column rather than a list-style bullet so a
              // line that wraps stays aligned under its own text, not under the
              // dot. Long effect lines wrap constantly on a phone.
              display: 'grid', gridTemplateColumns: '0.6em minmax(0, 1fr)', columnGap: 6,
            }}
          >
            <span aria-hidden style={{ color: 'rgba(196,176,120,0.75)', lineHeight: 1.4 }}>·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
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
