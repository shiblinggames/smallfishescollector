'use client'

import { useRouter } from 'next/navigation'
import { type ZoneKey, type ZoneConfig, type Expedition } from '@/lib/expeditions'

const ZONE_THEME: Record<ZoneKey, {
  label: string
  color: string
  dim: string
  bg: string
  border: string
  glow: string
}> = {
  coral_run: {
    label: 'Beginner',
    color: '#4ade80',
    dim: 'rgba(74,222,128,0.5)',
    bg: 'linear-gradient(135deg, rgba(10,28,24,1) 0%, rgba(6,18,14,1) 100%)',
    border: 'rgba(74,222,128,0.18)',
    glow: 'rgba(74,222,128,0.06)',
  },
  bertuna_triangle: {
    label: 'Intermediate',
    color: '#f0c040',
    dim: 'rgba(240,192,64,0.5)',
    bg: 'linear-gradient(135deg, rgba(26,22,8,1) 0%, rgba(16,14,4,1) 100%)',
    border: 'rgba(240,192,64,0.18)',
    glow: 'rgba(240,192,64,0.06)',
  },
  sunken_reach: {
    label: 'Advanced',
    color: '#fb923c',
    dim: 'rgba(251,146,60,0.5)',
    bg: 'linear-gradient(135deg, rgba(26,14,6,1) 0%, rgba(16,8,4,1) 100%)',
    border: 'rgba(251,146,60,0.18)',
    glow: 'rgba(251,146,60,0.06)',
  },
  davy_jones_locker: {
    label: 'Extreme',
    color: '#c084fc',
    dim: 'rgba(192,132,252,0.5)',
    bg: 'linear-gradient(135deg, rgba(18,8,26,1) 0%, rgba(10,4,16,1) 100%)',
    border: 'rgba(192,132,252,0.18)',
    glow: 'rgba(192,132,252,0.06)',
  },
}

interface Props {
  zoneKey: ZoneKey
  config: ZoneConfig
  expedition: Expedition | null
  shipTier: number
  doubloons: number
  voyageLocked?: boolean
}

export default function ZoneCard({ zoneKey, config, expedition, shipTier, doubloons, voyageLocked = false }: Props) {
  const router = useRouter()
  const theme = ZONE_THEME[zoneKey]

  const isUnderConstruction = zoneKey !== 'coral_run'
  const tierLocked = shipTier < config.requiredShipTier
  const fundsLocked = !tierLocked && doubloons < config.entryCost
  const isLocked = tierLocked || fundsLocked
  const isActive = expedition?.status === 'active'
  const isCompleted = expedition?.status === 'completed'
  const isFailed = expedition?.status === 'failed'
  const isAttempted = isCompleted || isFailed
  const voyageBlocked = voyageLocked && !isActive && !isAttempted
  const interactive = !isUnderConstruction && (!isLocked || isActive || isAttempted) && !voyageBlocked

  function handleClick() {
    if (isUnderConstruction || voyageBlocked) return
    if (isActive) { router.push(`/expeditions/voyage?id=${expedition!.id}`); return }
    if (isAttempted) { router.push(`/expeditions/results?id=${expedition!.id}`); return }
    if (isLocked) return
    router.push(`/expeditions/prepare?zone=${zoneKey}`)
  }

  const earnedDoubloons = (expedition?.loot as { doubloons?: number })?.doubloons ?? 0

  let lockReason = ''
  if (tierLocked) lockReason = `Requires ${['Rowboat','Dinghy','Sloop','Schooner','Brigantine','Galleon','Man-o-War'][config.requiredShipTier]}`
  else if (fundsLocked) lockReason = `Need ${config.entryCost.toLocaleString()} ⟡ to enter`

  const dimCard = isUnderConstruction || (isLocked && !fundsLocked) || isFailed || voyageBlocked

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      style={{
        position: 'relative',
        background: theme.bg,
        border: `1px solid ${isActive ? theme.color + '55' : isCompleted ? theme.color + '40' : theme.border}`,
        borderRadius: 16,
        overflow: 'hidden',
        cursor: interactive ? 'pointer' : 'default',
        opacity: dimCard ? 0.45 : 1,
        transition: 'opacity 0.15s, border-color 0.15s',
        userSelect: 'none',
      }}
    >
      {/* Subtle glow bleed in corner */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, right: 0, width: 120, height: 120,
        background: `radial-gradient(circle at top right, ${theme.glow} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Active pulse bar */}
      {isActive && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${theme.color}, transparent)`,
          opacity: 0.7,
        }} />
      )}

      <div style={{ padding: '1.1rem 1.15rem' }}>

        {/* Top row: icon + name + status badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.7rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 11, flexShrink: 0,
              background: `${theme.color}12`,
              border: `1px solid ${theme.color}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.15rem',
            }}>
              {config.icon}
            </div>
            <div>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8', lineHeight: 1.2 }}>
                {config.name}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 3 }}>
                <span
                  className="font-karla font-700 uppercase tracking-[0.08em]"
                  style={{
                    fontSize: '0.48rem',
                    color: theme.color,
                    background: `${theme.color}18`,
                    border: `1px solid ${theme.color}35`,
                    borderRadius: 4,
                    padding: '0.15rem 0.4rem',
                  }}
                >
                  {theme.label}
                </span>
                <span className="font-karla" style={{ fontSize: '0.62rem', color: '#4a4845' }}>
                  {config.nodes.length} nodes
                </span>
              </div>
            </div>
          </div>

          {/* Right badge */}
          {isUnderConstruction && (
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{
              fontSize: '0.48rem', color: '#fbbf24', flexShrink: 0, marginTop: 2,
              background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.28)',
              borderRadius: 6, padding: '0.25rem 0.5rem',
            }}>
              🚧 Coming Soon
            </span>
          )}
          {!isUnderConstruction && isActive && (
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{
              fontSize: '0.5rem', color: theme.color, flexShrink: 0, marginTop: 2,
              background: `${theme.color}15`, border: `1px solid ${theme.color}35`,
              borderRadius: 6, padding: '0.25rem 0.5rem',
            }}>
              Resume →
            </span>
          )}
          {!isUnderConstruction && isCompleted && (
            <div style={{
              flexShrink: 0, marginTop: 2,
              background: `${theme.color}15`, border: `1px solid ${theme.color}35`,
              borderRadius: 6, padding: '0.3rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={theme.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.48rem', color: theme.color }}>Done</span>
            </div>
          )}
          {isFailed && (
            <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
              fontSize: '0.48rem', color: '#6a6764', flexShrink: 0, marginTop: 2,
            }}>
              Failed
            </span>
          )}
          {tierLocked && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3a3835" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          )}
        </div>

        {/* Description */}
        <p className="font-karla" style={{ fontSize: '0.73rem', color: '#7a7875', lineHeight: 1.55, marginBottom: '0.85rem' }}>
          {config.description}
        </p>

        {/* Divider */}
        <div style={{ height: 1, background: `${theme.color}14`, marginBottom: '0.85rem' }} />

        {/* Bottom row: reward + entry / lock reason / result */}
        {isCompleted ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#5a5855' }}>
              Voyage complete
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: theme.color }}>
              +{earnedDoubloons.toLocaleString()} ⟡
            </p>
          </div>
        ) : isFailed ? (
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#4a4845' }}>
            View results
          </p>
        ) : voyageBlocked ? (
          <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#4a4845' }}>
            Crew is on a voyage
          </p>
        ) : isLocked ? (
          <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#4a4845' }}>
            {lockReason}
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginBottom: 1 }}>
                Base reward
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: theme.color }}>
                ~{config.baseDoubloons.toLocaleString()} ⟡
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginBottom: 1 }}>
                Entry cost
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#8a8880' }}>
                {config.entryCost.toLocaleString()} ⟡
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
