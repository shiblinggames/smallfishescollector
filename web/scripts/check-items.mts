// THE ITEM CATALOGUE IS WHOLE (lib/items).
//
// 1. Every key is unique: two things sharing `<category>:<id>` would be one
//    thing to an inventory.
// 2. Everything the game can hand a captain is in it: every raid-loot grant
//    (ITEM_GRANTS: raid items, ship skins, special items), every raid's unique
//    loot, every forge recipe's components and result, and the bounty ladder's
//    ship skins. A thing that can be earned but is not catalogued could never be
//    held, stacked or put in a chest.
// 3. The chest rules hold: the Bamboo never travels, cosmetics travel as
//    tokens, upgrades and instances never travel.
//   npx tsx scripts/check-items.mts

import { ITEMS, ITEM_BY_KEY, CATEGORIES, itemKey } from '../lib/items'
import { ITEM_GRANTS, ALL_RAIDS, raidUniqueLootIds } from '../lib/raidRegistry'
import { FORGE_RECIPES } from '../lib/raidItems'
import { BOUNTY_MILESTONES } from '../lib/bounties'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }

// 1. Unique keys.
const seen = new Set<string>()
for (const i of ITEMS) {
  if (seen.has(i.key)) fail(`duplicate key ${i.key}`)
  seen.add(i.key)
}

// 2. Everything that can be granted is catalogued.
const need = (category: 'raid_item' | 'ship_skin' | 'special', id: string, from: string) => {
  if (!ITEM_BY_KEY.has(itemKey(category, id))) fail(`${from} grants ${category} "${id}", which is not in lib/items`)
}
for (const [lootId, g] of Object.entries(ITEM_GRANTS)) {
  if (g.raidItem) need('raid_item', g.raidItem, `ITEM_GRANTS.${lootId}`)
  if (g.shipSkin) need('ship_skin', g.shipSkin, `ITEM_GRANTS.${lootId}`)
  if (g.specialItem) need('special', g.specialItem, `ITEM_GRANTS.${lootId}`)
}
let uniques = 0
for (const raid of ALL_RAIDS) {
  for (const id of raidUniqueLootIds(raid.raidId)) {
    uniques++
    const g = ITEM_GRANTS[id]
    if (!g) fail(`${raid.raidId} drops "${id}", which has no ITEM_GRANTS entry`)
  }
}
for (const r of FORGE_RECIPES) {
  for (const c of r.components) need('raid_item', c, `the ${r.result} recipe (component)`)
  need('raid_item', r.result, 'a forge recipe (result)')
}
for (const m of BOUNTY_MILESTONES) if (m.shipSkinId) need('ship_skin', m.shipSkinId, `the bounty ladder at ${m.points}`)

// 3. The chest rules.
if (ITEM_BY_KEY.get('rod:bamboo')?.chest !== false) fail('the Bamboo may go in the chest')
if (ITEM_BY_KEY.get('rod:completionist')?.chest !== false) fail('the Completionist (one of a kind) may go in the chest')
for (const i of ITEMS) {
  const c = CATEGORIES[i.category]
  if ((c.kind === 'upgrade' || c.kind === 'instance') && i.chest) fail(`${i.key} is an ${c.kind} and may go in the chest`)
}
for (const cat of ['pet', 'boat', 'hat', 'color', 'avatar_special', 'crew_skin', 'ship_skin', 'furnishing'] as const) {
  if (CATEGORIES[cat].chest !== 'token') fail(`${cat} should travel as a token`)
}

const byKind = ITEMS.reduce<Record<string, number>>((m, i) => { m[i.kind] = (m[i.kind] ?? 0) + 1; return m }, {})
console.log(`  ${ITEMS.length} things catalogued (${Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ')}); ${Object.keys(ITEM_GRANTS).length} grants and ${uniques} raid uniques resolve`)
console.log(`\n  Item catalogue: unique keys, everything grantable catalogued, chest rules ${failed ? `${failed} FAILED` : 'ok'}.`)
process.exit(failed ? 1 : 0)
