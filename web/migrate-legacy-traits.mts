// One-shot: convert every remaining legacy effect id to the numeric trait
// system, so `effects` holds nothing but 's:P,D,F'.
//
// The game switched to purely numerical traits a while back, but only for what
// rollCrew GENERATES. Crew that already existed kept their old ids, so 20% of
// the living roster was still carrying them. Two very different cases hide in
// there:
//
//   FLAT 'always' ids (dead_eye, cold_blood, salt_veteran...) still work today.
//   decodeTraitStats reads them and netTraitStats sums them, so they are just
//   the right numbers in the wrong format. Converting is lossless.
//
//   Everything else (aura, raid, conditional, percent) is INERT. resolveDeployedCrew
//   hardcodes raid and voyage mods to zero and reads only netTraitStats, so
//   these ids have contributed nothing to any stat for a long time. They are
//   cleared, which changes no player's actual numbers by a single point.
//
// Run from web/:  npx tsx migrate-legacy-traits.mts [--apply]

import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim())
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

import { createClient } from '@supabase/supabase-js'
import { decodeTraitStats, netTraitStats, traitLabel } from './lib/crewEffects'
import { TRAIT_MAX } from './lib/crewGen'

const APPLY = process.argv.includes('--apply')

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
) as any

const { data: rows, error } = await admin
  .from('user_crew').select('id, rarity, effects, died_at').order('id')
if (error) { console.error(error.message); process.exit(1) }

type Plan = { id: number; from: string[]; to: string[]; note: string; dead: boolean }
const plans: Plan[] = []
let clamped = 0

for (const r of rows as any[]) {
  const effects = (r.effects ?? []) as string[]
  const legacy = effects.filter(id => !id.startsWith('s:'))
  if (legacy.length === 0) continue

  const readable = legacy.filter(id => decodeTraitStats(id) !== null)
  const inert = legacy.filter(id => decodeTraitStats(id) === null)

  // Sum everything readable, including any 's:' trait already present, so a
  // crew carrying both formats ends up with one trait worth exactly what the
  // two were worth together.
  const t = netTraitStats([...effects.filter(id => id.startsWith('s:')), ...readable])

  // Capped at the RECRUIT ceiling, not the deep one. A 4 is the Leviathan
  // bunk's to give; a data migration must not hand out a magnitude that is
  // supposed to be earned.
  const clamp = (v: number) => Math.max(-TRAIT_MAX, Math.min(TRAIT_MAX, v))
  const cl = { power: clamp(t.power), dodge: clamp(t.dodge), fortune: clamp(t.fortune) }
  if (cl.power !== t.power || cl.dodge !== t.dodge || cl.fortune !== t.fortune) clamped++

  const neutral = cl.power === 0 && cl.dodge === 0 && cl.fortune === 0
  const to = neutral ? [] : [`s:${cl.power},${cl.dodge},${cl.fortune}`]

  plans.push({
    id: r.id, from: effects, to, dead: !!r.died_at,
    note: inert.length
      ? `dropped inert: ${inert.join(', ')}`
      : 'lossless',
  })
}

const living = plans.filter(p => !p.dead)
console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} - ${plans.length} crew to convert (${living.length} living)\n`)
console.log('id      was                              becomes        label          note')
for (const p of plans.slice(0, 25)) {
  const st = p.to.length ? decodeTraitStats(p.to[0])! : { power: 0, dodge: 0, fortune: 0 }
  console.log(
    `${String(p.id).padStart(5)}  ${p.from.join(',').slice(0, 30).padEnd(31)} ` +
    `${(p.to[0] ?? '(none)').padEnd(14)} ${(traitLabel(st) || '-').padEnd(14)} ${p.note}`,
  )
}
if (plans.length > 25) console.log(`  ... ${plans.length - 25} more`)

const lossless = plans.filter(p => p.note === 'lossless').length
console.log(`\nlossless conversions : ${lossless}`)
console.log(`had inert ids dropped: ${plans.length - lossless}`)
console.log(`ended with no trait  : ${plans.filter(p => p.to.length === 0).length}`)
console.log(`clamped to +/-${TRAIT_MAX}      : ${clamped}`)

if (!APPLY) { console.log('\npreview only, re-run with --apply'); process.exit(0) }

let ok = 0
for (const p of plans) {
  const { error } = await admin.from('user_crew').update({ effects: p.to }).eq('id', p.id)
  if (error) console.error(`crew ${p.id}: ${error.message}`)
  else ok++
}
console.log(`\nupdated ${ok}/${plans.length}`)

const { data: left } = await admin.from('user_crew').select('id, effects')
const remaining = ((left ?? []) as any[])
  .filter(r => ((r.effects ?? []) as string[]).some(id => !id.startsWith('s:')))
console.log(`crew still holding a legacy id: ${remaining.length}   <- must be 0`)
