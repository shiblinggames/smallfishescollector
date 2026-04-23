'use client'

import { useState } from 'react'
import PackStats from './PackStats'
import type { PackStats as PackStatsType, PackHistoryEntry } from './stats'

export default function PackStatsToggle({ stats, history, hookTier }: { stats: PackStatsType; history: PackHistoryEntry[]; hookTier: number }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="w-full max-w-sm mt-8 flex flex-col items-center gap-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="font-karla font-300 text-[0.68rem] uppercase tracking-[0.16em] text-[#8a8880] hover:text-[#f0ede8] transition-colors"
      >
        {open ? 'Hide Stats' : 'Stats & History'}
      </button>
      {open && <PackStats stats={stats} history={history} hookTier={hookTier} />}
    </div>
  )
}
