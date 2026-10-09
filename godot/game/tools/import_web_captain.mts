// A WEB CAPTAIN INTO THE PORT (Kong, 2026-10-09: "port over my kingkong
// character ... so that I have a maxed out character to test with").
//
// Takes a web account's export (web/scripts/player-save.mts export, a
// PlayerSave document in web/saves/, git-ignored) through the web's own
// converter (fromWebExport, lib/data/local/saveFile) into the local save format
// the port opens (SaveFile, v13), and writes it where the title screen lists
// captains: %APPDATA%/Seas the Booty/captains/<id>.json. Run from web/ (its
// tsconfig resolves the @/ imports):
//
//   cd web
//   npx tsx scripts/player-save.mts export kingkong --out kingkong-for-port.json
//   npx tsx ../godot/game/tools/import_web_captain.mts saves/kingkong-for-port.json
//
// An existing save for that captain is kept beside it as <id>.json.bak first.
//
// FOR TESTERS (the playtest): --out <folder> writes <username>.json there
// instead, to send each tester their own (they press "Import a captain" on the
// title screen of a test build). Several exports at once:
//
//   npx tsx ../godot/game/tools/import_web_captain.mts saves/playtest/*.json --out saves/playtest-captains
// Tables the port does not model are carried in the file untouched.

import fs from 'fs'
import path from 'path'
import os from 'os'
import { fromWebExport, serializeSave, type WebExport } from '../../../web/lib/data/local/saveFile'
import type { SpeciesRow } from '../../../web/lib/data/fishingData'

const args = process.argv.slice(2)
const outI = args.indexOf('--out')
const outDir = outI >= 0 ? args[outI + 1] : null
const srcs = args.filter((_, i) => outI < 0 || (i !== outI && i !== outI + 1))
if (!srcs.length) {
  console.log('usage: npx tsx ../godot/game/tools/import_web_captain.mts <export.json>... [--out <folder>]')
  process.exit(1)
}
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const species = JSON.parse(fs.readFileSync(path.join(here, '..', 'content', 'fish_species.json'), 'utf8')) as SpeciesRow[]
for (const src of srcs) {
const exp = JSON.parse(fs.readFileSync(src, 'utf8')) as WebExport
const { save, carried } = fromWebExport(exp, species)

// WHERE THE PORT'S SAVE HAS MOVED ON FROM THE WEB'S (its rules keep times in
// milliseconds): voyages carry created_ms and duration_ms, the bounty moments
// are bounty_events with at_ms, and the bounty board is the port's own (a web
// board is dropped, and the port files a fresh one).
const ms = (iso: unknown) => (typeof iso === 'string' && iso ? Date.parse(iso) : 0)
const s = save as unknown as Record<string, unknown>
s.voyages = (save.voyages as unknown as Record<string, unknown>[]).map(v => ({
  ...v, created_ms: ms(v.created_at), duration_ms: 0,
  ...(v.status === 'revealed' ? { revealed_ms: ms(v.created_at) } : {}),
}))
s.bounty_events = (save.bountyEvents ?? []).map(e => ({ ...e, at_ms: ms(e.at) }))
s.bounty = null
s.bountyHistory = []

const appdata = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
const dir = outDir ?? path.join(appdata, 'Seas the Booty', 'captains')
fs.mkdirSync(dir, { recursive: true })
const name = String((save.profile as Record<string, unknown>).username ?? save.uid).replace(/[^A-Za-z0-9_-]/g, '_')
const out = path.join(dir, outDir ? `${name}.json` : `${save.uid}.json`)
if (!outDir && fs.existsSync(out)) fs.copyFileSync(out, out + '.bak')
fs.writeFileSync(out, serializeSave(save, carried))

const p = save.profile as Record<string, unknown>
console.log(`${p.username ?? save.uid}: fishing xp ${p.fishing_xp}, ship tier ${p.ship_tier}, ${save.crew.length} crew, ${Object.keys(save.collection).length} species caught, ${save.clears.length} raids cleared`)
console.log(`carried untouched: ${Object.keys(carried).join(', ') || 'none'}`)
console.log(`-> ${out}`)
}
