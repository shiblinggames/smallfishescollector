// GAME CONTENT LIVES IN THE REPO (Steam prep, Phase A step 3, 2026-09-28).
//
// The fish species, the crew cards and their variants were rows in the live
// database and nowhere else: no history, no review, and nothing an offline
// build could ship. They are versioned JSON in web/content/ now, and the
// database is loaded FROM them.
//
//   npx tsx scripts/content-sync.mts pull         database -> web/content/*.json
//   npx tsx scripts/content-sync.mts diff         what differs, changes nothing
//   npx tsx scripts/content-sync.mts push         what `push --apply` would write
//   npx tsx scripts/content-sync.mts push --apply web/content -> database (upsert)
//
// THE WORKFLOW FROM NOW ON: edit the JSON, commit it, then push --apply. A
// change made straight in the database shows up in `diff` until it is pulled.
// Push only upserts by id; it never deletes a row (a species in players'
// collections must not vanish because a line left a file).

import fs from 'fs'
import path from 'path'

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

/** The content tables, and the columns that are bookkeeping rather than content. */
const TABLES: { table: string; skip: string[] }[] = [
  { table: 'fish_species', skip: [] },
  { table: 'cards', skip: ['created_at'] },
  { table: 'card_variants', skip: [] },
]
const DIR = path.join(process.cwd(), 'content')
const file = (t: string) => path.join(DIR, `${t}.json`)

type Row = Record<string, unknown> & { id: number }
const clean = (r: Row, skip: string[]) =>
  Object.fromEntries(Object.keys(r).filter(k => !skip.includes(k)).sort((a, b) => (a === 'id' ? -1 : b === 'id' ? 1 : a.localeCompare(b))).map(k => [k, r[k]])) as Row

async function readDb(table: string, skip: string[]): Promise<Row[]> {
  const res = await fetch(`${URL_}/rest/v1/${table}?select=*&order=id.asc`, { headers: H })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return (await res.json() as Row[]).map(r => clean(r, skip))
}
const readRepo = (table: string): Row[] => JSON.parse(fs.readFileSync(file(table), 'utf8'))
const writeRepo = (table: string, rows: Row[]) =>
  fs.writeFileSync(file(table), '[\n' + rows.map(r => '  ' + JSON.stringify(r)).join(',\n') + '\n]\n')

function diff(repo: Row[], db: Row[]) {
  const byId = new Map(db.map(r => [r.id, r]))
  const changed: { id: number; fields: string[] }[] = []
  const added: number[] = []
  for (const r of repo) {
    const d = byId.get(r.id)
    if (!d) { added.push(r.id); continue }
    const fields = Object.keys(r).filter(k => JSON.stringify(r[k]) !== JSON.stringify(d[k]))
    if (fields.length) changed.push({ id: r.id, fields })
  }
  const repoIds = new Set(repo.map(r => r.id))
  const dbOnly = db.filter(r => !repoIds.has(r.id)).map(r => r.id)
  return { changed, added, dbOnly }
}

const [cmd, flag] = process.argv.slice(2)
fs.mkdirSync(DIR, { recursive: true })
for (const { table, skip } of TABLES) {
  const db = await readDb(table, skip)
  if (cmd === 'pull') {
    writeRepo(table, db)
    console.log(`${table}: ${db.length} rows -> content/${table}.json`)
    continue
  }
  if (!fs.existsSync(file(table))) { console.log(`${table}: no content/${table}.json yet; run pull`); continue }
  const repo = readRepo(table)
  const d = diff(repo, db)
  const same = !d.changed.length && !d.added.length && !d.dbOnly.length
  console.log(`${table}: ${same ? 'in sync' : `${d.changed.length} changed, ${d.added.length} new in repo, ${d.dbOnly.length} only in the database`}`)
  for (const c of d.changed.slice(0, 20)) console.log(`   id ${c.id}: ${c.fields.join(', ')}`)
  if (d.dbOnly.length) console.log(`   only in the database (pull to keep them): ${d.dbOnly.join(', ')}`)
  if (cmd === 'push') {
    const rows = repo.filter(r => d.added.includes(r.id) || d.changed.some(c => c.id === r.id))
    if (!rows.length) continue
    if (flag !== '--apply') { console.log(`   push would upsert ${rows.length} row(s); add --apply to write`); continue }
    const res = await fetch(`${URL_}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows),
    })
    if (!res.ok) throw new Error(`${table} push: ${res.status} ${await res.text()}`)
    console.log(`   upserted ${rows.length} row(s)`)
  }
}
if (!['pull', 'diff', 'push'].includes(cmd)) console.log('usage: content-sync.mts pull | diff | push [--apply]')
