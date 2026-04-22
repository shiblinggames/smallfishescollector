import { Suspense } from 'react'
import ClaimContent from './ClaimContent'

export default function ClaimPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="sg-eyebrow text-center mb-4">Booster Packs</p>
        <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-10"
            style={{ fontSize: 'clamp(2rem, 5vw, 3rem)' }}>
          Claim.
        </h1>
        <Suspense fallback={
          <div className="sg-card p-8 text-center">
            <p className="font-karla font-300 text-[#8a8880] text-sm">Validating link…</p>
          </div>
        }>
          <ClaimContent />
        </Suspense>
      </div>
    </main>
  )
}
