// Writes content/profile_defaults.json: a new captain's profile row, from the
// schema snapshot (lib/profileDefaults). Re-run after re-running
// scripts/snapshot-schema.mts whenever `profiles` changes; check-profile-defaults
// fails until you do.
//   npx tsx scripts/export-profile-defaults.mts

import fs from 'fs'
import path from 'path'
import { parseProfileDefaults } from '../lib/profileDefaults'

const ROOT = process.cwd()
const ddl = fs.readFileSync(path.join(ROOT, 'supabase', 'live', '02_tables.sql'), 'utf8')
const defaults = parseProfileDefaults(ddl)
fs.writeFileSync(path.join(ROOT, 'content', 'profile_defaults.json'), JSON.stringify(defaults, null, 2) + '\n')
console.log(`  ${Object.keys(defaults).length} columns -> content/profile_defaults.json`)
