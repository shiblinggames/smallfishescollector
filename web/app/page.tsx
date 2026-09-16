import type { Metadata } from 'next'
import Link from 'next/link'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TrailerFrame, { type Trailer } from './TrailerFrame'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  description:
    'A fishing game that got a bit out of hand. Sail an open sea, catch 152 species, sign a crew, and take a ship into nine boss fights. Free, in your browser.',
}

/**
 * ── THE LANDING PAGE ────────────────────────────────────────────────────────
 *
 * ── WHAT WAS WRONG WITH THE LAST ONE ────────────────────────────────────────
 *
 * It was not badly made. It was a good page for a game that no longer exists.
 *
 * It was a 620px COLUMN with two PHONE screenshots stood up in it, and both
 * shots were taken in August of a screen that has since been deleted: they show
 * the five-tab bottom bar, a "back to Shallows" zone menu, and the old fishing
 * hub at /fishing, a route with no page.tsx any more. A landing page whose
 * pictures are of a build you cannot play teaches a visitor exactly one thing,
 * which is that the pictures lie.
 *
 * The words had drifted the same way. "Eight raids" is nine. "146 species" is
 * 152. And the shape of the argument was wrong at the root: it sold a fishing
 * minigame with some extras, and the game is an open sea you sail, which the
 * page never mentioned once.
 *
 * ── AND IT WAS A PHONE PAGE FOR A DESKTOP GAME ──────────────────────────────
 *
 * The most expensive mistake on it. A 620px column with portrait screenshots is
 * a phone game's landing page, and this is a chart 45,000px across that is at
 * its best on a monitor. A wide world cropped into a phone column is the one
 * crop that makes it look small, and every visitor on a desktop was being shown
 * the game at a third of the size they would actually play it.
 *
 * So the page is wide now, the DESKTOP shot is the big one in every band, and
 * the phone rides its corner. That composition is also the honest claim: it is
 * the same game in both places, and one of them is bigger.
 *
 * ── THE ART IS DECLARED BY DROPPING FILES IN ────────────────────────────────
 *
 * See SHOTS below. The page looks for specific filenames under /public/lp and
 * lays itself out around whatever is actually there: a band with a desktop and
 * a phone shot goes two-up, a band with one goes one-up, and a band with none
 * is its words, set properly, taking the full width. Nothing to edit here when
 * the captures land. See docs/systems/landing-page.md for the shot list.
 *
 * That is deliberate and it is the same rule the sign-in door follows: NOTHING
 * GOES IN A SLOT UNTIL SOMETHING TRUE GOES IN IT. A stale screenshot is worse
 * than no screenshot, which is the whole reason this rewrite happened.
 *
 * ── AND IT IS IN HIS VOICE, NOT A TRAILER'S ─────────────────────────────────
 *
 * The first draft of this rewrite was written well and written by nobody. "Four
 * chapters that open on coastal pirates and close somewhere considerably
 * worse." Nice sentence. Not a sentence he would ever say, and this is a game
 * made by one person whose whole advantage over a studio is that there is a
 * person here.
 *
 * So the page is FIRST PERSON and it talks the way he talks to his testers on
 * the Jira board: contractions, short uneven sentences, spaced hyphens, a
 * numeral instead of a spelled-out number, the occasional aside. He owns things
 * in the first person ("because of how I initially set up the sprites") and he
 * volunteers what is still rough rather than hiding it, which is worth more on a
 * landing page than any amount of polish. See the memory on his Jira tone.
 *
 * What did NOT come across from that voice: the hedging ("I believe this is
 * fixed") belongs on a bug ticket and nowhere near a pitch, and the doubled
 * exclamation marks read as manic at this size. Warmth, not volume.
 *
 * Stays a SERVER component: the logged-in redirect runs before anything
 * renders, so the arrival is a CSS keyframe rather than framer, and the file
 * checks below run once per instance rather than once per visitor.
 */

/* ── THE ASSETS ───────────────────────────────────────────────────────────
   Checked once at module load, not per request. Everything lives under
   /public/lp so the marketing captures are one folder that can be emptied and
   refilled without hunting through /public for which png was a screenshot. */
const PUB = join(process.cwd(), 'public', 'lp')
const has = (file: string) => existsSync(join(PUB, file))

type Shot = { src: string; alt: string }
const shot = (file: string, alt: string): Shot | null =>
  has(file) ? { src: `/lp/${file}`, alt } : null

/**
 * A YouTube id, or null to use a file at /public/lp/trailer.mp4.
 *
 * Hosting it ourselves is the better watch (no third-party chrome, no suggested
 * videos pasted over the last frame) and costs bandwidth. YouTube is free and
 * brings its own furniture. Either way the player is a still until somebody
 * presses it, so neither one costs a visitor anything who does not want it.
 */
const YOUTUBE_TRAILER_ID: string | null = null

const TRAILER: Trailer | null = (() => {
  const poster = has('trailer-poster.jpg') ? '/lp/trailer-poster.jpg' : null
  if (YOUTUBE_TRAILER_ID) {
    return {
      kind: 'youtube',
      id: YOUTUBE_TRAILER_ID,
      // YouTube already made a still of it, so a missing poster is not a reason
      // to have no trailer.
      poster: poster ?? `https://i.ytimg.com/vi/${YOUTUBE_TRAILER_ID}/maxresdefault.jpg`,
    }
  }
  if (poster && has('trailer.mp4')) return { kind: 'file', src: '/lp/trailer.mp4', poster }
  return null
})()

const SHOTS = {
  sea: {
    desktop: shot('sea-desktop.jpg', 'The open sea chart, with the boat under sail and the fog rolled back'),
    phone: shot('sea-phone.jpg', 'The same sea on a phone'),
  },
  cast: {
    desktop: shot('cast-desktop.jpg', 'The fishing dial mid cast, the needle coming round to the perfect band'),
    phone: shot('cast-phone.jpg', 'A perfect catch landing on the fishing dial'),
  },
  fight: {
    desktop: shot('fight-desktop.jpg', 'A turn of ship combat, the aim bar mid swing'),
    phone: shot('fight-phone.jpg', 'Ship combat on a phone'),
  },
} as const

/* ── THE FRAMES ─────────────────────────────────────────────────────────── */

/** A fixed box for every capture, so the page never reflows when one loads and
 *  a crooked capture is cropped rather than allowed to change the layout. */
const DESK_RATIO = '16 / 10'
const PHONE_RATIO = '9 / 19'

function DesktopShot({ shot: s }: { shot: Shot }) {
  return (
    <div className="lp-desk">
      <div className="lp-desk-bar" aria-hidden>
        <span className="lp-desk-dot" style={{ background: 'rgba(255,255,255,0.20)' }} />
        <span className="lp-desk-dot" style={{ background: 'rgba(255,255,255,0.14)' }} />
        <span className="lp-desk-dot" style={{ background: 'rgba(255,255,255,0.10)' }} />
        <span className="lp-desk-url font-karla">seasthebooty.com</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.src} alt={s.alt} style={{ aspectRatio: DESK_RATIO, objectFit: 'cover' }} />
    </div>
  )
}

function PhoneShot({ shot: s, style }: { shot: Shot; style?: React.CSSProperties }) {
  return (
    <div className="lp-phone" style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.src} alt={s.alt} style={{ aspectRatio: PHONE_RATIO, objectFit: 'cover' }} />
    </div>
  )
}

function BandArt({ desktop, phone }: { desktop: Shot | null; phone: Shot | null }) {
  if (desktop) {
    return (
      <div className={phone ? 'lp-duo' : undefined}>
        <DesktopShot shot={desktop} />
        {phone && <PhoneShot shot={phone} />}
      </div>
    )
  }
  if (phone) return <PhoneShot shot={phone} style={{ width: 'min(240px, 62%)', margin: '0 auto' }} />
  return null
}

function Band({
  eyebrow, title, children, desktop, phone, flip, delay,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
  desktop: Shot | null
  phone: Shot | null
  flip?: boolean
  delay: string
}) {
  const art = desktop || phone
  const words = (
    <div>
      <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.2em', color: '#f0c040', margin: 0 }}>
        {eyebrow}
      </p>
      <h2 className="font-cinzel font-800" style={{
        fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', lineHeight: 1.14, color: '#f4ecd8', margin: '0.55rem 0 0',
      }}>
        {title}
      </h2>
      <div className="font-karla font-300" style={{ fontSize: '1rem', lineHeight: 1.78, color: '#b9c8d6', marginTop: '0.85rem' }}>
        {children}
      </div>
    </div>
  )

  // No capture for this band yet, so it is a column of words at a width a
  // person can actually read rather than half of an empty grid.
  if (!art) {
    return (
      <section className="landing-rise" style={{ animationDelay: delay, maxWidth: 660, margin: '0 auto' }}>
        {words}
      </section>
    )
  }

  return (
    <section className={`lp-band landing-rise${flip ? ' lp-flip' : ''}`} style={{ animationDelay: delay }}>
      {words}
      <div className="lp-band-art" style={{ paddingBottom: desktop && phone ? '3.4rem' : 0 }}>
        <BandArt desktop={desktop} phone={phone} />
      </div>
    </section>
  )
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // THE CHART IS THE GAME NOW. This sent everybody to the tavern, which was
  // right when the tavern was the hub; the sea is where you fish, and fishing
  // is what this is. /sea does its own gate, so there is exactly one place that
  // decides who may sail.
  if (user) redirect('/sea')

  return (
    <main className="min-h-screen relative" style={{ overflowX: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/loginbackground.webp" alt="" aria-hidden style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', objectPosition: 'center top', zIndex: 0, pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: `
          radial-gradient(85% 50% at 68% 4%, rgba(240,200,120,0.16) 0%, rgba(240,200,120,0) 62%),
          linear-gradient(to bottom, rgba(2,8,18,0.46) 0%, rgba(2,8,18,0.80) 46%, rgba(2,6,14,0.96) 78%, #02060e 100%)
        `,
      }} />

      <div className="relative z-10 mx-auto px-6" style={{ maxWidth: 1180, paddingTop: 'clamp(3.5rem, 9vh, 6rem)', paddingBottom: '4rem' }}>

        {/* ── THE MASTHEAD. The pun is the identity, so it leads. ── */}
        <div className="text-center landing-rise" style={{ animationDelay: '0.05s' }}>
          <p className="font-karla font-600 uppercase" style={{ fontSize: '0.68rem', letterSpacing: '0.22em', color: '#7ab8cc', margin: 0 }}>
            Shibling Games
          </p>

          <h1 className="font-cinzel font-900" style={{
            fontSize: 'clamp(3rem, 9vw, 5.4rem)', lineHeight: 0.9, letterSpacing: '-0.01em',
            color: '#f0ede8', margin: '1.1rem 0 0.5rem',
            textShadow: '0 2px 40px rgba(14,80,120,0.8), 0 0 80px rgba(14,116,144,0.4)',
          }}>
            Small Fishes
          </h1>
          <p className="font-cinzel italic" style={{ fontSize: '1.3rem', color: '#f0c040', textShadow: '0 0 24px rgba(240,192,64,0.5)', margin: 0 }}>
            Seas the Booty.
          </p>

          <p className="font-karla font-300" style={{
            fontSize: '1.08rem', lineHeight: 1.7, color: '#c3d6e2',
            margin: '1.5rem auto 0', maxWidth: 560,
          }}>
            I made a fishing game and it got a bit out of hand. There’s a whole sea to sail now, a
            crew to sign, and nine boss fights waiting at the end of it. Runs in a browser tab.
          </p>

          {/* THE BUTTON, ABOVE THE FOLD, and pointed at the right door. It went
              to /login, which is the page headed "welcome back, cap'n": the one
              sentence you do not want to show somebody who has never been here.
              /register is the same magic-link form with the words a first
              visitor should read. */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.75rem',
            justifyContent: 'center', margin: '2.1rem 0 0',
          }}>
            <Link href="/register" className="btn-gold" style={{
              minWidth: 210, padding: '1rem 2rem', fontSize: '1rem', letterSpacing: '0.1em',
            }}>
              Play free
            </Link>
            {TRAILER && (
              <a href="#trailer" className="btn-ghost" style={{
                minWidth: 210, padding: '1rem 2rem', fontSize: '1rem', letterSpacing: '0.1em',
              }}>
                Watch the trailer
              </a>
            )}
          </div>
          <p className="font-karla" style={{ fontSize: '0.76rem', color: '#8fa3b5', marginTop: 14 }}>
            No download, no cost, no catch.{' '}
            <Link href="/login" style={{ color: '#9ec3d4', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Already sailing?
            </Link>
          </p>
        </div>

        {/* ── THE TRAILER. The only block allowed to be big, and the only thing
             on the page that can show the game MOVING. Renders at all only when
             there is one; a poster frame for a video that does not exist is the
             exact lie this rewrite was about. ── */}
        {TRAILER && (
          <section id="trailer" className="landing-rise" style={{ animationDelay: '0.16s', marginTop: '3.6rem', scrollMarginTop: '2rem' }}>
            <TrailerFrame trailer={TRAILER} label="Watch the trailer" />
          </section>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(3.6rem, 8vw, 6rem)', marginTop: 'clamp(3.6rem, 8vw, 6rem)' }}>

          {/* THE SEA FIRST. It is the thing the old page never mentioned and it
              is what the game now is. */}
          <Band
            eyebrow="The sea"
            title="There’s no zone menu. Just the sea."
            desktop={SHOTS.sea.desktop}
            phone={SHOTS.sea.phone}
            delay="0.24s"
          >
            <p style={{ margin: 0 }}>
              The whole chart is one piece of water and it starts out dark. You clear the fog by
              sailing into it. And you cast wherever you happen to be, so how deep you’re fishing is
              really just how far out you were willing to go.
            </p>
            <p style={{ margin: '0.9rem 0 0' }}>
              There are 27 isles to find out there, plus a fair amount of buried stuff that isn’t
              drawn on the map at all. Night falls every 48 minutes. And 9 regulars work that water
              who’ll start holding things back for you once you’ve brought them enough of what
              they’re after.
            </p>
          </Band>

          {/* THEN THE CAST. The thing you do a thousand times. */}
          <Band
            eyebrow="The cast"
            title="A needle spins and you get about a second"
            desktop={SHOTS.cast.desktop}
            phone={SHOTS.cast.phone}
            flip
            delay="0.3s"
          >
            <p style={{ margin: 0 }}>
              Hit the band clean and you keep the fish and the streak. Miss it and the streak’s gone.
              The window gets smaller the deeper you fish, which is sort of the whole problem.
            </p>
            <p style={{ margin: '0.9rem 0 0' }}>
              152 species across 5 zones. Six of them are giants down in the Ancient Deep that you
              can’t sell at all. You just keep those.
            </p>
          </Band>

          {/* AND WHERE THE FISHING GOES. Raids and crew are one arc, so they are
              one band: naming every mode separately is how a page turns back
              into a features list. */}
          <Band
            eyebrow="The fight"
            title="And then there’s the part with cannons"
            desktop={SHOTS.fight.desktop}
            phone={SHOTS.fight.phone}
            delay="0.36s"
          >
            <p style={{ margin: 0 }}>
              Turn-based ship fights, and you aim every shot yourself on a moving bar. Four chapters.
              It opens on coastal pirates and ends somewhere a lot worse, and then there’s a finale
              I’m pretty proud of that you fight on the fishing dial.
            </p>
            <p style={{ margin: '0.9rem 0 0' }}>
              Your crew are sea creatures you sign one at a time and level up to 100. If one dies out
              there it’s gone for good. That part isn’t going to change.
            </p>
          </Band>

          {/* THE QUESTION EVERYBODY IS ACTUALLY ASKING. Put plainly, with the
              price in it. A free-to-play game that will not say what it sells is
              a game you assume is selling advantages. */}
          <Band
            eyebrow="The cost"
            title="It’s free, and I’m not going to nickel and dime you"
            desktop={null}
            phone={null}
            delay="0.42s"
          >
            <p style={{ margin: 0 }}>
              Everything in here can be earned by playing. No seasons, nothing expires, and nothing
              you buy makes a fish bite faster or a shot hit harder. I really didn’t want this to be
              one of those games.
            </p>
            <p style={{ margin: '0.9rem 0 0' }}>
              Captain is $9.99 one time, not a subscription, and it opens the deep end - the Ancient
              Deep, the last chapter, the harder gauntlets. The first three chapters are a full game
              on their own and they cost nothing.
            </p>
          </Band>
        </div>

        {/* ── The second ask, for whoever read to the bottom. Same door,
             different words: repeating "Play free" verbatim reads like a
             template rather than an invitation. ── */}
        <div className="landing-rise" style={{ animationDelay: '0.5s', marginTop: 'clamp(3.6rem, 8vw, 5.5rem)', textAlign: 'center' }}>
          <Link href="/register" className="btn-gold" style={{
            display: 'block', maxWidth: 300, margin: '0 auto',
            padding: '1rem 2rem', fontSize: '1rem', letterSpacing: '0.1em',
          }}>
            Make a captain
          </Link>
          <p className="font-karla" style={{ fontSize: '0.76rem', color: '#7d90a2', marginTop: 14 }}>
            Still in open beta, so expect the odd rough edge. No password to remember either, I just
            email you a link.
          </p>
        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: '3.5rem', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          <div className="flex justify-center gap-5">
            <a href="https://www.instagram.com/shiblinggames/" target="_blank" rel="noopener noreferrer"
               className="font-karla font-600 uppercase tracking-[0.12em] transition-colors"
               style={{ fontSize: '0.8rem', color: '#8ab8cc' }}>
              Instagram
            </a>
            <a href="https://www.tiktok.com/@shiblinggames" target="_blank" rel="noopener noreferrer"
               className="font-karla font-600 uppercase tracking-[0.12em] transition-colors"
               style={{ fontSize: '0.8rem', color: '#8ab8cc' }}>
              TikTok
            </a>
          </div>
          <div className="flex justify-center gap-4">
            <Link href="/privacy" className="font-karla font-400 transition-colors" style={{ fontSize: '0.76rem', color: '#6a8a9a' }}>
              Privacy Policy
            </Link>
            <Link href="/terms" className="font-karla font-400 transition-colors" style={{ fontSize: '0.76rem', color: '#6a8a9a' }}>
              Terms of Service
            </Link>
          </div>
        </div>

      </div>
    </main>
  )
}
