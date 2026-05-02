import { Suspense } from 'react'
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-14 relative overflow-hidden">
      {/* Ocean depth atmosphere */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(14,116,144,0.22) 0%, transparent 65%)',
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 60% 30% at 50% 100%, rgba(14,60,100,0.12) 0%, transparent 70%)',
      }} />

      <div className="w-full max-w-sm relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
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
              fontSize: 'clamp(2.6rem, 9vw, 3.4rem)',
              textShadow: '0 0 40px rgba(14,116,144,0.5), 0 0 100px rgba(14,116,144,0.2)',
            }}
          >
            Small Fishes
          </h1>
          <p className="font-cinzel italic" style={{ fontSize: '1.05rem', color: '#f0c040', textShadow: '0 0 24px rgba(240,192,64,0.4)' }}>
            Seas the Booty.
          </p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <div className="flex items-center justify-center gap-2 mt-8">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5a9aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v13M8 11l4 4 4-4"/>
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
          </svg>
          <p className="font-karla font-400 text-center" style={{ fontSize: '0.68rem', color: '#4a6570', lineHeight: 1.6 }}>
            Best played as an app — in Safari, tap <span style={{ color: '#5a8a9a' }}>···</span> → Share → Add to Home Screen
          </p>
        </div>
      </div>
    </main>
  )
}
