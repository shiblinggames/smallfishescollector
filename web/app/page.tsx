import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/tavern')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
      {/* Background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/loginbackground.webp" alt="" aria-hidden style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', objectPosition: 'top center', zIndex: 0, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(0,5,20,0.35) 0%, rgba(0,5,20,0.55) 60%, rgba(0,5,20,0.75) 100%)',
      }} />

      <div className="text-center relative z-10" style={{ maxWidth: 480, width: '100%' }}>

        {/* Title */}
        <p className="font-karla font-600 uppercase tracking-[0.22em] mb-4" style={{ fontSize: '0.78rem', color: '#7ab8cc' }}>
          Shibling Games
        </p>
        <span className="font-karla font-700 uppercase tracking-[0.18em] inline-block mb-4 px-3 py-1" style={{
          fontSize: '0.55rem',
          color: '#f0c040',
          background: 'rgba(240,192,64,0.12)',
          border: '1px solid rgba(240,192,64,0.30)',
          borderRadius: '999px',
        }}>
          Open Beta
        </span>

        <h1
          className="font-cinzel font-900 text-[#f0ede8] leading-[0.9] tracking-[-0.01em] mb-3"
          style={{
            fontSize: 'clamp(3rem, 10vw, 5rem)',
            textShadow: '0 2px 40px rgba(14,80,120,0.8), 0 0 80px rgba(14,116,144,0.4)',
          }}
        >
          Small Fishes
        </h1>
        <p className="font-cinzel italic mb-10" style={{ fontSize: '1.15rem', color: '#f0c040', textShadow: '0 0 24px rgba(240,192,64,0.5)' }}>
          Seas the Booty.
        </p>

        {/* Description */}
        <p className="font-karla font-300 mb-10 mx-auto" style={{ fontSize: '0.88rem', color: '#a8b8c8', lineHeight: 1.8, maxWidth: 360 }}>
          Fish the depths. Build your collection.
          Set sail on expeditions and rise through the ranks.
        </p>

        {/* CTAs */}
        <div className="flex gap-3 justify-center mb-12">
          <Link href="/login" className="btn-ghost">Play Now</Link>
        </div>

        {/* Footer links */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          <div className="flex justify-center gap-5">
            <a href="https://www.instagram.com/shiblinggames/" target="_blank" rel="noopener noreferrer"
               className="font-karla font-600 uppercase tracking-[0.12em] transition-colors"
               style={{ fontSize: '0.82rem', color: '#8ab8cc' }}
            >
              Instagram
            </a>
            <a href="https://www.tiktok.com/@shiblinggames" target="_blank" rel="noopener noreferrer"
               className="font-karla font-600 uppercase tracking-[0.12em] transition-colors"
               style={{ fontSize: '0.82rem', color: '#8ab8cc' }}
            >
              TikTok
            </a>
          </div>
          <div className="flex justify-center gap-4">
            <Link href="/privacy" className="font-karla font-400 transition-colors" style={{ fontSize: '0.78rem', color: '#6a8a9a' }}>
              Privacy Policy
            </Link>
            <Link href="/terms" className="font-karla font-400 transition-colors" style={{ fontSize: '0.78rem', color: '#6a8a9a' }}>
              Terms of Service
            </Link>
          </div>
        </div>

      </div>
    </main>
  )
}
