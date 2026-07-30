'use client'

/** THE BATTLE LOADOUT HERO.
 *
 *  Everything mounted, added up. The slots below tell you WHAT you are carrying;
 *  this tells you what it actually amounts to, which is the question you came to
 *  the page with.
 *
 *  Every figure here is folded the SAME way combat folds it, checked against the
 *  reducers in RaidCombat and getRaidPlayerStats: multipliers multiply, chances
 *  and rates add. A summary that aggregates differently from the engine is worse
 *  than no summary, because it reads as authoritative.
 */

import { getActiveEffects, type RaidEffectType } from '@/lib/raidItems'

type Stat = { label: string; value: string; hint: string; good: boolean }

/** Multipliers compound (RaidCombat folds them with `a * e.value`). */
const product = (fx: { type: string; value: number }[], t: RaidEffectType) =>
  fx.filter(e => e.type === t).reduce((a, e) => a * e.value, 1)

/** Chances and rates stack (RaidCombat folds them with `a + e.value`). */
const sum = (fx: { type: string; value: number }[], t: RaidEffectType) =>
  fx.filter(e => e.type === t).reduce((a, e) => a + e.value, 0)

const pct = (mult: number) => `${mult >= 1 ? '+' : ''}${Math.round((mult - 1) * 100)}%`
const flat = (n: number) => `+${Math.round(n * 100)}%`

export default function LoadoutSummary({ equippedIds, accent = '#c4b078' }: {
  /** Already charge-tagged, so a levelled spoil counts for what it currently is. */
  equippedIds: string[]
  accent?: string
}) {
  const fx = getActiveEffects(equippedIds)

  const bossDmg = product(fx, 'boss_damage_mult')
  const mobDmg = product(fx, 'nonboss_damage_mult')
  const critDmg = product(fx, 'crit_damage_mult')
  const critUp = sum(fx, 'crit_upgrade_chance')
  const firstShot = product(fx, 'first_shot_mult')
  const lifesteal = sum(fx, 'lifesteal_pct')

  const incoming = product(fx, 'incoming_damage_mult')
  const maxHp = product(fx, 'max_hp_mult')
  const parry = fx.filter(e => e.type === 'parry_chance').reduce((a, e) => Math.max(a, e.value), 0)
  const saves = sum(fx, 'lethal_save')

  // Only what the player actually has. A grid of "+0%" rows reads as broken gear
  // rather than an empty slot, and it buries the two numbers that do matter.
  const offense: Stat[] = [
    { label: 'Boss damage', value: pct(bossDmg), hint: 'on boss rounds', good: bossDmg > 1 },
    { label: 'Mob damage', value: pct(mobDmg), hint: 'everything else', good: mobDmg > 1 },
    { label: 'Critical damage', value: pct(critDmg), hint: 'on a critical', good: critDmg > 1 },
    { label: 'Critical chance', value: flat(critUp), hint: 'clean hits upgrade', good: critUp > 0 },
    { label: 'Opening shot', value: pct(firstShot), hint: 'first shot each fight', good: firstShot > 1 },
    { label: 'Lifesteal', value: flat(lifesteal), hint: 'damage back as hull', good: lifesteal > 0 },
  ].filter(s => s.good)

  const defense: Stat[] = [
    { label: 'Damage taken', value: pct(incoming), hint: 'from every hit', good: incoming !== 1 },
    { label: 'Max hull', value: pct(maxHp), hint: 'at fight start', good: maxHp > 1 },
    { label: 'Parry', value: flat(parry), hint: 'on a dodge', good: parry > 0 },
    { label: 'Lethal saves', value: `${saves}`, hint: saves === 1 ? 'cheats death once' : 'cheat death', good: saves > 0 },
  ].filter(s => s.good)

  const nothing = offense.length === 0 && defense.length === 0

  return (
    <div style={{
      marginBottom: '1.1rem', padding: '0.85rem 0.9rem',
      borderRadius: 14,
      background: 'linear-gradient(160deg, rgba(26,33,46,0.82) 0%, rgba(12,17,26,0.86) 100%)',
      border: `1px solid ${accent}2e`,
      boxShadow: `inset 0 0 26px ${accent}0f`,
    }}>
      <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.26em', color: `${accent}cc`, marginBottom: nothing ? 6 : 10 }}>
        Everything mounted, added up
      </p>

      {nothing ? (
        <p className="font-karla" style={{ fontSize: '0.74rem', color: '#8a8480', lineHeight: 1.45 }}>
          Nothing mounted yet. Fill a slot below and its effects total up here.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([['Offense', offense, '#e0a06a'], ['Defense', defense, '#7fb0d8']] as const).map(([title, stats, hue]) => (
            stats.length === 0 ? null : (
              <div key={title}>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.2em', color: hue, marginBottom: 5, opacity: 0.9 }}>{title}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                  {stats.map(s => (
                    <div key={s.label} style={{
                      display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0,
                      padding: '0.4rem 0.5rem', borderRadius: 9,
                      background: 'rgba(255,255,255,0.035)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}>
                      <span className="font-cinzel font-800" style={{ flexShrink: 0, fontSize: '0.9rem', lineHeight: 1, color: hue, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="font-karla font-700 block" style={{ fontSize: '0.56rem', lineHeight: 1.15, color: '#d8d3ca', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                        <span className="font-karla block" style={{ fontSize: '0.48rem', lineHeight: 1.2, color: '#7f7a72', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.hint}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
