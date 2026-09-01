'use client'

// ── THE ACTION, BUILT LIKE THE INSTRUMENT ───────────────────────────────────
//
// Cast, Cast Again and Reel In sit directly under the dial, at the same
// diameter, and they were made of completely different stuff: a flat coloured
// wash, a 1px accent ring, and a hard `0 6px 0` offset shadow. That shadow is
// the tell. An opaque black rectangle offset straight down is a CARTOON button
// — it says the control is a slab of plastic sitting on a surface — and it was
// six pixels below a machined gauge with a domed glass face, brass banding and
// light pooling in its channels. Two objects from two different games, touching.
//
// So this is the dial's own construction at a smaller size, and it takes the
// materials from FishingDial rather than eyeballing them, so the two cannot
// drift the way the fire's radius and its canvas did.
//
//   THE GLASS is the identical three-stop radial the dial fills its face with,
//   lit from just above centre. Same dome, same light.
//
//   THE BEZEL is the dial's own: a black ring with a single faint hairline,
//   which out on painted water is the only thing separating an instrument from
//   the sea behind it.
//
//   THE CHANNEL is the zone bands' trick, which the dial's comments already
//   explain better than I can: a bright lip along the top and a dark foot along
//   the bottom is what makes the eye read a surface catching light instead of a
//   coloured region. Here it runs round the inside of the bezel in the action's
//   own colour, so Cast is teal-lit and Reel In is gold-lit without either
//   becoming a puddle of flat colour.
//
// ── AND IT IS PRESSED, NOT SQUASHED ─────────────────────────────────────────
//
// The old press dropped the button 5px and shrank the shadow, which is the
// plastic-slab language again. This one dims the glass and brightens the
// channel: the same thing a lit instrument does when you push it. The travel is
// a single pixel, because a control that moves under the thumb on a boat that
// is already moving is a control you mis-hit.

import { motion } from 'framer-motion'
import { DIAL_MATERIAL } from './FishingDial'

export default function DialButton({
  size, accent, glow, label, onPress, disabled = false, motionKey,
}: {
  /** Matched to the helm on the chart, so a swap of two controls is one control
   *  changing role and the thumb never moves. */
  size: number
  /** The action's own colour. Lights the channel, the label and the halo. */
  accent: string
  /** The same colour at rest strength, for the outward glow. Kept separate so a
   *  disabled control can keep its shape and lose its light. */
  glow: string
  label: React.ReactNode
  onPress: () => void
  disabled?: boolean
  motionKey: string
}) {
  const lit = !disabled
  // ── THE BEZEL IS DRAWN OUTSIDE THE BOX ────────────────────────────────
  //
  // Those rings are `box-shadow` spreads, so they sit OUTSIDE the element and
  // add to what the eye measures. Left alone, a button asked for at HELM_D
  // would paint about twelve pixels wider than that, and HELM_D is the one
  // number that must not move: the chart's helm is the same diameter in the
  // same place, and matching it is what turns a swap of two controls into one
  // control changing role. So the face shrinks by exactly what the bezel adds
  // and the OUTER edge lands on `size`.
  const bezel = Math.max(3, Math.round(size * 0.045))
  const ring = bezel + 1
  const face = size - ring * 2
  return (
    <motion.button key={motionKey}
      onPointerDown={e => { e.preventDefault(); onPress() }}
      className="font-karla font-700 uppercase flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={lit ? { scale: 0.985, y: 1 } : undefined}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      style={{
        position: 'relative',
        width: face, height: face, borderRadius: '50%',
        border: 'none', padding: 0, cursor: lit ? 'pointer' : 'default',
        touchAction: 'manipulation',
        // THE FACE. The dial's own glass, and nothing else — every ring below
        // is a shadow, so the button is one element with no stacking to get
        // wrong and no translucency for the sea to read through.
        background: DIAL_MATERIAL.glass,
        boxShadow: [
          // The channel: the action's colour lit along the top and shadowed at
          // the foot, exactly the way the zone bands are.
          `inset 0 1px 0 ${accent}`,
          `inset 0 2px 10px -4px ${accent}`,
          `inset 0 -2px 12px -6px rgba(0,0,0,0.9)`,
          // The dome's own light, over the top of it.
          `inset 0 ${Math.round(face * 0.1)}px ${Math.round(face * 0.18)}px -${Math.round(face * 0.1)}px ${DIAL_MATERIAL.crown}`,
          `inset 0 -${Math.round(face * 0.11)}px ${Math.round(face * 0.15)}px -${Math.round(face * 0.09)}px ${DIAL_MATERIAL.foot}`,
          // The bezel and its hairline, at the same proportions as the gauge.
          `0 0 0 ${bezel}px ${DIAL_MATERIAL.bezel}`,
          `0 0 0 ${ring}px ${DIAL_MATERIAL.hairline}`,
          // What it throws. Soft and downward, because it is an object above
          // water rather than a tile stuck on a wall.
          `0 10px 24px rgba(0,0,0,0.55)`,
          lit ? `0 0 26px ${glow}` : '0 0 0 rgba(0,0,0,0)',
        ].join(', '),
        // ── THE SAME TYPE AS EVERYTHING ELSE ON THIS SCREEN ───────────
        //
        // Karla 700 uppercase at 0.84rem on 0.18em, which is the "Waiting on a
        // bite" line verbatim. The action and the status now read as the same
        // voice, which they did not when this was Cinzel: a second display face
        // in the middle of a screen that already has one is not emphasis, it is
        // a different game talking.
        //
        // Two wrong sizes preceded it and both are worth writing down. It went
        // out at 0.077 of the diameter — 8.6px, SMALLER than the 13.8px it
        // replaced, on the one control you have to find without looking while a
        // needle spins. Correcting that overshot to 18px, which is bigger than
        // anything else on the screen. This is the size the rest of the screen
        // already agreed on.
        //
        // A LITERAL, NOT A RATIO. The point is that it matches a specific line
        // of text elsewhere, and a ratio of the button would drift off it the
        // moment either changed.
        fontSize: '0.84rem',
        letterSpacing: '0.18em',
        lineHeight: 1.2,
        // WHITE, GLOWED IN THE ACTION'S COLOUR. The one thing kept from the
        // oversized pass: accent-coloured text on a dark glass face is dim, and
        // white on a coloured glow is legible without the label having to be
        // large. The colour still says which action this is.
        color: lit ? '#f4f9ff' : `${accent}77`,
        textShadow: lit
          ? `0 1px 3px rgba(0,0,0,0.95), 0 0 12px ${accent}, 0 0 22px ${glow}`
          : 'none',
      }}>
      {/* THE GLASS ITSELF. A crescent of reflection across the upper third,
          which is the one thing that says "there is something transparent in
          front of this" — the dial has it and a plain filled circle does not.
          Pointer-events off so it can never eat the press. */}
      <span aria-hidden style={{
        position: 'absolute', inset: 1, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(ellipse 76% 46% at 50% 6%, rgba(255,255,255,0.13), transparent 70%)',
      }} />
      <span style={{ position: 'relative' }}>{label}</span>
    </motion.button>
  )
}
