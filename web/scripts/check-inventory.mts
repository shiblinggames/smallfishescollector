// THE INVENTORY'S RULES, ON A LOCAL SAVE (the item system, stage 2).
//
// lib/data/local/inventoryLocal through every kind of storage, so a rule the
// cores will lean on cannot quietly break:
//   - stacks (bait, fish) add, and a take is refused past what is held;
//   - raid items are held as copies: give adds, take removes, never past zero;
//   - unlocks (rods, lists, special flags, furnishings) are owned once: a
//     second give is refused, a take of something not held is refused;
//   - the Bamboo is always held and never given or taken;
//   - upgrades are read against the level and never given or taken;
//   - heldAll agrees with held;
//   - every catalogued thing (lib/items) resolves to a place to keep it, except
//     the one-of-a-kind categories, which have systems of their own.
//   npx tsx scripts/check-inventory.mts

import fs from 'fs'
import path from 'path'
import { localInventory } from '../lib/data/local/inventoryLocal'
import { ITEMS, CATEGORIES } from '../lib/items'
import { storageFor } from '../lib/inventoryStorage'
import type { LocalSave } from '../lib/data/local/save'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }
const UID = 'local-captain'
const defaults = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', 'profile_defaults.json'), 'utf8'))

function freshSave(): LocalSave {
  return {
    uid: UID, profile: { ...defaults, reel_tier: 2 },
    bait: { worm: 25 }, hold: {}, rods: [], homestead: { house: 1, name: null, furniture: {}, owned: [], pinned: [] },
  } as unknown as LocalSave
}

const s = freshSave()
const inv = localInventory(s)

// Stacks.
if (!(await inv.give(UID, 'bait', 'worm', 5)) || (await inv.held(UID, 'bait', 'worm')) !== 30) fail('bait did not stack')
if (await inv.take(UID, 'bait', 'worm', 31)) fail('more bait was taken than held')
if (!(await inv.take(UID, 'bait', 'worm', 30)) || (await inv.held(UID, 'bait', 'worm')) !== 0) fail('bait was not taken')
if (await inv.give(UID, 'bait', 'worm', 0) || await inv.give(UID, 'bait', 'worm', 1.5) || await inv.give(UID, 'bait', 'worm', -3)) fail('a count that is not a positive whole number was accepted')
await inv.give(UID, 'fish', '12', 3)
if ((await inv.held(UID, 'fish', '12')) !== 3 || (await inv.heldAll(UID, 'fish')).get('12') !== 3) fail('fish did not stack, or heldAll disagrees')

// Unlocks: rods.
if ((await inv.held(UID, 'rod', '0')) !== 1) fail('the Bamboo is not held')
if (await inv.give(UID, 'rod', '0') || await inv.take(UID, 'rod', '0')) fail('the Bamboo was given or taken')
if (!(await inv.give(UID, 'rod', '4')) || await inv.give(UID, 'rod', '4')) fail('a rod was not owned once')
if (!(await inv.take(UID, 'rod', '4')) || await inv.take(UID, 'rod', '4')) fail('a rod was taken twice')

// Unlocks: a profile list, a flag, a furnishing.
const petId = ITEMS.find(i => i.category === 'pet')!.id
if (!(await inv.give(UID, 'pet', petId)) || await inv.give(UID, 'pet', petId)) fail('a pet was not owned once')
if ((await inv.heldAll(UID, 'pet')).get(petId) !== 1) fail('heldAll disagrees for pets')
if (!(await inv.take(UID, 'pet', petId)) || await inv.take(UID, 'pet', petId)) fail('a pet was taken twice')
if (!(await inv.give(UID, 'special', 'tide_turner')) || await inv.give(UID, 'special', 'tide_turner') || s.profile.has_tide_turner !== true) fail('a special item was not owned once')
const furnishing = ITEMS.find(i => i.category === 'furnishing')!.id
if (!(await inv.give(UID, 'furnishing', furnishing)) || await inv.give(UID, 'furnishing', furnishing)) fail('a furnishing was not owned once')
// Raid items are held as COPIES (stage 3).
const raidItem = ITEMS.find(i => i.category === 'raid_item')!.id
if (!(await inv.give(UID, 'raid_item', raidItem)) || !(await inv.give(UID, 'raid_item', raidItem, 2)) || (await inv.held(UID, 'raid_item', raidItem)) !== 3) fail('raid items did not stack as copies')
if ((await inv.heldAll(UID, 'raid_item')).get(raidItem) !== 3) fail('heldAll disagrees for raid items')
if (await inv.take(UID, 'raid_item', raidItem, 4) || (await inv.held(UID, 'raid_item', raidItem)) !== 3) fail('more copies were taken than held, or a refused take changed the count')
if (!(await inv.take(UID, 'raid_item', raidItem, 2)) || (await inv.held(UID, 'raid_item', raidItem)) !== 1) fail('two copies were not taken')

// Upgrades: read against the level, never given or taken.
if ((await inv.held(UID, 'reel', '2')) !== 1 || (await inv.held(UID, 'reel', '3')) !== 0) fail('an upgrade was not read against its level')
let threw = false
try { await inv.give(UID, 'reel', '5') } catch { threw = true }
if (!threw) fail('an upgrade was given')

// Every catalogued thing has a place to be kept.
let placed = 0
for (const i of ITEMS) {
  if (CATEGORIES[i.category].kind === 'instance') continue
  try { storageFor(i.category, i.id); placed++ } catch (e) { fail(`${i.key} has nowhere to be kept: ${(e as Error).message}`) }
}

console.log(`  ${placed} catalogued things each have a place to be kept`)
console.log(`\n  Inventory: stacks, unlocks, the Bamboo, upgrades and heldAll ${failed ? `${failed} FAILED` : 'ok'}.`)
process.exit(failed ? 1 : 0)
