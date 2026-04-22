'use client'

import { useState } from 'react'

const RARITIES = [
  { label: 'Common',    color: '#8a8880', chance: '~70%',   note: 'Standard variant' },
  { label: 'Uncommon',  color: '#4ade80', chance: '~25%',   note: 'Silver variant' },
  { label: 'Rare',      color: '#60a5fa', chance: '~12%',   note: 'Gold variant' },
  { label: 'Epic',      color: '#a78bfa', chance: '~4%',    note: 'Pearl or Holographic' },
  { label: 'Legendary', color: '#f0c040', chance: '~0.5%',  note: 'Ghost, Shadow, or Prismatic' },
  { label: 'Mythic',    color: '#ff3838', chance: '~0.1%',  note: 'Named variants — rarest of all' },
]

function AccordionItem({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="sg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-8 py-5 text-left"
      >
        <p className="sg-eyebrow">{title}</p>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          className="flex-shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M2 5l5 5 5-5" stroke="#8a8880" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="px-8 pb-7 border-t border-[rgba(255,255,255,0.06)]">
          <div className="pt-5">{children}</div>
        </div>
      )}
    </div>
  )
}

export default function PackInfo() {
  return (
    <div className="w-full max-w-2xl mt-20 flex flex-col gap-3">

      <AccordionItem title="What's in a Pack">
        <div className="flex flex-col gap-3 text-sm font-karla font-300 text-[#8a8880] leading-relaxed">
          <p>
            Each pack contains <span className="text-[#f0ede8] font-400">5 cards</span> drawn from the full pool of fish and variants.
            Every pack is guaranteed to include at least one <span className="text-[#60a5fa] font-400">Rare</span> or better.
            After 20 packs without a Legendary, the tide turns — your next pack is guaranteed a{' '}
            <span className="text-[#f0c040] font-400">Legendary</span> or better.
          </p>
          <p>
            Pulling the rarest cards can unlock <span className="text-[#f0ede8] font-400">special real-world rewards</span> — including
            discount codes and merch. Keep an eye out when something extraordinary lands.
          </p>
        </div>
      </AccordionItem>

      <AccordionItem title="Rarity Guide">
        <div className="flex flex-col gap-3">
          {RARITIES.map(({ label, color, chance, note }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="font-karla font-600 text-xs uppercase tracking-[0.10em] w-20 flex-shrink-0" style={{ color }}>{label}</span>
              <span className="font-karla font-300 text-[#8a8880] text-xs flex-1">{note}</span>
              <span className="font-karla font-300 text-[#8a8880] text-xs tabular-nums">{chance}</span>
            </div>
          ))}
        </div>
      </AccordionItem>

      <AccordionItem title="How to Get Packs">
        <div className="flex flex-col gap-4 text-sm">
          <p className="font-karla font-300 text-[#8a8880] leading-relaxed">
            Packs come with the <span className="text-[#f0ede8] font-400">physical card game</span>. Each copy includes a code to unlock your digital collection.
          </p>
          <p className="font-karla font-300 text-[#8a8880] leading-relaxed">
            Additional packs are distributed through <span className="text-[#f0ede8] font-400">redeem codes</span> — handed out at events, giveaways, and through our community channels.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <a
              href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game"
              target="_blank" rel="noopener noreferrer"
              className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors"
            >
              Buy the Game →
            </a>
            <a href="/redeem" className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors">
              Redeem a Code →
            </a>
            <a
              href="https://www.instagram.com/shiblinggames/"
              target="_blank" rel="noopener noreferrer"
              className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors"
            >
              Instagram →
            </a>
            <a
              href="https://www.tiktok.com/@shiblinggames"
              target="_blank" rel="noopener noreferrer"
              className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors"
            >
              TikTok →
            </a>
          </div>
        </div>
      </AccordionItem>

    </div>
  )
}
