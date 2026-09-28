// A save file on disk, through Node (the spike's tests and tools). The shell
// supplies its own SaveStorage over Tauri's file system; this one is kept out of
// the core's import tree on purpose.
//
// The write is atomic: the text goes to a sibling temp file, is flushed, and
// then renamed over the save. A crash mid-save leaves the OLD save whole rather
// than a half-written one.

import fs from 'fs'
import type { SaveStorage } from './saveFile'

export function nodeSaveStorage(file: string): SaveStorage {
  return {
    async read() {
      try { return await fs.promises.readFile(file, 'utf8') } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw e
      }
    },
    async write(text) {
      const tmp = `${file}.tmp`
      const h = await fs.promises.open(tmp, 'w')
      try { await h.writeFile(text, 'utf8'); await h.sync() } finally { await h.close() }
      await fs.promises.rename(tmp, file)
    },
  }
}
