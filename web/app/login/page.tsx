import { Suspense } from 'react'
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-14 relative overflow-hidden">
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

      <div className="w-full max-w-sm relative" style={{ zIndex: 10 }}>
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
              textShadow: '0 2px 40px rgba(14,80,120,0.8), 0 0 80px rgba(14,116,144,0.4)',
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

      </div>
    </main>
  )
}
