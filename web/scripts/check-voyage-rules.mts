// VOYAGES AND TRAWLS DO WHAT THE GAME PROMISES (Steam prep, Phase B).
//
// Runs lib/voyageRules and lib/trawlRules:
//   - the same seed sails the same voyage;
//   - the route gates and crew minimums refuse what they should;
//   - Coastal and Safe Passage never lose a hand; Swift Sails is 15% off;
//   - a triumph pays more Navigation XP than a plain return, a setback less,
//     and the crew's xp bonus lifts it; lost hands earn nothing;
//   - a special item lands only when not already owned;
//   - a voyage and a trawl are home exactly when their time is up;
//   - a trawl refuses in the published order, and the haul shows up to three
//     different species.
//
//   npx tsx scripts/check-voyage-rules.mts

import { planVoyage, voyagePayout, voyageBack, voyageCrewCap, type VoyagePlan } from '../lib/voyageRules'
import { trawlDeployRefusal, trawlBack, sampleHaulFish, trawlCrewView } from '../lib/trawlRules'
import { ROUTE_PAYOUTS, OUTCOME_MULT } from '../lib/voyageRoll'
import { EXPEDITION_SHIP_STATS } from '../lib/expeditions'
import type { DeployedCrewRow } from '../lib/crewData'
import type { VoyageRoute } from '../lib/voyageEvents'
import { withRng, mulberry32 } from '../lib/rng'
import { withClock } from '../lib/clock'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }

const hand = (id: number, slot: number): DeployedCrewRow => ({
  id, slot, rarity: 2, power: 12, dodge: 14, fortune: 10, effects: [], xp: 0, slug: '',
  name: `Hand ${id}`, catalogName: 'Koi', filename: 'koi.png',
})
const party = [hand(1, 0), hand(2, 1), hand(3, 2)]
const plan = (route: VoyageRoute, over: Partial<Parameters<typeof planVoyage>[0]> = {}) =>
  planVoyage({ route, shipTier: 3, party, expeditionXP: 0, gauntletUpgrades: [], ...over })
const ok = (p: ReturnType<typeof planVoyage>): VoyagePlan => {
  if ('error' in p) throw new Error(p.error)
  return p
}

// Determinism.
const a = withRng(mulberry32(81), () => JSON.stringify(Array.from({ length: 30 }, () => plan('deep'))))
const b = withRng(mulberry32(81), () => JSON.stringify(Array.from({ length: 30 }, () => plan('deep'))))
if (a !== b) fail('the same seed sailed a different voyage')

// Gates.
const err = (p: ReturnType<typeof planVoyage>) => ('error' in p ? p.error : null)
if (!err(plan('open', { shipTier: 0 }))) fail('a rowboat was let onto the open route')
if (err(plan('coastal', { shipTier: 0, party: [hand(1, 0)] }))) fail('a rowboat with one hand could not sail Coastal')
if (!err(plan('coastal', { party: [] }))) fail('an empty boat sailed Coastal')
if (!err(plan('open', { party: [hand(1, 0)] }))) fail('one hand sailed a deep route')
if (!err(plan('nowhere' as VoyageRoute))) fail('an unknown route sailed')
if (voyageCrewCap(0, null, true) !== (EXPEDITION_SHIP_STATS[0].crewSlots + 1)) fail('the sixth berth did not add a hand')

// Loss.
withRng(mulberry32(83), () => {
  let lostShroud = 0
  for (let k = 0; k < 3000; k++) {
    if (ok(plan('coastal')).crewLost.length) { fail('Coastal lost a hand'); break }
    if (ok(plan('shroud', { gauntletUpgrades: ['safe_voyages'] })).crewLost.length) { fail('Safe Passage lost a hand'); break }
    lostShroud += ok(plan('shroud')).crewLost.length
  }
  if (lostShroud === 0) fail('the Shroud never lost a hand in 3000 voyages, so the loss check tests nothing')
})

// Swift Sails.
{
  const slow = ok(plan('deep')).durationMs
  const fast = ok(plan('deep', { gauntletUpgrades: ['swift_sails'] })).durationMs
  if (Math.abs(fast - Math.round(slow * 0.85)) > 1) fail(`Swift Sails took ${slow} to ${fast}, not 15% off`)
}

// The payout.
const none = { expeditionXP: 0, tideTurner: false, phantomHook: false, perfectedSigil: false }
const pay = (outcome: string | undefined, over: Partial<Parameters<typeof voyagePayout>[0]> = {}, owned = none) =>
  voyagePayout({ route: 'deep', events: [{ outcome }], xpBonusPct: 0, crewIds: [1, 2, 3], crewLost: [], ...over }, owned)
const base = ROUTE_PAYOUTS.deep.xp
if (pay('success').xpEarned !== Math.round(base * OUTCOME_MULT.triumph)) fail('a triumph did not pay the triumph figure')
if (pay('failure').xpEarned !== Math.round(base * OUTCOME_MULT.setback)) fail('a setback did not pay the setback figure')
if (pay(undefined).xpEarned !== base) fail('a plain return did not pay the route figure')
if (pay(undefined, { xpBonusPct: 20 }).xpEarned !== Math.round(base * 1.2)) fail('the crew xp bonus did not lift Navigation XP')
if (pay('success').crewXpEarned !== Math.round(ROUTE_PAYOUTS.deep.crewXp * OUTCOME_MULT.triumph)) fail('crew XP did not scale with the outcome')
if (pay(undefined, { crewLost: [2] }).survivorIds.join() !== '1,3') fail('a lost hand was paid crew XP')
const drops = { tideTurnerDrop: true, phantomHookDrop: true, perfectedSigilDrop: true }
const fresh = pay(undefined, drops)
if (!fresh.newTideTurner || !fresh.newPhantomHook || !fresh.newPerfectedSigil) fail('a special item did not land')
const again = pay(undefined, drops, { expeditionXP: 0, tideTurner: true, phantomHook: true, perfectedSigil: true })
if (again.newTideTurner || again.newPhantomHook || again.newPerfectedSigil) fail('a special item landed twice')
const bait = pay(undefined, { events: [{ baitDrop: 'squid' }, { baitDrop: 'squid' }, { baitDrop: null }] }).earnedBait
if (JSON.stringify(bait) !== '[{"type":"squid","qty":2}]') fail(`bait tallied as ${JSON.stringify(bait)}`)

// Home on time.
const sent = '2026-09-28T00:00:00.000Z', t0 = Date.parse(sent)
if (withClock(t0 + 59_999, () => voyageBack(sent, 60_000))) fail('a voyage came home early')
if (!withClock(t0 + 60_000, () => voyageBack(sent, 60_000))) fail('a voyage did not come home on time')
if (withClock(t0 - 1, () => trawlBack(sent))) fail('a trawl came home early')
if (!withClock(t0, () => trawlBack(sent))) fail('a trawl did not come home on time')

// Trawl gates, in order.
const gate = (over: Partial<Parameters<typeof trawlDeployRefusal>[0]> = {}) => trawlDeployRefusal({
  zone: 'shallows', crewId: 7, fishingLevel: 100, navLevel: 100, ancientRefusal: null,
  active: [], crewAlive: true, onVoyage: false, bunk: null, storesLevel: 1, ...over,
})
if (gate() !== null) fail('a free hand could not be sent')
if (!gate({ zone: 'ancient_deep', fishingLevel: 1, ancientRefusal: 'gate' })?.startsWith('Reach Fishing Level')) fail('the level gate did not come first')
if (gate({ zone: 'ancient_deep', ancientRefusal: 'gate' }) !== 'gate') fail('the Ancient Deep gate was not honoured')
if (gate({ active: [{ zone: 'shallows', crew_id: 1 }] })?.startsWith("You're already trawling") !== true) fail('two trawls on one zone')
if (gate({ zone: 'deep', active: [{ zone: 'shallows', crew_id: 7 }] }) !== 'That crew is already at sea') fail('one hand on two trawls')
if (gate({ crewAlive: false }) !== 'Crew not available') fail('a fallen hand was sent')
if (gate({ onVoyage: true }) !== 'That crew is away on a voyage') fail('a hand on a voyage was sent')
withClock(t0 + 3_600_000, () => {
  if (!gate({ bunk: { since: sent, cap_hours: 4 } })?.includes('training in the hall')) fail('a hand mid-stint was sent')
  if (gate({ bunk: { since: sent, cap_hours: 1 } }) !== null) fail('a hand whose stint finished was held')
})

// The haul's species.
withRng(mulberry32(85), () => {
  for (let k = 0; k < 500; k++) {
    const f = sampleHaulFish(['a', 'b', 'c', 'd', 'e'])
    if (f.length !== 3 || new Set(f).size !== 3) { fail(`a haul showed ${f.join()}`); break }
  }
  if (sampleHaulFish(['a']).join() !== 'a' || sampleHaulFish([]).length !== 0) fail('a thin pool broke the sample')
})
const v = trawlCrewView({ id: 1, power: 0, dodge: 0, fortune: 0, xp: 0, effects: [], nickname: null, cards: null })
if (v.savvy < 1 || v.fortune < 1) fail('a trawler fell below 1 Savvy or Fortune')

console.log(`\n  Voyage and trawl rules: gates, loss, speed, payouts, timing and trawls ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
