// ── THE ROOM TALKING ────────────────────────────────────────────────────────
//
// Three snatches of conversation at the top of the tavern. See lib/tavernGossip
// for why the game's hints come out of other people's mouths rather than a tips
// panel, and for the six rules the lines follow.
//
// ── NO TIMER, AND NOT RANDOM PER VISIT ──────────────────────────────────────
//
// The first version cycled a line every seven seconds. Three slots take turns,
// so that was not "a line lasts seven seconds", it was "something moves, every
// seven seconds, forever" — a flicker in the corner of your eye while you read
// the page underneath, and eighty one lines burned through in half an hour.
//
// Random-per-visit is the same problem in a different hat: open the tavern four
// times in a session and you have heard a dozen, and the twelfth lands with no
// more weight than the first.
//
// So the room is a function of WHO you are and WHAT HOUR IT IS, worked out on
// the server. Come back twice in ten minutes and the same three people are
// still talking about the same things, which is what a room does. Come back
// after lunch and the conversation has moved on. Nothing animates, nothing
// polls, and there is no client JavaScript here beyond the avatar itself.
//
// ── THE FACES ───────────────────────────────────────────────────────────────
//
// The same CharacterAvatar the crew list, the Salt Road roster and the sea
// traders use, so a patron at the next table is drawn exactly like every other
// person in this game. The first cut put FISH in these discs, which was a
// category error: a fish is a thing you catch, and the tavern is full of the
// people who catch them.
//
// A line always wears the same two faces (they hash off the LINE, not off the
// captain or the hour), so something you heard last week is recognisably the
// same person saying it again. Lines alternate speakers, so an exchange is
// A, B, A, and the second voice is indented, smaller, dimmer and TURNED to
// answer, because at this size a different hat alone does not separate two
// people on a phone.

import CharacterAvatar from '@/components/CharacterAvatar'
import { overheardFor, PATRON_BG, PATRON_RING } from '@/lib/tavernGossip'

export default function Gossip({ seed }: {
  /** Who is listening. The deck is shuffled per captain so two people in the
   *  tavern at the same moment are not overhearing an identical script. */
  seed: string
}) {
  const heard = overheardFor(seed)

  return (
    <section style={{
      borderRadius: 16, overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(32,25,14,0.6) 0%, rgba(12,10,6,0.8) 100%), #0b0906',
      border: '1px solid rgba(200,170,100,0.22)',
    }}>
      <div style={{
        padding: '0.6rem 1rem 0.55rem',
        borderBottom: '1px solid rgba(200,170,100,0.14)',
        background: 'rgba(200,170,100,0.05)',
      }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.56rem', letterSpacing: '0.18em', color: 'rgba(200,170,100,0.85)', margin: 0,
        }}>Overheard</p>
      </div>

      <div>
        {heard.map((o, i) => (
          <div key={o.say[0]} style={{
            padding: '0.8rem 1rem',
            // A hairline between conversations, not around them. Three boxed
            // cards inside a box is one border too many for three sentences.
            borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
          }}>
            {o.say.map((line, k) => {
              const second = k % 2 === 1
              const who = o.faces[second ? 1 : 0]
              return (
                <div key={k} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9,
                  marginTop: k === 0 ? 0 : 8,
                  paddingLeft: second ? 18 : 0,
                  opacity: second ? 0.82 : 1,
                }}>
                  <span aria-hidden style={{
                    flexShrink: 0,
                    // TURNED TO ANSWER. The sprite faces one way by default, so
                    // flipping the replier puts the two of them face to face
                    // down the column. Same trick the Salt Road faces use.
                    transform: second ? 'scaleX(-1)' : 'none',
                    display: 'block',
                  }}>
                    <CharacterAvatar
                      characterColor={who.characterColor}
                      equippedHat={who.hat}
                      bgColor={PATRON_BG}
                      ringColor={PATRON_RING}
                      size={second ? 30 : 36}
                    />
                  </span>
                  <p className="font-karla" style={{
                    fontSize: '0.82rem', lineHeight: 1.45, margin: 0, paddingTop: second ? 4 : 7,
                    color: second ? 'rgba(200,182,150,0.7)' : 'rgba(230,216,188,0.94)',
                    fontStyle: 'italic',
                  }}>
                    &ldquo;{line}&rdquo;
                  </p>
                </div>
              )
            })}
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.5rem', letterSpacing: '0.16em',
              color: 'rgba(200,170,100,0.4)', margin: '7px 0 0', paddingLeft: 45,
            }}>{o.from}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
