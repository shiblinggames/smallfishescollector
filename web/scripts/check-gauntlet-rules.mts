// THE GAUNTLET SETTLES WHAT THE GAME PROMISES (Steam prep, Phase B).
//
// Runs lib/gauntletRules:
//   - a depth is held against the run clock and the depth cap, and the combat
//     depth may lead it by the Veteran's Start head start and no more;
//   - the same seed cashes out the same haul;
//   - a normal Davy run never pays a hardcore chase or Blood Gems, a Don's run
//     never pays Davy's cannons, and nothing already owned drops again;
//   - the reported pot is clamped, pay stops at the reward-depth cap, and
//     Davy's Offer is honoured only at the depth he made it;
//   - Pressure moves Blood Gems and nothing else;
//   - the Fence tab never turns Fathoms negative;
//   - the record claim, the cooldown, the run clock's gap cap and the Don's feats.
//
//   npx tsx scripts/check-gauntlet-rules.mts

import { settleDepths, runFathoms, cashOutHaul, recordClaim, donFeats, gauntletCooldown, tickActiveMs, shrineWon, MIN_MS_PER_DEPTH, ACTIVE_GAP_CAP_MS, type CashOutInput } from '../lib/gauntletRules'
import { MAX_GAUNTLET_DEPTH, GAUNTLET_REWARD_DEPTH_CAP, GAUNTLET_COOLDOWN_MS, maxPotForDepth, BLOOD_CANNON_ITEM_ID, BLOOD_HULL_SKIN_ID, DONS_GAUNTLET_ITEM_IDS, GOLD_HULL_SKIN_ID, GALAXY_HULL_SKIN_ID } from '../lib/gauntlet'
import { PRESSURE_SKIN_ID, GAUNTLET_TERMS } from '../lib/gauntletTerms'
import { DAVY_FORGE } from '../lib/raidItems'
import { withRng, mulberry32 } from '../lib/rng'
import { withClock } from '../lib/clock'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }

// ── Depths ──
const lots = 10_000_000
if (settleDepths(40, 40, 10 * MIN_MS_PER_DEPTH, []).rd !== 10) fail('the run clock did not hold the depth')
if (settleDepths(500, 500, lots, []).rd !== MAX_GAUNTLET_DEPTH) fail('a depth passed the cap')
if (settleDepths(-3, 0, lots, []).rd !== 0) fail('a negative depth paid')
{
  const plain = settleDepths(10, 30, lots, [])
  const vet = settleDepths(10, 30, lots, ['veterans_start'])
  if (plain.cd !== 10) fail(`without a head start the combat depth led by ${plain.cd - 10}`)
  if (vet.cd !== 14) fail(`Veteran's Start let the combat depth lead by ${vet.cd - 10}, not 4`)
  if (settleDepths(10, 2, lots, ['veterans_start']).cd !== 10) fail('the combat depth fell below the reward depth')
}

// ── Fathoms ──
if (runFathoms(20, 'davy', [], { fenceSpent: 1e9 }) !== 0) fail('the Fence tab turned Fathoms negative')
if (runFathoms(20, 'davy', [], { fenceSpent: 5 }) !== runFathoms(20, 'davy', []) - 5) fail('the Fence tab was not taken off the dive')

// ── The haul ──
const base: CashOutInput = {
  variant: 'davy', hc: false, rd: 30, cd: 30, pot: 1e9, owned: [], off: [], accountUpgrades: [],
  offerState: null, takeOffer: false, terms: null, ownedItems: [], ownedSkins: [], totalFortune: 400,
  shipClasses: null, navRenownAlloc: null, prevHcDeepest: 0, prevDeepest: 0, fenceSpent: 0,
}
const haul = (over: Partial<CashOutInput> = {}) => cashOutHaul({ ...base, ...over })

const a = withRng(mulberry32(91), () => JSON.stringify(Array.from({ length: 40 }, () => haul({ hc: true, rd: 60, cd: 60 }))))
const b = withRng(mulberry32(91), () => JSON.stringify(Array.from({ length: 40 }, () => haul({ hc: true, rd: 60, cd: 60 }))))
if (a !== b) fail('the same seed cashed out a different haul')

const hcOnly = [BLOOD_CANNON_ITEM_ID, BLOOD_HULL_SKIN_ID, PRESSURE_SKIN_ID]
const heavy = Object.fromEntries(GAUNTLET_TERMS.map(t => [t.id, t.tiers.length]))
withRng(mulberry32(93), () => {
  let davyCannons = 0
  let ownedGearAgain = 0
  for (let k = 0; k < 4000; k++) {
    const n = haul({ rd: 70, cd: 70, terms: heavy })
    if ([...n.droppedItems, ...n.grantSkins].some(id => hcOnly.includes(id)) || n.earnedBloodGems !== 0) { fail('a normal run paid a hardcore chase or Blood Gems'); break }
    davyCannons += n.droppedItems.length
    const d = haul({ variant: 'don', rd: 70, cd: 70 })
    if (d.droppedItems.some(id => (DAVY_FORGE.components as readonly string[]).includes(id))) { fail("a Don's run dropped Davy's cannon"); break }
    // An owned SKIN (an unlock) never drops again. Owned GEAR does, at its own
    // fixed rate: copies are allowed (Kong, 2026-09-30).
    const owned = haul({ hc: true, rd: 70, cd: 70, ownedItems: [...DAVY_FORGE.components, BLOOD_CANNON_ITEM_ID, ...DONS_GAUNTLET_ITEM_IDS], ownedSkins: [...hcOnly, GOLD_HULL_SKIN_ID, GALAXY_HULL_SKIN_ID] })
    if (owned.droppedSkinId || owned.droppedHcSkinId || owned.droppedPressureSkinId) { fail('a skin already owned dropped again'); break }
    ownedGearAgain += owned.droppedItems.length
  }
  if (davyCannons === 0) fail("Davy's cannons never dropped in 4000 deep runs, so the chase check tests nothing")
  if (ownedGearAgain === 0) fail('owned gear never dropped again, though its rate should not depend on holding it')
})

// Pot, the pay cap, the offer.
{
  const n = withRng(mulberry32(95), () => haul({ rd: 20, cd: 20, pot: 1e12 }))
  const cap = withRng(mulberry32(95), () => haul({ rd: 20, cd: 20, pot: maxPotForDepth(20, 'davy') }))
  if (n.bankedDoubloons !== cap.bankedDoubloons) fail('a pot above the ceiling was paid')
  const atCap = withRng(mulberry32(97), () => haul({ rd: GAUNTLET_REWARD_DEPTH_CAP, cd: GAUNTLET_REWARD_DEPTH_CAP }))
  const past = withRng(mulberry32(97), () => haul({ rd: GAUNTLET_REWARD_DEPTH_CAP + 20, cd: GAUNTLET_REWARD_DEPTH_CAP + 20 }))
  if (past.bankedXp !== atCap.bankedXp || past.gems !== atCap.gems || past.crewXp !== atCap.crewXp) fail('pay kept climbing past the reward-depth cap')
  if (past.deepest !== GAUNTLET_REWARD_DEPTH_CAP + 20) fail('the record stopped at the pay cap')
  const offer = { depth: 30, kind: 'coin', tier: 2 } as never
  const taken = haul({ offerState: { live: offer } as never, takeOffer: true })
  const stale = haul({ rd: 31, cd: 31, offerState: { live: offer } as never, takeOffer: true })
  if (!taken.offerTaken) fail("Davy's Offer was refused at its own depth")
  if (stale.offerTaken) fail("Davy's Offer was carried to a deeper pot")
}

// Pressure: Blood Gems and nothing else.
{
  const clean = withRng(mulberry32(99), () => haul({ hc: true, rd: 60, cd: 60 }))
  const heavyRun = withRng(mulberry32(99), () => haul({ hc: true, rd: 60, cd: 60, terms: heavy }))
  if (heavyRun.runPressure <= 0) fail('the full board carried no Pressure')
  if (heavyRun.bankedDoubloons !== clean.bankedDoubloons || heavyRun.bankedXp !== clean.bankedXp || heavyRun.earnedFathoms !== clean.earnedFathoms || heavyRun.gems !== clean.gems)
    fail('Pressure moved something other than Blood Gems')
  if (heavyRun.earnedBloodGems <= clean.earnedBloodGems) fail('Pressure did not lift Blood Gems at depth 60')
}

// ── Records, cooldown, clock, feats ──
if (recordClaim(20, 5000, 19, 1) !== 'deeper') fail('a deeper finish did not claim')
if (recordClaim(20, 5000, 20, 6000) !== 'faster') fail('a faster finish at the same depth did not improve the time')
if (recordClaim(20, 7000, 20, 6000) !== null || recordClaim(20, null, 1, null) !== null) fail('a slower or untimed finish claimed')
const last = '2026-09-28T00:00:00.000Z', t0 = Date.parse(last)
if (withClock(t0 + GAUNTLET_COOLDOWN_MS - 1, () => gauntletCooldown(last, false).available)) fail('the gauntlet reopened early')
if (!withClock(t0 + GAUNTLET_COOLDOWN_MS, () => gauntletCooldown(last, false).available)) fail('the gauntlet did not reopen on time')
if (!withClock(t0 + 1, () => gauntletCooldown(last, true).available)) fail('an admin was held by the cooldown')
if (withClock(t0 + 3_600_000, () => tickActiveMs(100, last).gauntlet_run_active_ms) !== 100 + ACTIVE_GAP_CAP_MS) fail('a walked-away gap was counted in full')
if (withClock(t0 + 1000, () => tickActiveMs(0, last, { stop: true })).gauntlet_run_tick_at !== null) fail('a stopped clock kept running')
const snap = (shots: number, megas: number, dmgTaken: number, curses = 0) => ({ stats: { shots, megas, dmgTaken }, curses: Object.fromEntries(Array.from({ length: curses }, (_, k) => [`c${k}`, 1])) }) as never
if (donFeats(snap(4, 4, 0, 5), 30).sort().join() !== 'ultimate_only,untouched,weight_of_green') fail('the Don feats missed one')
if (donFeats(snap(4, 3, 1, 4), 30).length !== 0 || donFeats(undefined, 90).length !== 0) fail('a Don feat was given for nothing')
let heads = 0
withRng(mulberry32(101), () => { for (let k = 0; k < 40_000; k++) if (shrineWon()) heads++ })
if (Math.abs(heads / 40_000 - 0.5) > 0.01) fail(`the shrine's coin landed ${heads / 400}% heads`)

console.log(`\n  Gauntlet rules: depths, the haul, chases, caps, the offer, Pressure, records and the clock ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
