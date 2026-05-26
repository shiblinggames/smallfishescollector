'use client'

// Preview wrapper for the new turn-based raid combat.
// Runs against the existing enemy sequence + boss, but does NOT touch any
// server state (no XP, no loot, no kill records). Pure playtest sandbox.

import { useState } from 'react'
import RaidCombat from '../RaidCombat'
import { BossRaidConfig } from '@/lib/bossRaids'
import { RaidPlayerStats } from '../actions'

export default function TurnBasedRaidPreview({ config, stats }: {
  config: BossRaidConfig
  stats: RaidPlayerStats
}) {
  const [round, setRound] = useState(0)        // index into the rotating sequence; boss every sequence.length+1 rounds
  const [playerHp, setPlayerHp] = useState(stats.playerHPMax)
  const [outcome, setOutcome] = useState<'idle' | 'playing' | 'won' | 'lost' | 'cleared'>('idle')
  const [encounterKey, setEncounterKey] = useState(0)  // forces RaidCombat to remount per encounter

  const cycleLen = config.sequence.length + 1
  const isBoss = round % cycleLen === config.sequence.length
  const enemyId = isBoss ? config.bossId : config.sequence[round % cycleLen]
  const enemy = config.enemies[enemyId]

  function startRaid() {
    setPlayerHp(stats.playerHPMax)
    setRound(0)
    setOutcome('playing')
    setEncounterKey(k => k + 1)
  }

  function handleEnemyDefeated(remainingHp: number) {
    setPlayerHp(remainingHp)
    if (isBoss) {
      setOutcome('won')
      return
    }
    // Advance to next enemy
    setRound(r => r + 1)
    setEncounterKey(k => k + 1)
  }

  function handlePlayerDefeated() {
    setOutcome('lost')
  }

  if (outcome === 'idle') {
    return (
      <div style={{ background: '#060c14', border: '1px solid #2a3548', borderRadius: 18, padding: '1.2rem 1rem', textAlign: 'center' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', marginBottom: 8 }}>
          Ready to playtest?
        </p>
        <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#a8b8d0', lineHeight: 1.55, marginBottom: 14 }}>
          You&apos;ll fight through the same enemy lineup as the real raid (Reef Raider × 2, Crow&apos;s Nest × 2, Saltwater Corsair × 2, then Barnacle Pete), but using the new turn-based system. Win or lose here doesn&apos;t affect your real stats.
        </p>
        <StatGrid stats={stats} />
        <button
          onClick={startRaid}
          className="font-cinzel font-700 mt-4"
          style={{
            width: '100%', padding: '0.9rem', borderRadius: 999,
            background: '#4ade80', color: '#0a1422',
            border: 'none', fontSize: '0.92rem', cursor: 'pointer',
          }}
        >
          Begin Preview Raid
        </button>
      </div>
    )
  }

  if (outcome === 'won' || outcome === 'lost') {
    return (
      <div style={{ background: '#060c14', border: '1px solid #2a3548', borderRadius: 18, padding: '1.2rem 1rem', textAlign: 'center' }}>
        <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{
          fontSize: '0.6rem', color: outcome === 'won' ? '#fbbf24' : '#ef4444', marginBottom: 6,
        }}>
          {outcome === 'won' ? '⚓ Raid Complete' : '☠ You Were Sunk'}
        </p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8', marginBottom: 8 }}>
          {outcome === 'won' ? "Barnacle Pete defeated!" : `Your ship went down on round ${round + 1}.`}
        </p>
        <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a8b8d0', marginBottom: 14 }}>
          {outcome === 'won' ? 'Loot is skipped in preview mode — no rewards granted.' : 'No HP lost in your real save.'}
        </p>
        <button
          onClick={startRaid}
          className="font-karla font-700 uppercase tracking-[0.14em]"
          style={{
            width: '100%', padding: '0.85rem', borderRadius: 999,
            background: '#1c2540', color: '#a8b8d0',
            border: '2px solid #3a4a78', fontSize: '0.74rem', cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.25rem 0.5rem' }}>
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#7a8aa0' }}>
          Round {round + 1}
        </p>
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: isBoss ? '#fbbf24' : '#7a8aa0' }}>
          {isBoss ? 'BOSS' : 'WAVE'}
        </p>
      </div>
      <RaidCombat
        key={encounterKey}
        enemy={enemy}
        isBoss={isBoss}
        shipImageUrl={stats.shipImageUrl}
        shipName={stats.shipName}
        playerHpMax={stats.playerHPMax}
        playerHp={playerHp}
        shipMinDamage={stats.shipMinDamage}
        shipSpeed={stats.shipSpeed}
        totalPower={stats.totalPower}
        totalNavigation={stats.totalDodge}
        equippedRaidItems={stats.equippedRaidItems}
        onEnemyDefeated={handleEnemyDefeated}
        onPlayerDefeated={handlePlayerDefeated}
      />
    </div>
  )
}

function StatGrid({ stats }: { stats: RaidPlayerStats }) {
  const items: { label: string; value: string | number }[] = [
    { label: 'HP',       value: stats.playerHPMax },
    { label: 'Min Dmg',  value: stats.shipMinDamage },
    { label: 'Speed',    value: stats.shipSpeed },
    { label: 'Power',    value: stats.totalPower },
    { label: 'Agility',  value: stats.totalDodge },
    { label: 'Fortune',  value: stats.totalFortune },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
      {items.map(it => (
        <div key={it.label} style={{ padding: '0.45rem 0.4rem', background: '#04080e', border: '1px solid #2a3548', borderRadius: 10 }}>
          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#7a8aa0', marginBottom: 2 }}>{it.label}</p>
          <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f0ede8', lineHeight: 1 }}>{it.value}</p>
        </div>
      ))}
    </div>
  )
}
