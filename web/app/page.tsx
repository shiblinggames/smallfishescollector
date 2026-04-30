import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/tavern')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
      {/* Ocean depth atmosphere */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(14,116,144,0.22) 0%, transparent 65%)',
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 60% 30% at 50% 100%, rgba(14,60,100,0.12) 0%, transparent 70%)',
      }} />

      <div className="text-center relative z-10" style={{ maxWidth: 480, width: '100%' }}>

        {/* Title */}
        <p className="font-karla font-600 uppercase tracking-[0.22em] mb-4" style={{ fontSize: '0.58rem', color: '#5a9aaa' }}>
          Shibling Games
        </p>
        <h1
          className="font-cinzel font-900 text-[#f0ede8] leading-[0.9] tracking-[-0.01em] mb-3"
          style={{
            fontSize: 'clamp(3rem, 10vw, 5rem)',
            textShadow: '0 0 40px rgba(14,116,144,0.5), 0 0 100px rgba(14,116,144,0.2)',
          }}
        >
          Small Fishes
        </h1>
        <p className="font-cinzel italic mb-10" style={{ fontSize: '1.15rem', color: '#f0c040', textShadow: '0 0 24px rgba(240,192,64,0.4)' }}>
          Seas the Booty.
        </p>

        {/* Description */}
        <p className="font-karla font-300 mb-10 mx-auto" style={{ fontSize: '0.88rem', color: '#6a6764', lineHeight: 1.8, maxWidth: 360 }}>
          Fish the depths. Open packs. Build your collection.
          Set sail on expeditions and rise through the ranks.
        </p>

        {/* CTAs */}
        <div className="flex gap-3 justify-center mb-12">
          <Link href="/login" className="btn-ghost">Play Now</Link>
        </div>

        {/* Footer links */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          <div className="flex justify-center gap-5">
            <a href="https://www.instagram.com/shiblinggames/" target="_blank" rel="noopener noreferrer"
               className="font-karla font-600 uppercase tracking-[0.12em] transition-colors"
               style={{ fontSize: '0.62rem', color: '#3a3835' }}
               onMouseOver={undefined}
            >
              Instagram
            </a>
            <a href="https://www.tiktok.com/@shiblinggames" target="_blank" rel="noopener noreferrer"
               className="font-karla font-600 uppercase tracking-[0.12em] transition-colors"
               style={{ fontSize: '0.62rem', color: '#3a3835' }}
            >
              TikTok
            </a>
          </div>
          <div className="flex justify-center gap-4">
            <Link href="/privacy" className="font-karla font-300 transition-colors" style={{ fontSize: '0.62rem', color: '#3a3835' }}>
              Privacy Policy
            </Link>
            <Link href="/terms" className="font-karla font-300 transition-colors" style={{ fontSize: '0.62rem', color: '#3a3835' }}>
              Terms of Service
            </Link>
          </div>
        </div>

      </div>
    </main>
  )
}
