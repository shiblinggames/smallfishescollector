import { rarityFromWeight, RARITY_COLOR } from '@/lib/variants'
import type { PackStats, PackHistoryEntry } from './stats'

const PITY_CAP = 50

function PityBar({ count }: { count: number }) {
  const pct = Math.min((count / PITY_CAP) * 100, 100)
  const color = pct >= 80 ? '#f0c040' : pct >= 50 ? '#a78bfa' : '#8a8880'
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <p className="font-karla font-300 text-[0.68rem] uppercase tracking-[0.12em] text-[#8a8880]">Pity</p>
        <p className="font-karla font-600 text-[0.68rem]" style={{ color }}>
          {count} <span className="font-300 text-[#8a8880]">/ {PITY_CAP}</span>
        </p>
      </div>
      <div className="h-px w-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="font-karla font-300 text-[0.6rem] text-[#8a8880]">
        {count >= PITY_CAP ? 'Legendary guaranteed next pack' : `Legendary guaranteed in ${PITY_CAP - count} pack${PITY_CAP - count === 1 ? '' : 's'}`}
      </p>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-cinzel font-700 text-[#f0ede8] text-lg leading-none mb-1">{value}</p>
      <p className="font-karla font-300 text-[0.62rem] uppercase tracking-[0.12em] text-[#8a8880]">{label}</p>
    </div>
  )
}

function HistoryCardDot({ dropWeight, variantName }: { dropWeight: number; variantName: string }) {
  const rarity = rarityFromWeight(dropWeight)
  const color = RARITY_COLOR[rarity] ?? '#8a8880'
  return (
    <div
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: color }}
      title={`${variantName} · ${rarity}`}
    />
  )
}

export default function PackStats({ stats, history }: { stats: PackStats; history: PackHistoryEntry[] }) {
  return (
    <div className="w-full max-w-sm space-y-6 mt-2">
      {/* Stats row */}
      <div className="sg-card px-6 py-5 space-y-5">
        <div className="flex justify-around">
          <StatItem label="Packs Opened" value={stats.totalPacksOpened.toString()} />
          <div className="w-px bg-[rgba(255,255,255,0.08)]" />
          <StatItem label="Completion" value={`${stats.completionPct}%`} />
          {stats.rarestPull && (
            <>
              <div className="w-px bg-[rgba(255,255,255,0.08)]" />
              <div className="text-center">
                <p
                  className="font-cinzel font-700 text-lg leading-none mb-1"
                  style={{ color: RARITY_COLOR[rarityFromWeight(stats.rarestPull.dropWeight)] ?? '#8a8880' }}
                >
                  {rarityFromWeight(stats.rarestPull.dropWeight)}
                </p>
                <p className="font-karla font-300 text-[0.62rem] uppercase tracking-[0.12em] text-[#8a8880]">
                  Rarest Pull
                </p>
                <p className="font-karla font-300 text-[0.58rem] text-[#8a8880] mt-0.5 whitespace-nowrap">
                  {stats.rarestPull.name}
                </p>
              </div>
            </>
          )}
        </div>
        <PityBar count={stats.packsSinceLegendary} />
      </div>

      {/* Pull history */}
      {history.length > 0 && (
        <div className="sg-card px-6 py-5 space-y-4">
          <p className="font-karla font-300 text-[0.68rem] uppercase tracking-[0.12em] text-[#8a8880]">Recent Packs</p>
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4">
                <p className="font-karla font-300 text-[0.62rem] text-[#8a8880] whitespace-nowrap">
                  {new Date(entry.openedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {entry.wasGodPack && (
                    <span className="ml-1.5 font-600 text-[0.58rem] uppercase tracking-wider"
                          style={{ background: 'linear-gradient(90deg,#ff0080,#ff8c00,#ffe600,#00ff88,#00cfff,#8a5cf7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      God
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-1.5">
                  {entry.cards.map((c, i) => (
                    <HistoryCardDot key={i} dropWeight={c.dropWeight} variantName={c.variantName} />
                  ))}
                </div>
                <p className="font-karla font-300 text-[0.62rem] text-[#8a8880] whitespace-nowrap">
                  {rarityFromWeight(Math.min(...entry.cards.map((c) => c.dropWeight)))}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
