import { Suspense } from 'react'
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="sg-eyebrow text-center mb-4">Digital Collectibles</p>
        <h1 className="font-cinzel font-black text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-2"
            style={{ fontSize: 'clamp(2rem, 6vw, 3rem)' }}>
          Small Fishes.
        </h1>
        <p className="font-cinzel italic text-[#f0c040] text-center mb-10">
          Seas the Booty.
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
