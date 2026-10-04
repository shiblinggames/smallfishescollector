// THE HOMESTEAD'S TABLES for the Godot port (content/homestead.json), from the
// web's lib/homestead.ts: the house's rungs, the furniture, the rooms and the
// menagerie's spots. The web is frozen; this ran once (2026-10-04).
//
//   cd web && npx tsx ../godot/game/tools/export_homestead.mts
import fs from 'node:fs'
import path from 'node:path'
import { HOUSE, HOUSE_SLOTS, FURNITURE, ROOMS, MENAGERIE_SPOTS, MENAGERIE_FALLBACK, PINNED_MAX } from '../../../web/lib/homestead'

const out = {
  _about: 'The Homestead, from the web (tools/export_homestead.mts).',
  house: HOUSE, slots: HOUSE_SLOTS, furniture: FURNITURE, rooms: ROOMS,
  menagerie: MENAGERIE_SPOTS, menagerieFallback: MENAGERIE_FALLBACK, pinnedMax: PINNED_MAX,
}
fs.writeFileSync(path.join(import.meta.dirname, '..', 'content', 'homestead.json'), JSON.stringify(out, null, 1))
console.log('homestead.json:', HOUSE.length, 'rungs,', FURNITURE.length, 'slots,', ROOMS.length, 'rooms')
