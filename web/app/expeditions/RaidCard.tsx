'use client'

import { useRouter } from 'next/navigation'

const PETE_PORTRAIT  = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/enemy-arts/barnacle_pete.png'
const BRUTE_IMG      = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/enemy-arts/enemytier1.png'

interface Props {
  navLevel: number
  hasCompletedPracticeRaid: boolean
}

export default function RaidCard({ navLevel, hasCompletedPracticeRaid }: Props) {
  const router = useRouter()
  const mainLocked = !hasCompletedPracticeRaid

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* ── Practice Raid ───────────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push('/raids/practice')}
        onKeyDown={(e) => e.key === 'Enter' && router.push('/raids/practice')}
        style={{
          position: 'relative',
          background: 'linear-gradient(135deg, rgba(10,20,14,1) 0%, rgba(6,14,10,1) 100%)',
          border: '1px solid rgba(74,222,128,0.18)',
          borderRadius: 16,
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
          userSelect: 'none',
        }}
      >
        <div aria-hidden style={{
          position: 'absolute', top: 0, right: 0, width: 120, height: 120,
          background: 'radial-gradient(circle at top right, rgba(74,222,128,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ padding: '1.1rem 1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.7rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                background: 'rgba(74,222,128,0.1)',
                border: '1px solid rgba(74,222,128,0.22)',
                overflow: 'hidden',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={BRUTE_IMG} alt="Reef Raider" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'bottom', filter: 'hue-rotate(180deg) brightness(0.8)', transform: 'scaleX(-1)' }} />
              </div>
              <div>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8', lineHeight: 1.2 }}>
                  Reef Skirmish
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 3 }}>
                  <span
                    className="font-karla font-700 uppercase tracking-[0.08em]"
                    style={{
                      fontSize: '0.48rem',
                      color: hasCompletedPracticeRaid ? '#4ade80' : '#f0c040',
                      background: hasCompletedPracticeRaid ? 'rgba(74,222,128,0.15)' : 'rgba(240,192,64,0.15)',
                      border: `1px solid ${hasCompletedPracticeRaid ? 'rgba(74,222,128,0.3)' : 'rgba(240,192,64,0.3)'}`,
                      borderRadius: 4,
                      padding: '0.15rem 0.4rem',
                    }}
                  >
                    {hasCompletedPracticeRaid ? 'Skirmish' : 'Tutorial'}
                  </span>
                  <span className="font-karla" style={{ fontSize: '0.62rem', color: '#4a4845' }}>
                    Reef Raider
                  </span>
                </div>
              </div>
            </div>
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{
              fontSize: '0.5rem', color: '#4ade80', flexShrink: 0, marginTop: 2,
              background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)',
              borderRadius: 6, padding: '0.25rem 0.5rem',
            }}>
              Enter →
            </span>
          </div>

          <p className="font-karla" style={{ fontSize: '0.73rem', color: '#7a7875', lineHeight: 1.55, marginBottom: '0.85rem' }}>
            {hasCompletedPracticeRaid
              ? 'A random enemy from the corsair fleet. Farm skirmishes to earn Navigation XP and doubloons.'
              : 'Face a single Reef Raider and learn the broadside system. Complete this once to unlock The Corsair\'s Reckoning.'}
          </p>

          <div style={{ height: 1, background: 'rgba(74,222,128,0.1)', marginBottom: '0.85rem' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginBottom: 1 }}>Reward</p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#4ade80' }}>+{hasCompletedPracticeRaid ? '20–35' : '20'} ⟡ · +25 XP</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginBottom: 1 }}>Difficulty</p>
              <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#8a8880' }}>Easy</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Corsair's Reckoning ──────────────────────────────────────────────── */}
      <div
        role={mainLocked ? undefined : 'button'}
        tabIndex={mainLocked ? undefined : 0}
        onClick={() => { if (!mainLocked) router.push('/raids') }}
        onKeyDown={(e) => e.key === 'Enter' && !mainLocked && router.push('/raids')}
        style={{
          position: 'relative',
          background: 'linear-gradient(135deg, rgba(26,10,6,1) 0%, rgba(16,6,4,1) 100%)',
          border: `1px solid ${mainLocked ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.22)'}`,
          borderRadius: 16,
          overflow: 'hidden',
          cursor: mainLocked ? 'default' : 'pointer',
          opacity: mainLocked ? 0.55 : 1,
          transition: 'opacity 0.15s, border-color 0.15s',
          userSelect: 'none',
        }}
      >
        <div aria-hidden style={{
          position: 'absolute', top: 0, right: 0, width: 120, height: 120,
          background: 'radial-gradient(circle at top right, rgba(249,115,22,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ padding: '1.1rem 1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.7rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                background: 'rgba(249,115,22,0.12)',
                border: '1px solid rgba(249,115,22,0.25)',
                overflow: 'hidden',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={PETE_PORTRAIT} alt="Barnacle Pete" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8', lineHeight: 1.2 }}>
                  The Corsair&apos;s Reckoning
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 3 }}>
                  <span
                    className="font-karla font-700 uppercase tracking-[0.08em]"
                    style={{
                      fontSize: '0.48rem',
                      color: '#f97316',
                      background: 'rgba(249,115,22,0.18)',
                      border: '1px solid rgba(249,115,22,0.35)',
                      borderRadius: 4,
                      padding: '0.15rem 0.4rem',
                    }}
                  >
                    Boss Raid
                  </span>
                  <span className="font-karla" style={{ fontSize: '0.62rem', color: '#4a4845' }}>
                    Barnacle Pete
                  </span>
                </div>
              </div>
            </div>
            {mainLocked ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3a3835" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            ) : (
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{
                fontSize: '0.5rem', color: '#f97316', flexShrink: 0, marginTop: 2,
                background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)',
                borderRadius: 6, padding: '0.25rem 0.5rem',
              }}>
                Enter →
              </span>
            )}
          </div>

          <p className="font-karla" style={{ fontSize: '0.73rem', color: '#7a7875', lineHeight: 1.55, marginBottom: '0.85rem' }}>
            The notorious Barnacle Pete and his corsair fleet have been spotted off the coast. Fire your cannons, survive the broadside, and bring him to justice — dead or alive.
          </p>

          <div style={{ height: 1, background: 'rgba(249,115,22,0.14)', marginBottom: '0.85rem' }} />

          {mainLocked ? (
            <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#4a4845' }}>
              Complete the Reef Skirmish tutorial to unlock
            </p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginBottom: 1 }}>Plunder</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f97316' }}>300–900 ⟡</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginBottom: 1 }}>Recommended</p>
                <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#8a8880' }}>50+ Raid Score</p>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
