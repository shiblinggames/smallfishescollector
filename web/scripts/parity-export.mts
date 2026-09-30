// THE GODOT PARITY CASES (Godot port, stage 0, 2026-09-30).
//
// The Steam game is being rebuilt in Godot (docs/systems/steam-port.md), and
// the rules here in lib/ are its SPEC. This script runs the real TypeScript
// against seeded dice and a scripted clock and writes what happened to
// godot/game/tests/parity/*.json; the Godot build replays every case
// (godot/game/tests/parity.gd) and must end in exactly the same place. A system is
// ported when its cases match.
//
//   dice.json     mulberry32 sequences and seedOf hashes (the dice every roll
//                 goes through; a roll out of step breaks everything after it)
//   save.json     save files the Godot build must read and write back unchanged
//   fishing.json  whole fishing sessions: the save at the start, every call
//                 with its clock, arguments, result and how many rolls it used,
//                 and the save at the end
//
// Deterministic: running it twice writes the same files. Re-run it whenever a
// rule changes, and the Godot build learns what changed from its failures.
//
//   npx tsx scripts/parity-export.mts

import fs from 'fs'
import path from 'path'
import { castLine, reelIn, reelCrate } from '../lib/core/fishing'
import { localFishingData, type LocalSave } from '../lib/data/local/fishingLocal'
import { serializeSave } from '../lib/data/local/saveFile'
import { starterSave } from '../lib/data/local/starter'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32, seedOf, type Rng } from '../lib/rng'
import { installClock } from '../lib/clock'
import { XP_TABLE } from '../lib/fishingLevel'
import { CRATE_FISH_ID } from '../lib/fishingRules'

const OUT = path.join(process.cwd(), '..', 'godot', 'game', 'tests', 'parity')
fs.mkdirSync(OUT, { recursive: true })
const SPECIES = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', 'fish_species.json'), 'utf8')) as SpeciesRow[]
const START = Date.parse('2026-09-30T12:00:00.000Z')
const SAVED_AT = new Date(START).toISOString()
const write = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + '\n')
  console.log(`  ${name}`)
}

// ── The dice ──
// Values as the 32-bit integers behind them (value x 2^32), exact on both sides.
const U = 4294967296
write('dice.json', {
  sequences: [0, 1, 2026, 4294967295, 123456789, seedOf('parity')].map(seed => {
    const r = mulberry32(seed)
    return { seed, values: Array.from({ length: 64 }, () => r() * U) }
  }),
  hashes: ['', 'a', 'local-captain', 'captain-78cda61878db:1759233600000', 'Ñandú', 'fish 🐟 hook', 'Davy Jones'.repeat(20)]
    .map(text => ({ text, seed: seedOf(text) })),
})

// ── A fishing session ──
type Op = { op: string; now: number; args: unknown[]; rolls: number; result: unknown }

/** The dice, counting how many rolls each call takes. */
function countingDice(seed: number): { rng: Rng; take(): number } {
  const r = mulberry32(seed)
  let n = 0
  return { rng: () => { n++; return r() }, take() { const k = n; n = 0; return k } }
}

async function session(name: string, seed: number, start: LocalSave, casts: number) {
  const save = start
  const startText = serializeSave(save, {}, SAVED_AT)
  const db = localFishingData(save)
  const uid = save.uid
  let now = START
  const dice = countingDice(seed)
  installRng(dice.rng)
  installClock(() => now)
  const ops: Op[] = []
  const call = async (op: string, args: unknown[], run: () => Promise<unknown>) => {
    dice.take()
    const result = JSON.parse(JSON.stringify(await run()))
    ops.push({ op, now, args, rolls: dice.take(), result })
    return result
  }
  try {
    for (let k = 0; k < casts; k++) {
      const shot = await call('castLine', ['worm', 'shallows'], () => castLine(db, uid, 'worm', 'shallows'))
      if ('error' in shot) break
      // The guard: a reel before the bite is refused and keeps the cast.
      if (k === 0) await call('reelIn', [shot.fishId, 'catch', 'worm'], () => reelIn(db, uid, shot.fishId, 'catch', 'worm'))
      now += shot.waitMs + 1500
      if (shot.fishId === CRATE_FISH_ID) {
        const how = k % 2 ? 'perfect' : 'catch'
        await call('reelCrate', [how], () => reelCrate(db, uid, how))
        continue
      }
      const how = k % 4 === 3 ? 'miss' : k % 4 === 0 ? 'perfect' : 'catch'
      const r = await call('reelIn', [shot.fishId, how, 'worm'], () => reelIn(db, uid, shot.fishId, how, 'worm'))
      // The guard: a spent cast pays nothing twice.
      if (k % 5 === 1 && r.caught) await call('reelIn', [shot.fishId, how, 'worm'], () => reelIn(db, uid, shot.fishId, how, 'worm'))
      now += 4000
    }
  } finally {
    installRng(null)
    installClock(null)
  }
  return { name, seed, start: startText, ops, end: serializeSave(save, {}, SAVED_AT) }
}

// A brand-new captain in the shallows until the worms run low, and a
// level-20 captain with a better rod and plenty of worms for a long session.
const newCaptain = () => starterSave('captain-00parity0001', SPECIES, START)
const seasoned = () => {
  const s = starterSave('captain-00parity0002', SPECIES, START)
  Object.assign(s.profile, { fishing_xp: XP_TABLE[20], doubloons: 5000, rod_tier: 3, hook_tier: 2, line_tier: 1, fish_hold_tier: 4, has_seen_setup: true, has_seen_welcome: true })
  s.rodItems = { driftwood: 1, fiberglass: 1, reefguard: 1 }
  s.bait = { worm: 400 }
  return s
}
const sessions = [
  await session('new captain, shallows', 2026, newCaptain(), 20),
  await session('seasoned captain, shallows', 7, seasoned(), 90),
  await session('seasoned captain, another seed', 424242, seasoned(), 90),
]
write('fishing.json', { sessions })

// ── Save files ──
write('save.json', {
  saves: [
    { name: 'a new captain', text: serializeSave(newCaptain(), {}, SAVED_AT) },
    ...sessions.map(s => ({ name: `after: ${s.name}`, text: s.end })),
  ],
})

const opCount = sessions.reduce((n, s) => n + s.ops.length, 0)
console.log(`  ${sessions.length} fishing sessions, ${opCount} calls`)
