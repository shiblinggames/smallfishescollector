// EVERY PORTRAIT THE GAME ASKS FOR IS ON DISK (Steam prep, Phase A step 3).
//
// Crew, fish and enemy art moved out of the Supabase buckets into public/
// (lib/artUrl). A card or a skin naming a file that is not there renders as a
// broken image with nothing to say why, so this checks, before a push:
//   - every card in content/cards.json,
//   - every crew skin in lib/crewSkins,
//   - every literal cardArt('...') / enemyArt('...') in the code,
// resolves to a file in public/card-arts or public/enemy-arts.
//
//   npx tsx scripts/check-art.mts

import fs from 'fs'
import path from 'path'
import { cardArt, enemyArt } from '../lib/artUrl'
import { CREW_SKINS } from '../lib/crewSkins'

const pub = path.join(process.cwd(), 'public')
const exists = (url: string) => fs.existsSync(path.join(pub, url))
const missing: string[] = []
let checked = 0
const want = (what: string, url: string) => { checked++; if (!url || !exists(url)) missing.push(`${what} -> ${url || '(empty)'}`) }

const cards = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', 'cards.json'), 'utf8')) as { id: number; filename: string }[]
for (const c of cards) want(`card ${c.id}`, cardArt(c.filename))
for (const s of CREW_SKINS) want(`skin ${s.id}`, cardArt(s.filename))

const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
  d.isDirectory() ? (['node_modules', '.next'].includes(d.name) ? [] : walk(path.join(dir, d.name)))
    : /\.(ts|tsx)$/.test(d.name) ? [path.join(dir, d.name)] : [])
for (const f of ['app', 'lib', 'components'].flatMap(d => walk(path.join(process.cwd(), d)))) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\b(cardArt|enemyArt)\('([^']+)'\)/g)) {
    want(`${path.relative(process.cwd(), f)} ${m[1]}('${m[2]}')`, m[1] === 'cardArt' ? cardArt(m[2]) : enemyArt(m[2]))
  }
}

for (const m of missing) console.log('  MISSING ' + m)
console.log(`\n  Art on disk: ${checked} references checked, ${missing.length ? `${missing.length} MISSING` : 'all present'}.`)
if (missing.length) process.exit(1)
