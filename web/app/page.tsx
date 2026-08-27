import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  description:
    'A free browser game. You fish with a needle and a shrinking window, sign a crew, and take a ship into eight raids against the outfit that runs the sea floor.',
}

/**
 * THE LANDING PAGE.
 *
 * Rewritten because the previous version, mine, was the default AI landing page
 * and read like one: eyebrow, badge pill, huge title, one-line pitch, THREE
 * feature cards of identical shape, a FOUR-NUMBER stats strip, and a closing CTA
 * under a portentous one-liner. Everything evenly weighted, every card body
 * exactly two sentences, nothing anywhere a surprise.
 *
 * Two things fix that, and neither is decoration.
 *
 * 1. THE VOICE. The game does not talk like a trailer. Read its own copy:
 *    "Bleed them slow." "Six in all." "Long fights end ugly for them." "The hull
 *    that refuses the deep." It is plain, concrete and unsentimental, and it
 *    never reaches for atmosphere. The old page said "Something down there is
 *    organised" and "The tide does not wait", which is the opposite: abstract,
 *    solemn, and equally true of any game with a boat in it.
 *
 * 2. THE SHAPE. One thing shown properly, then two plain notes. Not three cards
 *    in a row. The even three-up is the loudest tell, and it also lies about the
 *    game: the cast is the thing you do a thousand times, and the campaign and
 *    the Gauntlet are where it goes.
 *
 * The stats strip is gone. "195 badges" was never a reason to play, it was there
 * to make a fourth number.
 *
 * ART. Real screenshots, and every painted plate is gone. The plates were three
 * atmospheric seascapes that differed mainly by palette because they were one
 * prompt run three times, which is the version of "AI-generated" you can see
 * rather than read.
 *
 * The screenshots also corrected something the paintings had actively got
 * wrong. Those plates were dark, empty and solemn; the game is a fish in a
 * rowboat with a parrot on bright turquoise water, and a railgun beam across a
 * black sea. Warm and funny, then tense. No seascape was ever going to say
 * that, and the page was selling a grimdark naval sim that does not exist.
 *
 * Stays a SERVER component: the logged-in redirect runs before anything renders,
 * so the arrival is a CSS keyframe rather than framer.
 */

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // THE CHART IS THE GAME NOW. This sent everybody to the tavern, which was
  // right when the tavern was the hub; the sea is where you fish, and fishing
  // is what this is. /sea does its own gate — if the water is ever shut again
  // it sends you on to the tavern itself, so there is exactly one place that
  // decides who may sail.
  if (user) redirect('/sea')

  return (
    <main className="min-h-screen relative" style={{ overflowX: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/loginbackground.webp" alt="" aria-hidden style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', objectPosition: 'top center', zIndex: 0, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(0,5,20,0.40) 0%, rgba(0,5,20,0.74) 55%, rgba(2,6,14,0.95) 100%)',
      }} />

      <div className="relative z-10 mx-auto px-6" style={{ maxWidth: 620, paddingTop: '5.5rem', paddingBottom: '4rem' }}>

        {/* ── Hero. The pun is the identity, so it leads. ── */}
        <div className="text-center landing-rise" style={{ animationDelay: '0.05s' }}>
          <p className="font-karla font-600 uppercase tracking-[0.22em] mb-5" style={{ fontSize: '0.7rem', color: '#7ab8cc' }}>
            Shibling Games
          </p>

          <h1
            className="font-cinzel font-900 text-[#f0ede8] leading-[0.9] tracking-[-0.01em] mb-3"
            style={{ fontSize: 'clamp(3rem, 10vw, 5rem)', textShadow: '0 2px 40px rgba(14,80,120,0.8), 0 0 80px rgba(14,116,144,0.4)' }}
          >
            Small Fishes
          </h1>
          <p className="font-cinzel italic" style={{ fontSize: '1.2rem', color: '#f0c040', textShadow: '0 0 24px rgba(240,192,64,0.5)' }}>
            Seas the Booty.
          </p>

          {/* THE BUTTON, ABOVE THE FOLD. It used to sit at the very bottom,
              behind two screenshots and a paragraph, which asked a visitor to
              read the pitch before it would let them play. Most people have
              decided by the time they have read the title. The copy below is for
              the ones who want it, not a toll gate for the ones who do not.
              Wide and centred so it is the obvious thing on the screen. */}
          <Link href="/login" className="btn-gold" style={{
            display: 'block', maxWidth: 300, margin: '2rem auto 0',
            padding: '1rem 2rem', fontSize: '1rem', letterSpacing: '0.1em',
          }}>
            Play free
          </Link>
          <p className="font-karla" style={{ fontSize: '0.74rem', color: '#8fa3b5', marginTop: 12 }}>
            In your browser. No download, no cost.
          </p>
        </div>

        {/* ── THE SHOWCASE. A real screenshot, at phone proportions.
             This replaced a painted plate and is better than it in every way that
             matters: it is unmistakably THIS game, it shows the dial and the
             PERFECT band doing their job, and it carries the thing no seascape
             could, which is that the game is warm and funny. A fish in a rowboat
             with a parrot sells this better than any amount of weather. ── */}
        <div className="landing-rise" style={{ animationDelay: '0.18s', marginTop: '3.2rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width={600} height={1245} src="/lp_shot_cast.jpg" alt="A perfect catch landing on the fishing dial"
            style={{
              display: 'block', width: 'min(290px, 80%)', height: 'auto', margin: '0 auto',
              borderRadius: 20, border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 26px 60px rgba(0,0,0,0.6)',
            }} />
          <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', lineHeight: 1.15, color: '#f4ecd8', marginTop: 20 }}>
            A needle turns, and a window opens
          </p>
          <p className="font-karla font-300" style={{ fontSize: '1rem', lineHeight: 1.75, color: '#b9c8d6', marginTop: 10 }}>
            Hit the band clean and the fish is yours and the streak holds. Miss and the streak goes
            back to nothing. The window narrows the deeper you fish. There are 146 species down
            there and you will not get them quickly.
          </p>
        </div>

        {/* ── ONE note, not two. The Gauntlet does not need its own pitch here.
             A visitor needs to know there is fishing, collecting, fighting, a
             crew and rare gear to chase, and that is one paragraph. Naming every
             mode turns it back into a features list, which is the thing this
             page was rewritten to stop being. ── */}
        <div className="landing-rise" style={{ animationDelay: '0.3s', marginTop: '3rem', borderTop: '1px solid rgba(255,255,255,0.11)', paddingTop: '1.6rem' }}>
          <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.54rem', color: '#f0c040' }}>And what it pays for</p>
          <p className="font-karla font-300" style={{ fontSize: '0.96rem', lineHeight: 1.75, color: '#b9c8d6', marginTop: 9 }}>
            You keep what you catch, and the list runs long. The fishing pays for the rest of it: a
            ship, a crew you sign on one at a time, and a fight with the outfit that runs the sea
            floor. Turn-based, and you aim every shot yourself. The gear worth having is down there,
            and it does not drop often.
          </p>
          {/* The fight, actual size. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width={600} height={1245} src="/lp_shot_fight.jpg" alt="A turn of ship combat against the Drowned Sounding Hand"
            style={{
              display: 'block', width: 'min(290px, 80%)', height: 'auto', margin: '1.4rem auto 0',
              borderRadius: 20, border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 26px 60px rgba(0,0,0,0.6)',
            }} />
        </div>

        {/* ── The second ask, for whoever read to the bottom. Same destination,
             different words: repeating "Play free" verbatim reads like a
             template rather than an invitation. ── */}
        <div className="landing-rise" style={{ animationDelay: '0.48s', marginTop: '3.2rem', textAlign: 'center' }}>
          <Link href="/login" className="btn-gold" style={{
            display: 'block', maxWidth: 300, margin: '0 auto',
            padding: '1rem 2rem', fontSize: '1rem', letterSpacing: '0.1em',
          }}>
            Start fishing
          </Link>
          <p className="font-karla mt-4" style={{ fontSize: '0.74rem', color: '#7d90a2' }}>
            Open beta. Free to play.
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
