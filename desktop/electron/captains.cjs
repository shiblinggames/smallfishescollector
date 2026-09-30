// THE CAPTAINS' SAVES, FROM THE MAIN PROCESS (Steam prep, 2026-09-30).
//
// A player keeps as many captains as they like (decided with Kong: a captain
// select, each captain with a home sea of their own). Each captain is one file,
// captains/<id>.json in the pinned save folder; the id is the save's own uid.
//
// - The page never touches the disk. It asks through the preload for a list,
//   a read, a write or a retirement, by captain id, and this module checks the
//   id is a plain name before it becomes a path.
// - WRITES are atomic (a temp file, flushed, then renamed over the save) and,
//   per captain, one at a time with only the newest kept: the screens fire
//   several calls at once, each ending in an autosave.
// - RETIRING a captain moves the file to retired/, stamped; nothing is deleted,
//   so a slip is recoverable by hand.
// - The one-save layout before this (captain.json) is moved in on first start.
//
// Steam Auto-Cloud syncs captains/*.json (see docs/systems/steam-port.md).

const path = require('path')
const fs = require('fs')

const ID = /^[a-z0-9-]{1,48}$/

function create(app, saveDirName) {
  const root = () => path.join(app.getPath('appData'), saveDirName)
  const dir = () => path.join(root(), 'captains')
  const file = (id) => {
    if (typeof id !== 'string' || !ID.test(id)) throw new Error(`not a captain id: ${id}`)
    return path.join(dir(), `${id}.json`)
  }

  /** The single save of the first desktop builds becomes a captain's file. */
  async function migrate() {
    const legacy = path.join(root(), 'captain.json')
    let text
    try { text = await fs.promises.readFile(legacy, 'utf8') } catch { return }
    await fs.promises.mkdir(dir(), { recursive: true })
    let id = 'local-captain'
    try { const uid = JSON.parse(text)?.save?.uid; if (typeof uid === 'string' && ID.test(uid)) id = uid } catch { /* keep the default */ }
    try { await fs.promises.access(file(id)); return } catch { /* not there yet: move it */ }
    await fs.promises.rename(legacy, file(id))
  }

  /** Every captain, with what the select screen shows. A file that will not
   *  parse is listed as damaged rather than hidden. */
  async function list() {
    await fs.promises.mkdir(dir(), { recursive: true })
    const names = (await fs.promises.readdir(dir())).filter(n => n.endsWith('.json'))
    const out = []
    for (const n of names) {
      const id = n.slice(0, -5)
      if (!ID.test(id)) continue
      try {
        const f = JSON.parse(await fs.promises.readFile(path.join(dir(), n), 'utf8'))
        const p = f?.save?.profile ?? {}
        out.push({
          id, savedAt: f.savedAt ?? null, version: f.version ?? null,
          name: p.username ?? null, fishingXp: Number(p.fishing_xp ?? 0), expeditionXp: Number(p.expedition_xp ?? 0),
          doubloons: Number(p.doubloons ?? 0), color: p.character_color ?? 'default', hat: p.equipped_hat ?? null,
          setUp: p.has_seen_setup === true,
        })
      } catch {
        out.push({ id, damaged: true })
      }
    }
    return out.sort((a, b) => String(b.savedAt ?? '').localeCompare(String(a.savedAt ?? '')))
  }

  async function read(id) {
    try { return await fs.promises.readFile(file(id), 'utf8') } catch (e) {
      if (e.code === 'ENOENT') return null
      throw e
    }
  }

  // One write at a time per captain, and only the newest.
  const queues = new Map()
  async function writeAtomic(id, text) {
    const f = file(id)
    await fs.promises.mkdir(path.dirname(f), { recursive: true })
    const tmp = `${f}.tmp`
    const h = await fs.promises.open(tmp, 'w')
    try { await h.writeFile(text, 'utf8'); await h.sync() } finally { await h.close() }
    await fs.promises.rename(tmp, f)
  }
  async function write(id, text) {
    if (typeof text !== 'string') throw new Error('a save is text')
    file(id)
    let q = queues.get(id)
    if (!q) { q = { latest: null, inFlight: null }; queues.set(id, q) }
    q.latest = text
    while (q.inFlight) await q.inFlight
    if (q.latest === null) return
    q.inFlight = (async () => {
      while (q.latest !== null) { const t = q.latest; q.latest = null; await writeAtomic(id, t) }
    })().finally(() => { q.inFlight = null })
    await q.inFlight
  }

  async function retire(id) {
    const from = file(id)
    const to = path.join(root(), 'retired', `${id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    await fs.promises.mkdir(path.dirname(to), { recursive: true })
    await fs.promises.rename(from, to)
  }

  function register(ipcMain) {
    ipcMain.handle('captains:list', () => list())
    ipcMain.handle('captains:retire', (_e, id) => retire(id))
    ipcMain.handle('save:where', (_e, id) => file(id))
    ipcMain.handle('save:read', (_e, id) => read(id))
    ipcMain.handle('save:write', (_e, id, text) => write(id, text))
  }

  return { migrate, register }
}

module.exports = { create }
