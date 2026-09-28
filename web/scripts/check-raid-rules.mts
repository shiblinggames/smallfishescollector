// A RAID PAYS WHAT THE GAME PROMISES (Steam prep, Phase B).
//
// Runs lib/raidRules against every raid in the registry and every dice and
// damage-check node on the map:
//   - every round of every raid pays its own killRewards line, the boss adds
//     the full-clear bonus, and a round past the boss pays nothing;
//   - a gold class scales gold and never Nav XP;
//   - the same seed opens the same crate, owned uniques never drop, a gem row
//     pays no coin, and the coin claim is clamped and flagged;
//   - the clear records (an admin never takes the global one);
//   - the map gates, the dice (the bonus cap, a purse never below zero, a fair
//     d20), and the damage check (the shot lands in range, the preview's odds
//     are the shot's odds).
//
//   npx tsx scripts/check-raid-rules.mts

import { raidKillReward, rollRaidCrate, clearTimes, mapNodeRefusal, throwDice, dpsShot, dpsPreview } from '../lib/raidRules'
import { ALL_RAIDS, ITEM_GRANTS, MAX_CRATE_BASE_DOUBLOONS } from '../lib/raidRegistry'
import { raidCompletionBonusXp } from '../lib/bossRaids'
import { RAID_MAP } from '../lib/raidMap'
import type { RaidPlayerStats } from '../lib/raidPlayerStats'
import { withRng, mulberry32 } from '../lib/rng'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }

// ── Kills ──
for (const c of ALL_RAIDS) {
  for (let r = 0; r <= c.sequence.length; r++) {
    const pay = raidKillReward(c, r, null, null)
    const boss = r === c.sequence.length
    const line = c.killRewards[boss ? c.bossId : c.sequence[r]]
    if (!pay) { fail(`${c.raidId} round ${r} paid nothing`); break }
    if (pay.xp !== (line?.xp ?? 0) + (boss ? raidCompletionBonusXp(c) : 0) || pay.doubloons !== (line?.gold ?? 0)) { fail(`${c.raidId} round ${r} did not pay its own line`); break }
    const helm = raidKillReward(c, r, { 1: 'helmsman' }, null)!
    if (helm.xp !== pay.xp || helm.doubloons !== Math.round((line?.gold ?? 0) * 1.25)) { fail(`${c.raidId}: the Helmsman scaled the wrong thing`); break }
  }
  if (raidKillReward(c, c.sequence.length + 1, null, null) !== null || raidKillReward(c, -1, null, null) !== null || raidKillReward(c, 0.5, null, null) !== null) fail(`${c.raidId} paid a round that does not exist`)
}

// ── Crates ──
const stats = (owned: string[] = []) => ({ shipSkins: owned, ownedRaidItems: owned, ownedSpecialItems: owned, legendaryLootMult: 1, totalFortune: 200 })
const looted = ALL_RAIDS.filter(c => !c.skirmish && c.loot.length > 0)
if (looted.length === 0) fail('no raid has a crate to test')
for (const c of looted) {
  const open = (seed: number, owned: string[] = [], base = 800) => withRng(mulberry32(seed), () => rollRaidCrate({ raidId: c.raidId, config: c, stats: stats(owned), baseDoubloons: base, shipClasses: null }))
  if (JSON.stringify(open(121)) !== JSON.stringify(open(121))) fail(`${c.raidId}: the same seed opened a different crate`)
  const allUniques = c.loot.map(l => l.id)
  const everyGrant = allUniques.flatMap(id => [id, ITEM_GRANTS[id]?.shipSkin, ITEM_GRANTS[id]?.raidItem].filter(Boolean) as string[])
  withRng(mulberry32(123), () => {
    for (let k = 0; k < 400; k++) {
      const r = rollRaidCrate({ raidId: c.raidId, config: c, stats: stats(everyGrant), baseDoubloons: 800, shipClasses: null })
      if (r.itemIds.some(id => ITEM_GRANTS[id]?.shipSkin || ITEM_GRANTS[id]?.raidItem)) { fail(`${c.raidId}: an owned unique dropped again`); break }
      if (r.currencyGems > 0 && r.crateDoubloons !== 0) { fail(`${c.raidId}: a gem row paid coin as well`); break }
    }
  })
  const big = open(125, [], MAX_CRATE_BASE_DOUBLOONS * 10)
  if (!big.capTripped || (big.currencyGems === 0 && big.crateDoubloons !== MAX_CRATE_BASE_DOUBLOONS)) fail(`${c.raidId}: an inflated coin claim was not clamped and flagged`)
  if (open(127, [], -50).crateDoubloons !== 0 || open(127, [], NaN).crateDoubloons !== 0) fail(`${c.raidId}: a negative or broken coin claim paid`)
}

// ── Clears ──
const me = { username: 'me', isAdmin: false }
const first = clearTimes(60_000, null, null, me)
if (!first.isPersonalBest || !first.isGlobalBest || first.globalBestUsername !== 'me') fail('a first clear did not take both records')
const slower = clearTimes(90_000, 60_000, { ms: 50_000, username: 'them' }, me)
if (slower.isPersonalBest || slower.isGlobalBest || slower.yourBestMs !== 60_000 || slower.globalBestMs !== 50_000) fail('a slower clear moved a record')
const adminRun = clearTimes(10_000, null, { ms: 50_000, username: 'them' }, { username: 'boss', isAdmin: true })
if (adminRun.isGlobalBest || adminRun.globalBestUsername !== 'them') fail("an admin's clear took the global record")

// ── The map ──
const dice = RAID_MAP.filter(n => n.type === 'dice' && n.dice)
const dps = RAID_MAP.filter(n => n.type === 'dps_check' && n.dpsCheck)
if (!dice.length || !dps.length) fail('the map has no dice or damage-check node to test')
for (const n of [...dice, ...dps]) {
  const open = { isAdmin: true, cleared: new Set<string>(n.requiresNode ? [n.requiresNode] : []), navLevel: 200 }
  if (mapNodeRefusal(n, open, 'done') !== null) fail(`${n.id} refused a captain who may take it`)
  if (mapNodeRefusal(n, { ...open, cleared: new Set([...open.cleared, n.id]) }, 'done') !== 'done') fail(`${n.id} could be taken twice`)
  if (n.requiresNode && mapNodeRefusal(n, { ...open, cleared: new Set() }, 'done') !== 'Locked') fail(`${n.id} opened before ${n.requiresNode}`)
}
withRng(mulberry32(129), () => {
  for (const n of dice) {
    const d = n.dice!
    const faces = new Array(21).fill(0)
    for (const o of d.options) {
      for (let k = 0; k < 4000; k++) {
        const t = throwDice(d, o, 1000, 0)
        if (t.bonus !== d.maxBonus) { fail(`${n.id}: the Navigation bonus passed its cap`); break }
        if (0 + t.doubloonsDelta < 0) { fail(`${n.id}: a miss took the purse below zero`); break }
        if (t.success !== (t.total >= o.dc)) { fail(`${n.id}: success disagreed with the DC`); break }
        faces[t.roll]++
      }
    }
    const n20 = faces.slice(1).reduce((x, y) => x + y, 0)
    if (faces[0] !== 0 || faces.slice(1).some(f => Math.abs(f / n20 - 0.05) > 0.012)) fail(`${n.id}: the d20 is not fair`)
  }
})
const shotStats = { totalPower: 120, shipMinDamage: 12, raidMods: { damagePct: 0 }, classDamageMult: 1.1, equippedRaidItems: [] } as unknown as RaidPlayerStats
withRng(mulberry32(131), () => {
  for (const n of dps) {
    const th = n.dpsCheck!.threshold
    const pv = dpsPreview(shotStats, th)
    let passes = 0
    const N = 20_000
    for (let k = 0; k < N; k++) {
      const s = dpsShot(shotStats, th)
      if (s.breakdown.roll < pv.rangeMin || s.breakdown.roll > pv.rangeMax) { fail(`${n.id}: a shot landed outside its range`); break }
      if (s.passed) passes++
    }
    // The sheet's odds are the shot's odds (both round roll x mult the same way).
    const real = passes / N * 100
    if (Math.abs(real - pv.passChance) > 1.5) fail(`${n.id}: the preview said ${pv.passChance}% and the shot passed ${real.toFixed(1)}%`)
  }
})

console.log(`\n  Raid rules: kills, crates, clears, the map's gates, the dice and the damage check ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
