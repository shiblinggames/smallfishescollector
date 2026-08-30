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
// polls, and there is no client JavaScript here at all.
//
// ── THE FACES ───────────────────────────────────────────────────────────────
//
// A portrait beside each voice, the way the crew list puts a face to a name.
// They are fish, out of a fixed cast of two dozen (see make-gossip-faces.mjs),
// and a given line always wears the same two: the same sentence said by the
// same fish is a person you recognise, a new fish every time is a slot machine.
//
// Lines alternate speakers, so an exchange is A, B, A. The second voice is
// indented and dimmer as well as differently faced, because on a phone the
// portraits are 34px and shape alone is not enough to tell two people apart.

import { overheardFor } from '@/lib/tavernGossip'

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

      <div style={{ padding: '0.2rem 0 0.35rem' }}>
        {heard.map((o, i) => (
          <div key={o.say[0]} style={{
            padding: '0.75rem 1rem',
            // A hairline between conversations, not around them. Three boxed
            // cards inside a box is one border too many for three sentences.
            borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
          }}>
            {o.say.map((line, k) => {
              const second = k % 2 === 1
              return (
                <div key={k} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9,
                  marginTop: k === 0 ? 0 : 7,
                  paddingLeft: second ? 16 : 0,
                }}>
                  <span aria-hidden style={{
                    width: second ? 28 : 34, height: second ? 28 : 34, flexShrink: 0,
                    borderRadius: '50%', overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    // A LIT DISC, not a plain hole. The plates are painted on
                    // transparency and a fish floating on the panel's own
                    // gradient reads as a sticker; a disc behind it makes it a
                    // portrait.
                    background: 'radial-gradient(circle at 50% 35%, rgba(96,78,48,0.55), rgba(18,14,8,0.9))',
                    border: '1px solid rgba(200,170,100,0.28)',
                    opacity: second ? 0.78 : 1,
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/fish/face/${o.faces[second ? 1 : 0]}.png`} alt=""
                      width={96} height={96} loading="lazy" decoding="async"
                      style={{
                        width: '82%', height: '82%', objectFit: 'contain', display: 'block',
                        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
                      }} />
                  </span>
                  <p className="font-karla" style={{
                    fontSize: '0.82rem', lineHeight: 1.45, margin: 0, paddingTop: second ? 3 : 6,
                    color: second ? 'rgba(200,182,150,0.66)' : 'rgba(230,216,188,0.94)',
                    fontStyle: 'italic',
                  }}>
                    &ldquo;{line}&rdquo;
                  </p>
                </div>
              )
            })}
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.5rem', letterSpacing: '0.16em',
              color: 'rgba(200,170,100,0.4)', margin: '6px 0 0', paddingLeft: 43,
            }}>{o.from}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
