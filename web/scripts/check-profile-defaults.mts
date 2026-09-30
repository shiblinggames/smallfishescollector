// A NEW CAPTAIN IS THE SAME CAPTAIN ON BOTH BUILDS.
//
// content/profile_defaults.json (the desktop's starter profile) must be exactly
// what the schema snapshot gives a new `profiles` row. A column added or a
// default changed on the web without re-exporting would start offline captains
// differently, so this fails until scripts/export-profile-defaults.mts is re-run.
//   npx tsx scripts/check-profile-defaults.mts

import fs from 'fs'
import path from 'path'
import { parseProfileDefaults } from '../lib/profileDefaults'

const ROOT = process.cwd()
const want = parseProfileDefaults(fs.readFileSync(path.join(ROOT, 'supabase', 'live', '02_tables.sql'), 'utf8'))
const have = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'profile_defaults.json'), 'utf8')) as Record<string, unknown>

const diff: string[] = []
for (const k of new Set([...Object.keys(want), ...Object.keys(have)])) {
  if (JSON.stringify(want[k]) !== JSON.stringify(have[k])) diff.push(`${k}: snapshot ${JSON.stringify(want[k])}, file ${JSON.stringify(have[k])}`)
}
if (diff.length) {
  console.log('  FAIL content/profile_defaults.json differs from the schema snapshot:')
  for (const d of diff.slice(0, 20)) console.log('   ', d)
  console.log('  Re-run: npx tsx scripts/export-profile-defaults.mts')
  process.exit(1)
}
console.log(`  Profile defaults: ${Object.keys(want).length} columns match the schema snapshot ok.`)
