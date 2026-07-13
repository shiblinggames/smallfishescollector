// Loot-table audit. Run: npx tsx verify-loot.ts
//
// Two silent failure modes this exists to catch:
//
//  1. A LOOT ID WITH NO GRANT. claimRaidLoot looks every rolled id up in
//     ITEM_GRANTS and `continue`s past anything it doesn't recognise. So a typo, or
//     a new item added to a raid's table without a matching grant, produces a raid
//     that shows the player a crate, plays the reveal, and hands them nothing. This
//     had genuinely happened: all six of the either/or Cache items were in no grant
//     map at all, because the Cache node used to hand them out directly.
//
//  2. A GRANT POINTING AT NOTHING. A raidItem grant whose id isn't a real item, or
//     a shipSkin grant whose id isn't a real skin, fails just as quietly.
import { ALL_RAIDS, ITEM_GRANTS } from './lib/raidRegistry'
import { getRaidItem } from './lib/raidItems'
import { getShipSkin } from './lib/shipSkins'

let failures = 0
const fail = (m: string) => { failures++; console.log('  FAIL: ' + m) }
const ok = (m: string) => console.log('  ok   ' + m)

console.log(`Auditing ${ALL_RAIDS.length} raids against ${Object.keys(ITEM_GRANTS).length} grants\n`)

// ── 1. Every id in every raid's table must grant something ──────────────────
console.log('1. Every loot id grants something')
{
  let bad = 0
  for (const raid of ALL_RAIDS) {
    for (const slot of raid.loot) {
      if (!ITEM_GRANTS[slot.id]) {
        bad++
        fail(`${raid.raidId}: "${slot.id}" (${slot.label}) has NO ITEM_GRANTS entry — it would drop nothing`)
      }
    }
    if (raid.loot.length === 0) { bad++; fail(`${raid.raidId}: empty loot table`) }
  }
  if (bad === 0) ok(`all ${ALL_RAIDS.reduce((n, r) => n + r.loot.length, 0)} loot slots across every raid pay out`)
}

// ── 2. Every grant resolves to a real item / skin ───────────────────────────
console.log('\n2. Every grant points at something real')
{
  let bad = 0
  for (const [id, grant] of Object.entries(ITEM_GRANTS)) {
    if (grant.raidItem && !getRaidItem(grant.raidItem)) { bad++; fail(`${id} grants raidItem "${grant.raidItem}", which is not a real item`) }
    if (grant.shipSkin && !getShipSkin(grant.shipSkin)) { bad++; fail(`${id} grants shipSkin "${grant.shipSkin}", which is not a real skin`) }
    if (!grant.raidItem && !grant.shipSkin && !grant.doubloons && !grant.gems) { bad++; fail(`${id} grants nothing at all`) }
  }
  if (bad === 0) ok('every grant resolves')
}

// ── 3. raidIds are unique (the registry is a map — a dupe would shadow) ─────
console.log('\n3. Raid ids are unique')
{
  const ids = ALL_RAIDS.map(r => r.raidId)
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dupes.length === 0) ok(`${ids.length} distinct raid ids`)
  else fail(`duplicate raidId: ${[...new Set(dupes)].join(', ')}`)
}

// ── 4. The Ghost carries exactly the six Cache items ────────────────────────
// He is the ONLY way back to a Cache item once the campaign has moved on, and the
// forge destroys what it fuses. If one ever fell off his table, the recipe that
// needs it would become permanently unbuildable and nothing would say so.
console.log("\n4. The Quartermaster's Ghost still holds all six Cache items")
{
  const ghost = ALL_RAIDS.find(r => r.raidId === 'the_quartermasters_ghost')
  const CACHE_ITEMS = [
    'quartermasters_anchor', 'navigators_compass',
    'gunners_sight', 'reinforced_hull',
    'incendiary_cannonball', 'frozen_cannonball',
  ]
  if (!ghost) fail('the Ghost is not in the registry')
  else {
    const has = new Set(ghost.loot.map(l => l.id))
    const missing = CACHE_ITEMS.filter(id => !has.has(id))
    if (missing.length === 0) ok('all six are on his table and all six grant')
    else fail(`the Ghost no longer drops: ${missing.join(', ')} — those recipes are now unbuildable`)
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
