// RUN THE PARITY CHECK END TO END (Godot port, stage 0, 2026-09-30).
//
//   node tools/parity.mjs
//
// 1. the content copies must match web/ (setup.mjs --check);
// 2. the TypeScript rules write fresh cases (web/scripts/parity-export.mts);
// 3. Godot imports the project (so class_name scripts resolve) and replays
//    them (tests/parity.gd). Exits non-zero if any step fails.
//
// Godot is found from GODOT, else the winget install, else `godot` on PATH.

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const WEB = path.join(HERE, '..', '..', 'web')

function godot() {
  if (process.env.GODOT) return process.env.GODOT
  const winget = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages')
  if (fs.existsSync(winget)) {
    for (const dir of fs.readdirSync(winget).filter(d => d.startsWith('GodotEngine.GodotEngine'))) {
      const exe = fs.readdirSync(path.join(winget, dir)).find(f => /^Godot_v4.*_console\.exe$/.test(f))
      if (exe) return path.join(winget, dir, exe)
    }
  }
  return 'godot'
}

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx', timeout: 600000 })

try {
  run(process.execPath, [path.join(HERE, 'tools', 'setup.mjs'), '--check'], HERE)
  run('npx', ['tsx', 'scripts/parity-export.mts'], WEB)
  const gd = godot()
  execFileSync(gd, ['--headless', '--path', HERE, '--import'], { stdio: 'ignore', timeout: 300000 })
  run(gd, ['--headless', '--path', HERE, '-s', 'tests/parity.gd'], HERE)
} catch (e) {
  process.exit(typeof e.status === 'number' && e.status ? e.status : 1)
}
