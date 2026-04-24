import { Suspense } from 'react'
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-14">
      <div className="w-full max-w-sm">
        <p className="sg-eyebrow text-center mb-4">Digital Collectibles</p>
        <h1 className="font-cinzel font-black text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-2"
            style={{ fontSize: 'clamp(2rem, 6vw, 3rem)' }}>
          Small Fishes.
        </h1>
        <p className="font-cinzel italic text-[#f0c040] text-center mb-8">
          Seas the Booty.
        </p>

        <div className="sg-card px-6 py-5 mb-6 text-center space-y-2">
          <p className="font-karla font-400 text-[#f0ede8] text-sm leading-relaxed">
            Every purchase of <span className="text-[#f0c040] font-600">Small Fishes</span> comes with digital booster packs — collect all <span className="text-[#f0c040] font-600">36 fish cards</span> across a huge variety of rarities and special editions.
          </p>
          <p className="font-karla font-300 text-[#a0a09a] text-xs leading-relaxed">
            Chance to win special prizes and discounts.
          </p>
          <a
            href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 font-karla font-600 text-[0.7rem] uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors"
          >
            Buy the Game →
          </a>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
