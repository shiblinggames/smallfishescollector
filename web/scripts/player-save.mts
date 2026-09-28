// EXPORT AND RESTORE ONE PLAYER (Steam prep, Phase A step 4, 2026-09-28).
//
//   npx tsx scripts/player-save.mts export <username|uuid> [--history] [--out file.json]
//   npx tsx scripts/player-save.mts restore <file.json>            dry run: what would change
//   npx tsx scripts/player-save.mts restore <file.json> --apply    replace the player's state
//
// The table list is lib/playerSave. Export and restore each run as ONE
// database transaction (admin_export_player_rows / admin_import_player_rows,
// service role only): the export is a consistent snapshot, the restore is all
// or nothing.
//
// RESTORE IS DESTRUCTIVE: every save table's rows for that player are replaced
// by the file's, and the profile row is overwritten (all but its id). Before
// it writes, it exports the player's CURRENT state to saves/ as an undo file.
// It restores onto the SAME account only (the file's userId); moving a save to
// another account needs id remapping and is not built.
//
// Saves contain a player's full state. They are written to web/saves/, which
// is git-ignored. Do not commit or share them.

import fs from 'fs'
import path from 'path'
import { SAVE_TABLES, HISTORY_TABLES, SAVE_FORMAT, SAVE_VERSION, isPlayerSave, saveCounts, type PlayerSave } from '../lib/playerSave'

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const SAVES = path.join(process.cwd(), 'saves')

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

async function findUser(who: string): Promise<{ id: string; username: string | null }> {
  const q = /^[0-9a-f-]{36}$/i.test(who) ? `id=eq.${who}` : `username=eq.${encodeURIComponent(who)}`
  const res = await fetch(`${URL_}/rest/v1/profiles?select=id,username&${q}`, { headers: H })
  const rows = await res.json() as { id: string; username: string | null }[]
  if (!rows.length) throw new Error(`no player "${who}"`)
  return rows[0]
}

async function exportSave(userId: string, username: string | null, history: boolean): Promise<PlayerSave> {
  const profRes = await fetch(`${URL_}/rest/v1/profiles?select=*&id=eq.${userId}`, { headers: H })
  const [profile] = await profRes.json() as Record<string, unknown>[]
  const tables = await rpc<Record<string, Record<string, unknown>[]>>('admin_export_player_rows', { uid: userId, tbls: SAVE_TABLES })
  const save: PlayerSave = {
    format: SAVE_FORMAT, version: SAVE_VERSION, exportedAt: new Date().toISOString(),
    userId, username, profile, tables,
  }
  if (history) save.history = await rpc('admin_export_player_rows', { uid: userId, tbls: HISTORY_TABLES })
  return save
}

const write = (save: PlayerSave, name: string) => {
  fs.mkdirSync(SAVES, { recursive: true })
  const f = path.isAbsolute(name) ? name : path.join(SAVES, name)
  fs.writeFileSync(f, JSON.stringify(save, null, 1))
  return f
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

const [cmd, arg, ...rest] = process.argv.slice(2)
if (cmd === 'export' && arg) {
  const u = await findUser(arg)
  const save = await exportSave(u.id, u.username, rest.includes('--history'))
  const outI = rest.indexOf('--out')
  const f = write(save, outI >= 0 ? rest[outI + 1] : `${u.username ?? u.id}-${stamp()}.json`)
  const c = saveCounts(save)
  console.log(`exported ${u.username ?? u.id}: ${Object.values(c).reduce((a, b) => a + b, 0)} rows in ${Object.values(c).filter(Boolean).length} tables${save.history ? ' (+history)' : ''}\n-> ${f}`)
} else if (cmd === 'restore' && arg) {
  const save = JSON.parse(fs.readFileSync(arg, 'utf8'))
  if (!isPlayerSave(save)) throw new Error('not a save file this version can read')
  const u = await findUser(save.userId)
  const now = await exportSave(u.id, u.username, false)
  const a = saveCounts(now), b = saveCounts(save)
  console.log(`restore ${save.username ?? save.userId} to the state of ${save.exportedAt}`)
  for (const t of SAVE_TABLES) if (a[t.table] !== b[t.table]) console.log(`  ${t.table}: ${a[t.table]} -> ${b[t.table]} rows`)
  const pf = Object.keys(save.profile).filter(k => JSON.stringify(save.profile[k]) !== JSON.stringify((now.profile as Record<string, unknown>)[k]))
  console.log(`  profile: ${pf.length} field(s) differ${pf.length ? ` (${pf.slice(0, 12).join(', ')}${pf.length > 12 ? ', ...' : ''})` : ''}`)
  if (!rest.includes('--apply')) {
    console.log('\ndry run: nothing written. Add --apply to restore.')
  } else {
    const undo = write(now, `${u.username ?? u.id}-before-restore-${stamp()}.json`)
    console.log(`undo file (current state): ${undo}`)
    const tbls = SAVE_TABLES.map(t => ({ ...t, rows: save.tables[t.table] ?? [] }))
    const report = await rpc<Record<string, number>>('admin_import_player_rows', { uid: save.userId, profile: save.profile, tbls })
    console.log('restored:', Object.entries(report).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(', ') || 'no rows')
  }
} else {
  console.log('usage: player-save.mts export <username|uuid> [--history] [--out f] | restore <file> [--apply]')
}
