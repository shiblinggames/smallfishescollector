'use client'

import { useRouter } from 'next/navigation'
import { RARITY_COLORS, type ZoneKey, type ZoneConfig, type Expedition } from '@/lib/expeditions'

interface Props {
  zoneKey: ZoneKey
  config: ZoneConfig
  expedition: Expedition | null
  shipTier: number
  hasSpecialCrew: boolean
  doubloons: number
}

export default function ZoneCard({ zoneKey, config, expedition, shipTier, hasSpecialCrew, doubloons }: Props) {
  const router = useRouter()

  const tierLocked = shipTier < config.requiredShipTier
  const specialLocked = !!config.specialCrewRequired && !hasSpecialCrew
  const fundsLocked = !tierLocked && !specialLocked && doubloons < config.entryCost
  const isLocked = tierLocked || specialLocked || fundsLocked
  const isActive = expedition?.status === 'active'
  const isCompleted = expedition?.status === 'completed'
  const isFailed = expedition?.status === 'failed'
  const isAttempted = isCompleted || isFailed

  function handleClick() {
    if (isActive) {
      router.push(`/expeditions/voyage?id=${expedition!.id}`)
      return
    }
    if (isCompleted || isFailed) {
      router.push(`/expeditions/results?id=${expedition!.id}`)
      return
    }
    if (isLocked) return
    router.push(`/expeditions/prepare?zone=${zoneKey}`)
  }

  const dropDisplay = config.drops.map(r => (
    <span key={r} style={{ color: RARITY_COLORS[r] }}>
      {r.charAt(0).toUpperCase() + r.slice(1)}
    </span>
  ))

  let statusLabel = `${config.length} events · ${config.entryCost} ⟡`
  let statusColor = '#6a6764'
  if (isActive) { statusLabel = `In progress — node ${expedition!.current_node + 1}/${config.length - 1}`; statusColor = '#f0c040' }
  if (isCompleted) { statusLabel = `Completed — ${(expedition?.loot as { doubloons?: number })?.doubloons ?? 0} ⟡ earned`; statusColor = '#4ade80' }
  if (isFailed) { statusLabel = 'Failed — come back tomorrow'; statusColor = '#6a6764' }
  if (tierLocked) { statusLabel = `Requires ${config.requiredShipTier === 6 ? 'Man-o-War' : ['Rowboat','Dinghy','Sloop','Schooner','Brigantine','Galleon','Man-o-War'][config.requiredShipTier]}`; statusColor = '#6a6764' }
  if (specialLocked) { statusLabel = 'Requires Catfish or Doby Mick'; statusColor = '#6a6764' }
  if (fundsLocked) { statusLabel = `Need ${config.entryCost} ⟡ to enter`; statusColor = '#6a6764' }

  const dim = isLocked || isFailed
  const interactive = !isLocked

  return (
    <div
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: `1px solid ${isActive ? 'rgba(240,192,64,0.3)' : isCompleted ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 14,
        padding: '1rem',
        cursor: interactive ? 'pointer' : 'default',
        opacity: dim ? 0.55 : 1,
        userSelect: 'none',
        transition: 'opacity 0.15s',
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{config.icon}</span>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: 1 }}>
              {tierLocked ? 'Locked' : isActive ? 'Active' : isAttempted ? 'Done' : 'Zone'}
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#f0ede8', lineHeight: 1.2 }}>
              {config.name}
            </p>
          </div>
        </div>
        {isActive && (
          <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.48rem', color: '#f0c040', flexShrink: 0 }}>
            Resume →
          </span>
        )}
        {isCompleted && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        )}
        {(tierLocked || specialLocked) && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        )}
      </div>

      {/* Description */}
      <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a8880', lineHeight: 1.45, marginBottom: '0.6rem' }}>
        {config.description}
      </p>

      {/* Drop rarities */}
      {!isLocked && (
        <div className="flex items-center gap-1 flex-wrap mb-2">
          {dropDisplay.reduce<React.ReactNode[]>((acc, el, i) => {
            if (i > 0) acc.push(<span key={`dot-${i}`} style={{ color: '#4a4845', fontSize: '0.5rem' }}>·</span>)
            acc.push(el)
            return acc
          }, []).map((el, i) => <span key={i} className="font-karla font-600" style={{ fontSize: '0.62rem' }}>{el}</span>)}
        </div>
      )}

      {/* Status line */}
      <p className="font-karla font-600" style={{ fontSize: '0.65rem', color: statusColor }}>
        {statusLabel}
      </p>
    </div>
  )
}
