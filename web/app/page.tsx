import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/packs')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      <div className="text-center max-w-lg">
        <p className="sg-eyebrow mb-6">Digital Collectibles</p>
        <h1 className="font-cinzel font-black text-[#f0ede8] leading-[0.92] tracking-[-0.01em] mb-4"
            style={{ fontSize: 'clamp(2.6rem, 8vw, 5rem)' }}>
          Small Fishes.
        </h1>
        <p className="font-cinzel font-400 italic text-[#f0c040] text-xl mb-8">
          Seas the Booty.
        </p>

        <p className="text-[#f0ede8] opacity-70 font-karla font-300 leading-[1.75] mb-4 max-w-sm mx-auto">
          Every purchase of <span className="text-[#f0c040] opacity-100 font-500">Small Fishes</span> comes
          with digital booster packs. Collect all 36 fish cards across a huge variety of rarities and
          special editions — with a real chance to win prizes and discounts.
        </p>

        <a href="https://shiblinggames.com" target="_blank" rel="noopener noreferrer"
           className="inline-block font-karla font-600 text-[0.7rem] uppercase tracking-[0.14em] text-[#f0c040] hover:text-[#ffd966] transition-colors mb-10">
          Buy the Game at shiblinggames.com →
        </a>

        <div className="flex gap-4 justify-center mb-12">
          <Link href="/login" className="btn-gold">Sign In</Link>
          <Link href="/register" className="btn-ghost">Create Account</Link>
        </div>

        <div className="border-t border-[rgba(255,255,255,0.06)] pt-8 space-y-2">
          <p className="font-karla font-300 text-[#8a8880] text-xs uppercase tracking-[0.14em]">
            Follow us for more chances to win!
          </p>
          <div className="flex justify-center gap-6">
            <a href="https://www.instagram.com/shiblinggames/" target="_blank" rel="noopener noreferrer"
               className="font-karla font-600 text-[0.7rem] uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors">
              Instagram
            </a>
            <a href="https://www.tiktok.com/@shiblinggames" target="_blank" rel="noopener noreferrer"
               className="font-karla font-600 text-[0.7rem] uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors">
              TikTok
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
