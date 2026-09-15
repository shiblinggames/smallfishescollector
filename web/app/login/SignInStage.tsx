import { Suspense } from 'react'
import LoginForm from './LoginForm'

/**
 * ── THE DOOR ────────────────────────────────────────────────────────────────
 *
 * One stage, two framings: `/login` for somebody coming back and `/register`
 * for somebody who has never been here. The FORM is the same either way and
 * that is not laziness, it is what a magic link is — there is no password to
 * make and no account to fill in, so signing up and signing in are the same
 * press. What changes is the sentence around it, because "welcome back" and
 * "here is what this is" are not the same thing to say.
 *
 * ── WHAT WAS WRONG WITH IT ──────────────────────────────────────────────────
 *
 * The page was a painted night sea under a scrim that took it most of the way
 * to black, a title, and a button. It is the same plate the landing page uses,
 * and the landing page's own note records why that page stopped leaning on it:
 * the painted seascapes are "dark, empty and solemn", and the game is a fish in
 * a rowboat with a parrot on bright turquoise water. The door was selling a
 * grimdark naval sim that does not exist, and it was the first thing anybody
 * saw.
 *
 * ── AND IT IS A DESKTOP PAGE ABOUT AN OPEN SEA ──────────────────────────────
 *
 * The first cut of this put two phone screenshots beside the words. Both were
 * wrong twice over: they are old (the retired fishing hub, the old five-tab
 * bar), and they are PHONES, stood on end, on the page for a game that is a
 * whole chart you sail and is at its best on a monitor.
 *
 * What is beside the words now is the world: the painted chart, big, laid on
 * the water like something on a table. It is the same hand every island and
 * every wreck in the game is drawn by, it says "there is a sea out here and
 * things in it" in one look, and it is a MAP rather than a mock-up of a
 * screen, so it cannot quietly go out of date the way a screenshot does the
 * next time a HUD moves.
 *
 * A live screenshot would still be better in the slot, and the slot is one
 * element: swap the image, keep the frame.
 *
 * ── AND THE SEA MOVES ───────────────────────────────────────────────────────
 *
 * The plate stays, because a night sea under a moon is a real hour in this game
 * and it is a good painting. Three things changed about how it is used:
 *
 *   IT IS ANCHORED TO THE WATER, not the sky. Cover-fitting from the top on a
 *   wide window filled the page with empty air and cropped off the sea, which
 *   is the only part of it anybody wants to look at.
 *
 *   IT IS LIT, not dimmed. The flat blue-black scrim is two: a warm bloom under
 *   the moon where the moon already is, and a teal lift along the waterline. The
 *   palette lands where the game's is instead of at navy, and the card still has
 *   the contrast it needs because the card brings its own ground (house rule:
 *   panels on art get a solid base).
 *
 *   AND IT DRIFTS. One repeating gradient of moonlight glints, translated
 *   forever across the water. A still photograph of a sea is the one thing a
 *   sea should never be, and it costs a single compositor-only animation.
 */
export default function SignInStage({ mode }: { mode: 'in' | 'new' }) {
  const isNew = mode === 'new'
  return (
    <main className="min-h-screen relative" style={{ overflowX: 'hidden' }}>
      {/* ── THE WATER ──────────────────────────────────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/loginbackground.webp" alt="" aria-hidden style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', objectPosition: 'center bottom', zIndex: 0, pointerEvents: 'none',
      }} />
      {/* The moon's own warmth, where the moon is. */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(90% 55% at 68% 6%, rgba(240,200,120,0.20) 0%, rgba(240,200,120,0) 62%)',
      }} />
      {/* And the colour the game is actually painted in, along the water. */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: `
          linear-gradient(to bottom, rgba(4,14,26,0.62) 0%, rgba(4,14,26,0.30) 38%, rgba(6,26,34,0.52) 72%, rgba(4,18,26,0.78) 100%),
          radial-gradient(120% 60% at 50% 100%, rgba(24,120,124,0.30) 0%, rgba(24,120,124,0) 70%)
        `,
      }} />
      {/* The glints, drifting. One layer, one transform, no repaint. */}
      <div aria-hidden className="signin-glints" />

      <div className="relative z-10 mx-auto px-6" style={{
        maxWidth: 1160, paddingTop: 'clamp(2.5rem, 7vh, 5rem)', paddingBottom: '3.5rem',
      }}>
        <div className="signin-grid">
          {/* ── THE WORDS AND THE DOOR ──────────────────────────────── */}
          <div className="signin-col landing-rise" style={{ animationDelay: '0.05s' }}>
            <p className="font-karla font-600 uppercase" style={{
              fontSize: '0.64rem', letterSpacing: '0.22em', color: '#7ab8cc', margin: 0,
            }}>
              {isNew ? 'Open Beta · Free to play' : 'Open Beta'}
            </p>

            <h1 className="font-cinzel font-900" style={{
              fontSize: 'clamp(2.6rem, 7vw, 3.8rem)', lineHeight: 0.92,
              letterSpacing: '-0.01em', color: '#f0ede8', margin: '0.7rem 0 0.4rem',
              textShadow: '0 2px 40px rgba(14,80,120,0.8), 0 0 80px rgba(14,116,144,0.4)',
            }}>
              Small Fishes
            </h1>
            <p className="font-cinzel italic" style={{
              fontSize: '1.15rem', color: '#f0c040', margin: 0,
              textShadow: '0 0 24px rgba(240,192,64,0.45)',
            }}>
              Seas the Booty.
            </p>

            <p className="font-karla" style={{
              fontSize: '0.95rem', lineHeight: 1.65, color: '#c3d6e2',
              margin: '1.1rem 0 0', maxWidth: '34ch',
            }}>
              {isNew
                ? 'An open sea to sail. Fish it with a needle and a shrinking window, sign a crew, and take a ship into eight raids against the outfit running the sea floor.'
                : 'The water is where you left it. Your hold, your crew and your run are all still aboard.'}
            </p>

            {/* THE CARD. Its own solid ground, because it is sitting on a
                painting and a translucent panel over art reads as a smear.
                House rule, and the same base the sea's own panels use. */}
            <div style={{
              marginTop: '1.6rem', maxWidth: 420,
              background: 'linear-gradient(180deg, rgba(12,22,32,0.96) 0%, rgba(7,14,21,0.97) 100%)',
              border: '1px solid rgba(196,169,106,0.30)',
              borderRadius: 18, padding: '1.25rem 1.15rem 1.15rem',
              boxShadow: '0 22px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,240,200,0.06)',
            }}>
              <p className="font-cinzel font-700" style={{
                fontSize: '1rem', color: '#f0ede8', margin: '0 0 2px',
              }}>
                {isNew ? 'Come aboard' : 'Welcome back, cap’n'}
              </p>
              <p className="font-karla" style={{
                fontSize: '0.78rem', color: '#8fa3b5', margin: '0 0 1rem', lineHeight: 1.5,
              }}>
                No password to remember. We send a link, you press it, you are in.
              </p>

              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            </div>

            <p className="font-karla" style={{
              fontSize: '0.72rem', color: '#7d93a6', marginTop: 14, maxWidth: 420, lineHeight: 1.6,
            }}>
              {isNew
                ? 'Nothing to install, nothing to pay. Everything in the game can be earned by playing it.'
                : 'New here? The same link makes you a captain. There is no separate sign up.'}
            </p>
          </div>

          {/* ── AND THE SEA IT IS A DOOR TO ─────────────────────────────
              ONE THING SHOWN PROPERLY, then one plain note under it. The
              landing page settled that argument: an even row of cards is the
              loudest tell there is. */}
          <div className="signin-art landing-rise" style={{ animationDelay: '0.18s' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img width={1440} height={1788} src="/chartingmap.webp"
              alt="A painted chart of the sea: islands, wrecks, a maelstrom and the things living under it"
              className="signin-chart" loading="eager" decoding="async" />
            <p className="font-karla signin-cap" style={{
              fontSize: '0.76rem', color: '#9fb6c6', textAlign: 'center',
              margin: '0.4rem auto 0', maxWidth: 360, lineHeight: 1.6,
            }}>
              One sea, sailed in real time. Fish it, chart it, and take a ship
              north through the gate when you are ready for what is out there.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
