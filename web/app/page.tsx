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
        <span className="font-karla font-700 uppercase tracking-[0.18em] inline-block mb-4 px-3 py-1" style={{
          fontSize: '0.55rem',
          color: '#f0c040',
          background: 'rgba(240,192,64,0.1)',
          border: '1px solid rgba(240,192,64,0.25)',
          borderRadius: '999px',
        }}>
          Open Beta
        </span>

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
        <div className="flex gap-3 justify-center mb-6">
          <Link href="/login" className="btn-ghost">Play Now</Link>
        </div>

        {/* Install callout */}
        <div className="flex items-center justify-center gap-2 mb-12">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5a9aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v13M8 11l4 4 4-4"/>
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
          </svg>
          <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#5a7a8a', lineHeight: 1.6 }}>
            Best played as an app — tap Share{' '}
            <svg style={{ display: 'inline', verticalAlign: 'middle', marginBottom: 1 }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#5a9aaa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>{' '}
            then <span style={{ color: '#7aaabb' }}>Add to Home Screen</span>
          </p>
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
