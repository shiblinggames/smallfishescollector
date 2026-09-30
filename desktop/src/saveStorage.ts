// Where the captains' saves live on this machine.
//
// Inside the shell: one file per captain in the app's data folder
// (electron/captains.cjs). The page cannot touch the disk itself; the preload
// hands it window.stbSave, and the main process writes each file atomically (a
// temp file, then a rename over the save), the same guarantee nodeSaveStorage
// gives the tests. In a plain browser (quick checks with `npm run dev`):
// localStorage, one key per captain.

import type { SaveStorage } from '@/lib/data/local/saveFile'

/** What the captain select shows for one save. A save that will not parse is
 *  listed as damaged rather than hidden. */
export type CaptainEntry = {
  id: string
  damaged?: boolean
  savedAt?: string | null
  name?: string | null
  fishingXp?: number
  expeditionXp?: number
  doubloons?: number
  color?: string
  hat?: string | null
  setUp?: boolean
}

type ShellSave = {
  list(): Promise<CaptainEntry[]>
  retire(id: string): Promise<void>
  where(id: string): Promise<string>
  read(id: string): Promise<string | null>
  write(id: string, text: string): Promise<void>
}
const shellSave = () => (window as unknown as { stbSave?: ShellSave }).stbSave

const KEY = (id: string) => `captain:${id}`

/** Every captain on this machine, the most recently played first. */
export async function listCaptains(): Promise<CaptainEntry[]> {
  const shell = shellSave()
  if (shell) return shell.list()
  const out: CaptainEntry[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith('captain:')) continue
    const id = k.slice('captain:'.length)
    try {
      const f = JSON.parse(localStorage.getItem(k) ?? '')
      const p = f?.save?.profile ?? {}
      out.push({ id, savedAt: f.savedAt ?? null, name: p.username ?? null, fishingXp: Number(p.fishing_xp ?? 0), expeditionXp: Number(p.expedition_xp ?? 0), doubloons: Number(p.doubloons ?? 0), color: p.character_color ?? 'default', hat: p.equipped_hat ?? null, setUp: p.has_seen_setup === true })
    } catch { out.push({ id, damaged: true }) }
  }
  return out.sort((a, b) => String(b.savedAt ?? '').localeCompare(String(a.savedAt ?? '')))
}

/** Put a captain's save aside. In the shell the file moves to retired/, never deleted. */
export async function retireCaptain(id: string): Promise<void> {
  const shell = shellSave()
  if (shell) return shell.retire(id)
  const text = localStorage.getItem(KEY(id))
  if (text != null) localStorage.setItem(`retired:${id}:${Date.now()}`, text)
  localStorage.removeItem(KEY(id))
}

/** The store for one captain's save. */
export async function saveStorage(id: string): Promise<{ storage: SaveStorage; where: string }> {
  const shell = shellSave()
  if (shell) {
    return {
      where: await shell.where(id),
      storage: { read: () => shell.read(id), write: (text) => shell.write(id, text) },
    }
  }
  return {
    where: 'browser localStorage',
    storage: {
      async read() { return localStorage.getItem(KEY(id)) },
      async write(text) { localStorage.setItem(KEY(id), text) },
    },
  }
}

/** A fresh captain id: the save's uid and its file name. */
export function newCaptainId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return 'captain-' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}
