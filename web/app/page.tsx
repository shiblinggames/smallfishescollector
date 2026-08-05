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
 * ART. One plate used properly, rather than three that differed mainly by
 * palette because they came from one prompt run three times. When real
 * screenshots exist (the dial with the needle in the band, a boss card
 * mid-fight, a Gauntlet depth counter) they belong in the showcase below, and
 * they will beat any painted plate because they cannot be mistaken for another
 * game.
 *
 * Stays a SERVER component: the logged-in redirect runs before anything renders,
 * so the arrival is a CSS keyframe rather than framer.
 */

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/tavern')

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
        </div>

        {/* ── THE SHOWCASE. One thing, shown properly. Swap this image for a real
             screenshot of the dial mid-cast the moment one exists. ── */}
        <div className="landing-rise" style={{ animationDelay: '0.18s', marginTop: '3.2rem' }}>
          <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', background: '#070d16' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lp_cast.jpg" alt="" aria-hidden
              style={{ display: 'block', width: '100%', height: 200, objectFit: 'cover', opacity: 0.9 }} />
            <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, background: 'linear-gradient(180deg, transparent, #070d16 88%)' }} />
          </div>
          <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', lineHeight: 1.15, color: '#f4ecd8', marginTop: 20 }}>
            A needle turns, and a window opens
          </p>
          <p className="font-karla font-300" style={{ fontSize: '1rem', lineHeight: 1.75, color: '#b9c8d6', marginTop: 10 }}>
            Hit the band clean and the fish is yours and the streak holds. Miss and the streak goes
            back to nothing. The window narrows the deeper you fish. There are 146 species down
            there and you will not get them quickly.
          </p>
        </div>

        {/* ── Two plain notes. Deliberately not cards, and deliberately not the
             same weight as each other or as the showcase. ── */}
        <div className="landing-rise" style={{ animationDelay: '0.3s', marginTop: '3rem', borderTop: '1px solid rgba(255,255,255,0.11)', paddingTop: '1.6rem' }}>
          <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.54rem', color: '#f0c040' }}>Then it gets worse</p>
          <p className="font-karla font-300" style={{ fontSize: '0.96rem', lineHeight: 1.75, color: '#b9c8d6', marginTop: 9 }}>
            An outfit runs the sea floor and has no use for competition. Eight raids across four
            chapters, turn-based, every boss telling you what it is about to do a turn before it does
            it. Crew your ship, aim each broadside yourself, and work out the answer before it lands.
          </p>
        </div>

        <div className="landing-rise" style={{ animationDelay: '0.38s', marginTop: '1.8rem', borderTop: '1px solid rgba(255,255,255,0.11)', paddingTop: '1.6rem' }}>
          <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.54rem', color: '#d1495b' }}>One dive a day</p>
          <p className="font-karla font-300" style={{ fontSize: '0.96rem', lineHeight: 1.75, color: '#b9c8d6', marginTop: 9 }}>
            The Gauntlet pays deeper and deeper until you bank it. In Hardcore the crew you take down
            is the crew you own. Lose them and they are gone.
          </p>
        </div>

        {/* ── CTA ── */}
        <div className="landing-rise" style={{ animationDelay: '0.48s', marginTop: '3.2rem', textAlign: 'center' }}>
          <Link href="/login" className="btn-gold" style={{ padding: '0.9rem 2.6rem', fontSize: '0.92rem' }}>
            Start fishing
          </Link>
          <p className="font-karla mt-4" style={{ fontSize: '0.74rem', color: '#7d90a2' }}>
            Free, in your browser. Open beta, no download.
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
