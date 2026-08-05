import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  description:
    'A free browser game about fishing, and about what is down there. Land 146 species on a timing dial, crew a ship, and sail into a story campaign that fights back.',
}

/**
 * THE LANDING PAGE.
 *
 * The old one said "Fish the depths. Build your collection. Set sail on
 * expeditions and rise through the ranks." Three sentences that would fit any
 * game with a boat in it, no picture of the thing itself, and one button. A
 * visitor could not learn what the game IS, only that it exists.
 *
 * So this one shows the game. Two pillars, because there are genuinely two core
 * loops (the cast and the campaign) and everything else supports them, then the
 * run that has teeth. Real art from the game, real numbers from the game.
 *
 * PERFORMANCE. Stays a SERVER component (it does the logged-in redirect before
 * rendering anything), so the arrival is a CSS keyframe rather than framer:
 * transform and opacity, one pass, nothing left running. Art is already in
 * public/ and already compressed.
 */
const PILLARS: { art: string; eyebrow: string; title: string; body: string }[] = [
  {
    art: '/fishing-zones-bg.jpg',
    eyebrow: 'The cast',
    title: 'It is a game of timing',
    body: 'Every fish is a needle on a dial and a window that shrinks as you go deeper. Land it clean and the streak carries. Miss and it does not.',
  },
  {
    art: '/exp-campaign.jpg',
    eyebrow: 'The campaign',
    title: 'Something down there is organised',
    body: 'Four chapters of turn-based raids against a syndicate that runs the sea floor. Crew your ship, aim every broadside, and learn what each boss does before it does it.',
  },
  {
    art: '/exp-gauntlets.jpg',
    eyebrow: 'The gauntlet',
    title: 'One dive a day, and it can end',
    body: 'A push-your-luck descent that pays deeper and deeper until you bank it. Hardcore puts your crew on the line for real: lose them down there and they are gone.',
  },
]

const FACTS: [string, string][] = [
  ['146', 'species to land'],
  ['41', 'crew to sign'],
  ['65', 'raid items'],
  ['195', 'badges'],
]

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/tavern')

  return (
    <main className="min-h-screen relative" style={{ overflowX: 'hidden' }}>
      {/* Background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/loginbackground.webp" alt="" aria-hidden style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', objectPosition: 'top center', zIndex: 0, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(0,5,20,0.42) 0%, rgba(0,5,20,0.72) 55%, rgba(2,6,14,0.94) 100%)',
      }} />

      <div className="relative z-10 mx-auto px-6" style={{ maxWidth: 760, paddingTop: '5rem', paddingBottom: '4rem' }}>

        {/* ── Hero ── */}
        <div className="text-center landing-rise" style={{ animationDelay: '0.05s' }}>
          <p className="font-karla font-600 uppercase tracking-[0.22em] mb-4" style={{ fontSize: '0.72rem', color: '#7ab8cc' }}>
            Shibling Games
          </p>
          <span className="font-karla font-700 uppercase tracking-[0.18em] inline-block mb-5 px-3 py-1" style={{
            fontSize: '0.55rem', color: '#f0c040',
            background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.30)', borderRadius: 999,
          }}>
            Open Beta · Free to play
          </span>

          <h1
            className="font-cinzel font-900 text-[#f0ede8] leading-[0.9] tracking-[-0.01em] mb-3"
            style={{ fontSize: 'clamp(3rem, 10vw, 5rem)', textShadow: '0 2px 40px rgba(14,80,120,0.8), 0 0 80px rgba(14,116,144,0.4)' }}
          >
            Small Fishes
          </h1>
          <p className="font-cinzel italic mb-8" style={{ fontSize: '1.15rem', color: '#f0c040', textShadow: '0 0 24px rgba(240,192,64,0.5)' }}>
            Seas the Booty.
          </p>

          <p className="font-karla font-300 mx-auto mb-9" style={{ fontSize: '1rem', color: '#c3d2df', lineHeight: 1.75, maxWidth: 460 }}>
            A game about fishing, and about what is down there.
            Land them on a timing dial, sign a crew, and sail into a story that fights back.
          </p>

          <Link href="/login" className="btn-gold" style={{ padding: '0.85rem 2.4rem', fontSize: '0.9rem' }}>
            Start fishing
          </Link>
          <p className="font-karla mt-4" style={{ fontSize: '0.72rem', color: '#7d90a2' }}>
            Runs in your browser. No download.
          </p>
        </div>

        {/* ── What it actually is ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: '4.5rem' }}>
          {PILLARS.map((p, i) => (
            <div
              key={p.title}
              className="landing-rise"
              style={{
                animationDelay: `${0.2 + i * 0.1}s`,
                position: 'relative', borderRadius: 18, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.10)',
                // Solid base under the art, per the house rule for panels over
                // painted grounds: a translucent card here would show the page
                // background through the tile art and read as mud.
                background: '#070d16',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.art} alt="" aria-hidden loading="lazy" decoding="async"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.42 }} />
              <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(7,13,22,0.96) 30%, rgba(7,13,22,0.62) 100%)' }} />
              <div style={{ position: 'relative', padding: '1.5rem 1.4rem' }}>
                <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.54rem', color: '#f0c040' }}>{p.eyebrow}</p>
                <p className="font-cinzel font-800" style={{ fontSize: '1.3rem', lineHeight: 1.15, color: '#f4ecd8', marginTop: 6 }}>{p.title}</p>
                <p className="font-karla font-300" style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#b3c2d1', marginTop: 8, maxWidth: 460 }}>{p.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── How much of it there is ── */}
        <div
          className="landing-rise"
          style={{
            animationDelay: '0.55s',
            display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8,
            marginTop: '2.6rem', padding: '1.15rem 0.8rem', borderRadius: 16,
            background: 'rgba(7,13,22,0.82)', border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          {FACTS.map(([n, label]) => (
            <div key={label} style={{ textAlign: 'center', minWidth: 0 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', lineHeight: 1, color: '#ecdcbd', fontVariantNumeric: 'tabular-nums' }}>{n}</p>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#8298ac', marginTop: 5, lineHeight: 1.3 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* ── Closing CTA ── */}
        <div className="text-center landing-rise" style={{ animationDelay: '0.65s', marginTop: '3rem' }}>
          <p className="font-cinzel italic" style={{ fontSize: '1.05rem', color: '#c8aa6a', marginBottom: '1.2rem' }}>
            The tide does not wait.
          </p>
          <Link href="/login" className="btn-gold" style={{ padding: '0.85rem 2.4rem', fontSize: '0.9rem' }}>
            Start fishing
          </Link>
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
