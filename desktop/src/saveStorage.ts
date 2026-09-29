// Where the save lives on this machine.
//
// Inside the shell: a file in the app's data folder. The page cannot touch the
// disk itself; the preload (electron/preload.cjs) hands it window.stbSave, and
// the main process writes the file atomically (a temp file, then a rename over
// the save), the same guarantee nodeSaveStorage gives the tests.
// In a plain browser (quick checks with `npm run dev`): localStorage.

import type { SaveStorage } from '@/lib/data/local/saveFile'

const FILE = 'captain.json'

type ShellSave = { where(): Promise<string>; read(): Promise<string | null>; write(text: string): Promise<void> }
const shellSave = () => (window as unknown as { stbSave?: ShellSave }).stbSave

export async function saveStorage(): Promise<{ storage: SaveStorage; where: string }> {
  const shell = shellSave()
  if (shell) {
    return {
      where: await shell.where(),
      storage: { read: () => shell.read(), write: (text) => shell.write(text) },
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
