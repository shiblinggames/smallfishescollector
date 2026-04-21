import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/packs')

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-lg">
        <p className="sg-eyebrow mb-6">Digital Collectibles</p>
        <h1 className="font-cinzel font-black text-[#f0ede8] leading-[0.92] tracking-[-0.01em] mb-4"
            style={{ fontSize: 'clamp(2.6rem, 8vw, 5rem)' }}>
          Small Fishes.
        </h1>
        <p className="font-cinzel font-400 italic text-[#f0c040] text-xl mb-8">
          Seas the Booty.
        </p>
        <p className="text-[#f0ede8] opacity-70 font-karla font-300 leading-[1.75] mb-12 max-w-sm mx-auto">
          Redeem the code from your game box to unlock a digital booster pack.
          Collect all 36 fish cards with rare CSS effects.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/login" className="btn-gold">
            Sign In
          </Link>
          <Link href="/register" className="btn-ghost">
            Create Account
          </Link>
        </div>
      </div>
    </main>
  )
}
