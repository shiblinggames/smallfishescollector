'use client'

// ── THE SALT ROAD, AS CARDS ─────────────────────────────────────────────────
//
// One person, one card. Lifted out of FolkPanel because the Tavern shows the
// same nine — the tavern is the social room and your standing with the people
// on this sea is the most social thing in the game — and a second drawing of a
// card whose states were argued over this hard would drift within a week.
//
// The two surfaces differ in exactly one way and it is deliberate: on the chart
// a card OPENS somebody, and in the tavern it does not. See the note on
// `onOpen`.

import CharacterAvatar from '@/components/CharacterAvatar'

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'

export type Portrait = {
  characterColor: string; hat: string | null
  bg: string; ring: string; mirrored?: boolean
}

/**
 * SOMEBODY ON THE ROAD, AND WHETHER YOU GOT THERE.
 *
 * ── THE MAXED CARD IS A DIFFERENT CARD ──────────────────────────────────────
 *
 * At the top tier the progress bar is the problem: a full bar says "complete",
 * which is a task word, and this is the only system in the game whose entire
 * reward is that somebody talks to you differently. A finished errand and a
 * friendship should not look the same.
 *
 * So the bar GOES at max and a still gold rim takes its place.
 *
 * ── AND IT DOES NOT GLOW, WHICH IT USED TO ──────────────────────────────────
 *
 * The first version breathed a slow halo in the person's own colour, on the
 * argument that gold is the game's currency and would say "prize" where the
 * accent says "your standing with THEM". The argument was about the wrong
 * thing. Whatever a colour means, in this app a card that glows and pulses is a
 * card with something waiting behind it: that is what an unclaimed reward does,
 * what a new discovery does, what the dot in the corner of this very card does.
 * Nine of them breathing in a grid read as nine unread notifications.
 *
 * Nothing about a finished friendship is waiting. It is the one state on this
 * panel that wants no attention at all, and a rim that simply sits there is the
 * only thing that says so. Gold, because the panel already uses a gold border
 * for exactly this on the rival's card the moment his job is done — so the
 * language was there and this was the outlier.
 */
export function PersonCard({ face, accent, name, sub, pct, dot, maxed, onOpen }: {
  face: Portrait; accent: string; name: string; sub: string
  /**
   * OMITTED WHERE THE CARD IS ONLY A READING. The tavern shows your standing
   * and stops there: talking to these nine, and giving them fish, happens on
   * the water, because the moment rapport can be worked from a menu, sailing
   * out to find Meg stops being the point of Meg.
   *
   * A plain div rather than a disabled button, so a read-only card carries no
   * pointer, no focus ring and no promise it will do something.
   */
  pct: number; dot?: boolean; maxed?: boolean; onOpen?: () => void
}) {
  const Tag = onOpen ? 'button' : 'div'
  return (
    <Tag onClick={onOpen}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '0.7rem 0.5rem 0.6rem', borderRadius: 14, cursor: 'pointer',
        // The wash stays THEIRS even at max. Gold marks the edge; filling the
        // card with it would be a solid gold panel, which this game does not do.
        background: maxed
          ? `linear-gradient(180deg, ${accent}22 0%, ${accent}0c 55%, rgba(255,255,255,0.02) 100%)`
          : `linear-gradient(180deg, ${accent}14 0%, rgba(255,255,255,0.02) 60%)`,
        border: maxed ? `1.5px solid ${GOLD}b0` : `1px solid ${accent}3a`,
        position: 'relative', overflow: 'hidden',
        ...(onOpen ? null : { cursor: 'default' }),
      }}>
      {dot && (
        <span aria-hidden style={{
          position: 'absolute', top: 7, right: 7,
          width: 8, height: 8, borderRadius: 999,
          background: accent, boxShadow: `0 0 8px ${accent}`,
        }} />
      )}
      <div style={{
        transform: face.mirrored ? 'scaleX(-1)' : 'none',
        // The same soft halo every card's portrait gets. It was boosted at max,
        // which put a second glowing thing on the card that is meant to be the
        // quiet one.
        borderRadius: '50%', boxShadow: `0 0 16px ${accent}30`,
      }}>
        <CharacterAvatar
          characterColor={face.characterColor}
          equippedHat={face.hat}
          bgColor={face.bg}
          ringColor={face.ring}
          size={62}
        />
      </div>
      <p className="font-cinzel font-700" style={{
        fontSize: '0.82rem', color: '#e8f2ea', margin: '7px 0 0',
        textAlign: 'center', lineHeight: 1.15,
      }}>{name}</p>
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.5rem', letterSpacing: '0.14em', color: accent,
        margin: '3px 0 0', textAlign: 'center',
      }}>{sub}</p>
      {/* THE BAR IS FOR THE ROAD, not the arrival. At the top there is nothing
          left to fill, and a bar sitting at 100% is a completed task rather
          than somebody you know. */}
      {maxed ? (
        <div aria-hidden style={{
          width: '62%', height: 2, borderRadius: 999, marginTop: 7,
          background: `${GOLD}cc`,
        }} />
      ) : (
        <div style={{
          width: '100%', height: 3, borderRadius: 999, marginTop: 6,
          background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
          <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 999 }} />
        </div>
      )}
    </Tag>
  )
}

/**
 * SOMEBODY OUT THERE YOU HAVE NOT MET.
 *
 * The roster was met-only for a while, on the reasoning that a list of
 * strangers is homework. That was true when it was a list; as CARDS it reads
 * the opposite way, because an empty slot in a set is an invitation rather than
 * a chore. The difference is entirely in the shape.
 *
 * It gives away the WATER and nothing else. That is the honest middle: it tells
 * you somebody is out there and roughly where to start looking, which is a
 * reason to sail, without handing over the name or the face, which are the
 * things worth finding.
 */
export function UnknownCard({ water }: { water: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '0.7rem 0.5rem 0.6rem', borderRadius: 14,
      background: 'rgba(255,255,255,0.018)',
      border: `1px dashed ${SEA},0.18)`,
    }}>
      <div style={{
        width: 62, height: 62, borderRadius: '50%',
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${SEA},0.14)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="font-cinzel font-700" style={{
          fontSize: '1.5rem', color: `${SEA},0.3)`, lineHeight: 1,
        }}>?</span>
      </div>
      <p className="font-cinzel font-700" style={{
        fontSize: '0.82rem', color: `${SEA},0.32)`, margin: '7px 0 0',
        textAlign: 'center', lineHeight: 1.15,
      }}>???</p>
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.5rem', letterSpacing: '0.14em', color: `${SEA},0.28)`,
        margin: '3px 0 0', textAlign: 'center',
      }}>{water}</p>
      <div style={{ width: '100%', height: 3, marginTop: 6 }} />
    </div>
  )
}
