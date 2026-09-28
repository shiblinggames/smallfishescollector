// Where the save lives on this machine.
//
// Inside the shell: a file in the app's data folder, through Tauri's file
// system, written atomically (a temp file, then a rename over the save), the
// same guarantee nodeSaveStorage gives the tests.
// In a plain browser (quick checks with `npm run dev`): localStorage.

import type { SaveStorage } from '@/lib/data/local/saveFile'

const FILE = 'captain.json'
const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function saveStorage(): Promise<{ storage: SaveStorage; where: string }> {
  if (inTauri()) {
    const fs = await import('@tauri-apps/plugin-fs')
    const { appDataDir, join } = await import('@tauri-apps/api/path')
    const dir = await appDataDir()
    const opts = { baseDir: fs.BaseDirectory.AppData }
    if (!(await fs.exists('', opts))) await fs.mkdir('', { ...opts, recursive: true })
    return {
      where: await join(dir, FILE),
      storage: {
        async read() {
          return (await fs.exists(FILE, opts)) ? fs.readTextFile(FILE, opts) : null
        },
        async write(text) {
          await fs.writeTextFile(`${FILE}.tmp`, text, opts)
          await fs.rename(`${FILE}.tmp`, FILE, { oldPathBaseDir: fs.BaseDirectory.AppData, newPathBaseDir: fs.BaseDirectory.AppData })
        },
      },
    }
  }
  return {
    where: 'browser localStorage',
    storage: {
      async read() { return localStorage.getItem(FILE) },
      async write(text) { localStorage.setItem(FILE, text) },
    },
  }
}
