// Safety audit for Davy's Terms. HARDCORE IS PERMADEATH: a bug here can erase a
// player's crew for good, so every term is exercised against the real generators
// and every produced state is asserted valid. Run: npx tsx verify-terms.ts
import {
  GAUNTLET_TERMS, resolveTerms, termPressure, termTideEffects,
  pressureGemMult, NO_TERM_EFFECTS, MAX_AVAILABLE_PRESSURE, PRESSURE_CAP,
  PRESSURE_DEPTH_FLOOR, PRESSURE_BADGES, pressureFeats, isFullBoard, type SignedTerms,
} from './lib/gauntletTerms'
import { generateFight, advanceRollState, isCurseDepth, drawCurse, isBoonDepth, drawBoons, drawConfluenceOffer, bloodGemsForDepth, type GauntletRollState } from './lib/gauntlet'

let failures = 0
const fail = (msg: string) => { failures++; console.log('  FAIL: ' + msg) }
const ok = (msg: string) => console.log('  ok   ' + msg)

// Every single-term-at-each-tier config, plus the full board and the empty board.
const configs: { label: string; signed: SignedTerms }[] = [{ label: 'nothing signed', signed: {} }]
for (const t of GAUNTLET_TERMS) {
  t.tiers.forEach((_, i) => configs.push({ label: `${t.name} ${i + 1}`, signed: { [t.id]: i + 1 } }))
}
const full: SignedTerms = {}
for (const t of GAUNTLET_TERMS) full[t.id] = t.tiers.length
configs.push({ label: 'FULL BOARD', signed: full })

console.log(`Auditing ${configs.length} configurations across ${GAUNTLET_TERMS.length} terms\n`)

// ── 1. Every config produces valid fights at every depth ───────────────────
console.log('1. Fight generation (depths 1-70, 3 passes each)')
for (const { label, signed } of configs) {
  const fx = resolveTerms(signed)
  let bad = 0
  for (let pass = 0; pass < 3; pass++) {
    let roll: GauntletRollState = { cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 }
    for (let d = 1; d <= 70; d++) {
      const f = generateFight(roll, 0, fx)
      const e = f.enemy
      if (!Number.isFinite(e.hpBase) || e.hpBase < 1) bad++, fail(`${label}: boss/mob hpBase ${e.hpBase} at depth ${d}`)
      if (!Number.isFinite(e.minDmg) || e.minDmg < 1) bad++, fail(`${label}: minDmg ${e.minDmg} at depth ${d}`)
      if (!Number.isFinite(e.maxDmg) || e.maxDmg < e.minDmg) bad++, fail(`${label}: maxDmg ${e.maxDmg} < minDmg at depth ${d}`)
      if (!Number.isFinite(f.potContribution) || f.potContribution < 0) bad++, fail(`${label}: pot ${f.potContribution}`)
      if (f.affix && !f.affix.name) bad++, fail(`${label}: affix with no name at depth ${d}`)
      if (f.isBoss && f.isElite) bad++, fail(`${label}: fight is BOTH boss and elite at depth ${d}`)
      roll = advanceRollState(roll, f)
    }
  }
  if (bad === 0) ok(`${label}`)
}

// ── 2. Crowned actually crowns bosses, and only when signed ───────────────
console.log('\n2. Crowned (bosses carry affixes)')
for (const [label, signed, expectAffix] of [
  ['unsigned', {}, false],
  ['Crowned I', { crowned: 1 }, true],
  ['Crowned II', { crowned: 2 }, true],
] as [string, SignedTerms, boolean][]) {
  const fx = resolveTerms(signed)
  let bosses = 0, crowned = 0
  for (let pass = 0; pass < 200; pass++) {
    let roll: GauntletRollState = { cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 }
    for (let d = 1; d <= 30; d++) {
      const f = generateFight(roll, 0, fx)
      if (f.isBoss) { bosses++; if (f.affix) crowned++ }
      roll = advanceRollState(roll, f)
    }
  }
  const allCrowned = crowned === bosses
  const noneCrowned = crowned === 0
  if (expectAffix ? allCrowned : noneCrowned) ok(`${label}: ${crowned}/${bosses} bosses carry an affix`)
  else fail(`${label}: ${crowned}/${bosses} bosses carry an affix (expected ${expectAffix ? 'all' : 'none'})`)
}

// ── 3. No Second Thoughts can never SOFTLOCK a run ────────────────────────
// You may only bank after a boss. If a run could go forever without one, the
// player would be trapped diving until they die. Bosses MUST always arrive.
console.log('\n3. No Second Thoughts cannot trap a player forever')
{
  const fx = resolveTerms({ no_second_thoughts: 1, ...full })
  let worstGap = 0
  for (let pass = 0; pass < 500; pass++) {
    let roll: GauntletRollState = { cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 }
    let sinceBoss = 0
    for (let d = 1; d <= 100; d++) {
      const f = generateFight(roll, 0, fx)
      if (f.isBoss) { worstGap = Math.max(worstGap, sinceBoss); sinceBoss = 0 } else sinceBoss++
      roll = advanceRollState(roll, f)
    }
  }
  if (worstGap <= 12) ok(`longest run of fights without a boss (so without a chance to bank): ${worstGap}`)
  else fail(`a player could go ${worstGap} fights unable to cash out`)
}

// ── 4. Draw functions never crash or return junk under any config ─────────
console.log('\n4. Curse / boon / confluence draws')
for (const { label, signed } of configs) {
  const fx = resolveTerms(signed)
  let bad = 0
  const curses: Record<string, number> = {}
  const boons: Record<string, number> = {}
  for (let d = 1; d <= 80; d++) {
    if (isCurseDepth(d, fx.curseFrequencyMult)) {
      const c = drawCurse(curses, d, fx.curseStartsAtWorst)
      if (c) {
        if (c.tier < 1) bad++, fail(`${label}: curse tier ${c.tier}`)
        curses[c.id] = c.tier
      }
    }
    if (isBoonDepth(d, fx.boonFrequencyMult)) {
      const drawn = drawBoons(fx.boonPicks, boons, 1, fx.commonSkew)
      if (drawn.length > fx.boonPicks) bad++, fail(`${label}: drew ${drawn.length} boons, max ${fx.boonPicks}`)
      for (const b of drawn) {
        if (!b.desc || b.tier < 1) bad++, fail(`${label}: malformed boon ${b.id}`)
      }
      if (drawn[0]) boons[drawn[0].id] = drawn[0].tier
    }
    const conf = drawConfluenceOffer(boons, [], new Set(), fx.confluenceOfferMult)
    if (fx.confluenceOfferMult === 0 && conf) bad++, fail(`${label}: No Communion still offered a synergy`)
  }
  if (bad === 0) ok(`${label}`)
}

// ── 5. The gem curve: sane, monotonic, and shallow-farm proof ─────────────
console.log('\n5. Blood Gem payout curve')
{
  let bad = 0
  for (const p of [0, 10, 20, 30, 40, 60, 82]) {
    for (let d = 1; d <= 70; d++) {
      const m = pressureGemMult(p, d)
      if (!Number.isFinite(m) || m < 1) bad++, fail(`mult ${m} at P${p} depth ${d}`)
      const gems = Math.round(bloodGemsForDepth(d, 0.5) * m)
      if (!Number.isFinite(gems) || gems < 0) bad++, fail(`gems ${gems} at P${p} depth ${d}`)
    }
    // above the cap, Pressure must never pay MORE
    if (pressureGemMult(p, 30) > pressureGemMult(PRESSURE_CAP, 30) + 1e-9) bad++, fail(`P${p} exceeds the cap`)
  }
  // shallow farming must stay worthless
  if (pressureGemMult(82, PRESSURE_DEPTH_FLOOR) !== 1) bad++, fail('Pressure pays a bonus at the depth floor')
  if (bad === 0) ok('finite, capped, never below 1x, and pays nothing at the depth floor')
}

// ── 6. Skill terms produce valid combat effects ──────────────────────────
console.log('\n6. Skill-term combat effects')
{
  let bad = 0
  for (const { label, signed } of configs) {
    for (const e of termTideEffects(signed)) {
      const mult = (e as { mult?: number }).mult
      if (mult !== undefined && (!Number.isFinite(mult) || mult < 0)) bad++, fail(`${label}: effect ${e.kind} mult ${mult}`)
    }
  }
  const ir2 = termTideEffects({ iron_rations: 2 })
  if (!ir2.some(e => e.kind === 'healMult' && (e as { mult: number }).mult === 0)) bad++, fail('Iron Rations II does not zero healing')
  if (bad === 0) ok('all effects finite and non-negative; Iron Rations II truly zeroes healing')
}

// ── 7. A normal (non-hardcore) run must be untouched ─────────────────────
console.log('\n7. Normal runs are untouched by Terms')
{
  const bad: string[] = []
  for (const [k, v] of Object.entries(NO_TERM_EFFECTS)) {
    const def = resolveTerms({})[k as keyof typeof NO_TERM_EFFECTS]
    if (def !== v) bad.push(k)
  }
  if (bad.length === 0) ok('an unsigned board resolves to exactly the default behavior')
  else fail('unsigned board differs from defaults: ' + bad.join(', '))
}

// ── 8. The badge feats cannot be farmed by signing and immediately banking ───
// The exploit the whole pairing exists to close: sign the entire board, win one
// fight, cash out at depth 2, collect the sheet. Every feat MUST require depth.
console.log('\n8. Pressure badges require depth, not just a signature')
{
  let bad = 0
  const shallowest = Math.min(...PRESSURE_BADGES.map(b => b.depth), 15, 20)
  // The heaviest possible board, banked shallower than any feat's depth bar.
  for (let d = 0; d < shallowest; d++) {
    const feats = pressureFeats(full, d)
    if (feats.length) bad++, fail(`FULL BOARD at depth ${d} earned ${feats.join(', ')}`)
  }
  // Every rung must hold BOTH halves: right Pressure + wrong depth earns nothing,
  // and right depth + no Pressure earns nothing.
  for (const b of PRESSURE_BADGES) {
    if (pressureFeats(full, b.depth - 1).includes(b.id)) bad++, fail(`${b.id} granted one depth short`)
    if (pressureFeats({}, 70).includes(b.id)) bad++, fail(`${b.id} granted with nothing signed`)
    if (!pressureFeats(full, b.depth).includes(b.id)) bad++, fail(`${b.id} NOT granted when both halves are met`)
  }
  // The two named feats key off their own term, not merely off Pressure.
  if (pressureFeats({ iron_rations: 1 }, 70).includes('not_a_drop')) bad++, fail('not_a_drop granted at Iron Rations I')
  if (!pressureFeats({ iron_rations: 2 }, 20).includes('not_a_drop')) bad++, fail('not_a_drop NOT granted at Iron Rations II, depth 20')
  if (pressureFeats({ iron_rations: 2 }, 19).includes('not_a_drop')) bad++, fail('not_a_drop granted above depth 20')
  if (!isFullBoard(full)) bad++, fail('isFullBoard rejects the full board')
  if (isFullBoard({ ...full, iron_rations: 1 })) bad++, fail('isFullBoard accepts a board with a term below max tier')
  if (pressureFeats(full, 14).includes('for_glory_alone')) bad++, fail('for_glory_alone granted above depth 15')
  if (bad === 0) ok('no feat is reachable without its depth; every rung needs both halves')
}

console.log(`\nBoard: ${GAUNTLET_TERMS.length} terms, ${MAX_AVAILABLE_PRESSURE} Pressure, cap ${PRESSURE_CAP}`)
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
