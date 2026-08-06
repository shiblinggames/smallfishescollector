/**
 * Every badge in the registry must have a row on /badges.
 *
 * That page carries a HAND-MAINTAINED list of ~200 badgeGoal() calls, because a
 * goal needs a progress value and a link that the registry cannot supply. The
 * cost of that is real: six badges shipped with art and working unlock
 * conditions and were simply invisible on the page that lists them, because
 * adding a badge does not add a goal. This catches the next one at build time
 * instead of on the user's screen.
 */
import { BADGES } from '../lib/badges'
import fs from 'fs'

const src = fs.readFileSync('app/(app)/badges/page.tsx', 'utf8')
// Ignore commented-out rows (parked PvP badges live there).
const live = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
const listed = new Set([...live.matchAll(/badgeGoal\('([a-z0-9_]+)'/g)].map(m => m[1]))

const missing = BADGES.filter(b => !listed.has(b.id))
if (missing.length) {
  console.log(`\nBadge goals: ${missing.length} badge(s) missing from /badges\n`)
  for (const b of missing) console.log(`   ${b.id}  (${b.difficulty})  ${b.description}`)
  console.log('\nAdd a badgeGoal(...) row for each in app/(app)/badges/page.tsx\n')
  process.exit(1)
}
console.log(`\nBadge goals: ok (all ${BADGES.length} badges listed on /badges)`)
