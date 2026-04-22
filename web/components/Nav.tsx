'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Nav({ packsAvailable }: { packsAvailable?: number }) {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="bg-black border-b border-[rgba(255,255,255,0.08)] px-6 py-4 flex items-center gap-8">
      <Link href="/" className="font-cinzel font-700 text-[#f0ede8] tracking-wide text-sm uppercase">
        Small Fishes
      </Link>

      <div className="flex-1 flex gap-2 text-xs font-karla font-600 uppercase tracking-[0.12em]">
        <Link href="/packs" className="py-2 px-2 text-[#8a8880] hover:text-[#f0ede8] active:text-[#f0ede8] transition-colors duration-200">
          Packs
          {packsAvailable !== undefined && packsAvailable > 0 && (
            <span className="ml-1.5 text-[#f0c040]">· {packsAvailable}</span>
          )}
        </Link>
        <Link href="/collection" className="py-2 px-2 text-[#8a8880] hover:text-[#f0ede8] active:text-[#f0ede8] transition-colors duration-200">
          Collection
        </Link>
        <Link href="/redeem" className="py-2 px-2 text-[#8a8880] hover:text-[#f0ede8] active:text-[#f0ede8] transition-colors duration-200">
          Redeem
        </Link>
      </div>

      <button
        onClick={signOut}
        className="py-2 px-2 text-[0.68rem] font-karla font-600 uppercase tracking-[0.20em] text-[#8a8880] hover:text-[#f0ede8] active:text-[#f0ede8] transition-colors duration-200"
      >
        Sign Out
      </button>
    </nav>
  )
}
