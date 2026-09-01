'use client'

// THE PREVIEW BOX — the boat, the water under it, and the empty shelf beneath.
//
// Its own component because THREE screens draw it now: the shipyard, the callout
// bench that tunes the labels, and the loadout sheet out at sea. The callout
// positions are percentages OF THIS BOX, so if the bench's box were a different
// shape from the shipyard's — one pixel of padding, a different shelf — every
// number tuned on one would be wrong on the other, and wrong in a way that looks
// like a bad eye rather than a bad rectangle.
//
// It lived under app/(app)/shipyard until the sea needed it. Moved to components/
// rather than reached for across route groups, because a shared thing filed under
// one of its consumers is a shared thing somebody will copy instead of import.

import FisherPose from '@/components/FisherPose'

export type PoseKit = {
  characterColor: string
  equippedHat: string | null
  equippedBoat: string | null
  equippedPet: string | null
  equippedPetBow?: string | null
  rodTier: number
  reelTier: number
  hookTier: number
}

export default function PreviewStage({ kit, children, style }: {
  kit: PoseKit
  /** Overlays drawn against the whole box: callouts on the page, draggable
   *  handles on the bench. */
  children?: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      position: 'relative', borderRadius: 22,
      // MUST clip. FisherPose's overlays are positioned in percentages of this
      // box and genuinely run past it — the hook alone is 204.5% wide at left
      // -10.5% — so without this the widest child sets the page's scroll width
      // and the whole thing slides sideways.
      overflow: 'hidden',
      // A SOLID base under the tint. This sits on the page ground and a
      // translucent panel over anything painted reads as a smear.
      background: 'linear-gradient(180deg, #16303f 0%, #0d1e2b 55%, #0a1622 100%)',
      border: '1px solid rgba(150,196,222,0.22)',
      boxShadow: 'inset 0 -40px 60px -40px rgba(0,8,18,0.9)',
      ...style,
    }}>
      {/* A low band of water under the hull, so the boat is ON something. */}
      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%',
        background: 'linear-gradient(180deg, rgba(24,66,88,0) 0%, rgba(20,58,80,0.5) 40%, rgba(10,30,44,0.9) 100%)',
      }} />

      <div style={{ position: 'relative', padding: '0.6rem 0.5rem 0.5rem' }}>
        {/* The sprite is 900x800 with the figure in the bottom 55.5%, so the
            top third of the box is empty sky. Pulled in by measurement, the
            same way the gear grid's small preview does it.

            NOTHING IS LAYERED INSIDE THIS WRAPPER. The labelled zones that
            briefly lived here sat between the art and the eye, and the art
            stopped being visible. Overlays are siblings of the whole stage, so
            whatever they do they cannot come between you and the boat. */}
        <div style={{ marginTop: '-30%', marginBottom: '-2%' }}>
          <FisherPose
            characterColor={kit.characterColor}
            equippedHat={kit.equippedHat} equippedBoat={kit.equippedBoat}
            equippedPet={kit.equippedPet} equippedPetBow={kit.equippedPetBow}
            rodTier={kit.rodTier} reelTier={kit.reelTier} hookTier={kit.hookTier}
          />
        </div>

        {/* THE SHELF. Empty room under the hull for the names to stand in.
            Without it the labels would sit ON the boat, which is what the old
            side columns were avoiding by squashing themselves into the margins.
            Reserved height, not content: the chips are placed against the whole
            box, so they add nothing to it, and this is what keeps them off the
            art.

            SIZED AS A SHARE OF THE WIDTH — percentage padding resolves against
            width — so the box is the same RECTANGLE on a phone and on a
            monitor. A shelf in pixels would make it taller in proportion on a
            narrow screen and slide every label off the thing it points at. */}
        <div aria-hidden style={{ height: 0, paddingBottom: '20%' }} />
      </div>

      {children}
    </div>
  )
}
