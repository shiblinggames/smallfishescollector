'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Nav({ packsAvailable }: { packsAvailable?: number }) {
  const router = useRouter()
  const pathname = usePathname()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const links = [
    { href: '/packs', label: 'Packs', badge: packsAvailable && packsAvailable > 0 ? packsAvailable : null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="3" width="12" height="16" rx="1.5"/>
          <rect x="4" y="6" width="12" height="16" rx="1.5"/>
        </svg>
      )
    },
    { href: '/collection', label: 'Collection', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/>
          <circle cx="8" cy="16" r="3"/><circle cx="16" cy="16" r="3"/>
        </svg>
      )
    },
    { href: '/redeem', label: 'Redeem', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2"/>
          <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
        </svg>
      )
    },
  ]

  return (
    <>
      {/* Top bar — hidden on mobile (bottom tab bar handles nav) */}
      <nav className="hidden sm:flex bg-black border-b border-[rgba(255,255,255,0.08)] px-6 py-4 items-center justify-between">
        <Link href="/" className="font-cinzel font-700 text-[#f0ede8] tracking-wide text-sm uppercase">
          Small Fishes
        </Link>

        {/* Desktop links */}
        <div className="hidden sm:flex flex-1 ml-8 gap-2 text-xs font-karla font-600 uppercase tracking-[0.12em]">
          {links.map(({ href, label, badge }) => (
            <Link key={href} href={href} className={`py-2 px-2 transition-colors duration-200 ${pathname === href ? 'text-[#f0ede8]' : 'text-[#8a8880] hover:text-[#f0ede8]'}`}>
              {label}
              {badge && <span className="ml-1.5 text-[#f0c040]">· {badge}</span>}
            </Link>
          ))}
        </div>

        <button
          onClick={signOut}
          className="py-2 px-2 text-[0.68rem] font-karla font-600 uppercase tracking-[0.20em] text-[#8a8880] hover:text-[#f0ede8] active:text-[#f0ede8] transition-colors duration-200"
        >
          Sign Out
        </button>
      </nav>

      {/* Mobile bottom tab bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-[rgba(255,255,255,0.08)] flex">
        {links.map(({ href, label, badge, icon }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href} className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors duration-200 relative ${active ? 'text-[#f0ede8]' : 'text-[#8a8880]'}`}>
              {icon}
              <span className="text-[0.58rem] font-karla font-600 uppercase tracking-[0.10em]">{label}</span>
              {badge && (
                <span className="absolute top-2 right-[calc(50%-18px)] bg-[#f0c040] text-black text-[0.5rem] font-karla font-700 rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>

    </>
  )
}
