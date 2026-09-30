// PLAY THE GODOT BUILD (Godot port, 2026-09-30).
//
//   node tools/play.mjs            set up (content, art, GodotSteam), then play
//   node tools/play.mjs --editor   open the project in the Godot editor instead
//   node tools/play.mjs --pair     two windows, as two players (a Charter on
//                                  one machine, over the local network)
//
// Godot is found from GODOT, else the winget install, else `godot` on PATH.

import fs from 'fs'
import path from 'path'
import { execFileSync, spawn } from 'child_process'
import { fileURLToPath } from 'url'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function godot() {
  if (process.env.GODOT) return process.env.GODOT
  const winget = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages')
  if (fs.existsSync(winget)) {
    for (const dir of fs.readdirSync(winget).filter(d => d.startsWith('GodotEngine.GodotEngine'))) {
      const exe = fs.readdirSync(path.join(winget, dir)).find(f => /^Godot_v4.*_win64\.exe$/.test(f))
      if (exe) return path.join(winget, dir, exe)
    }
  }
  return 'godot'
}

execFileSync(process.execPath, [path.join(HERE, 'tools', 'setup.mjs')], { stdio: 'inherit' })
const gd = godot()
execFileSync(gd, ['--headless', '--path', HERE, '--import'], { stdio: 'ignore', timeout: 300000 })
if (process.argv.includes('--pair')) {
  // Two players on one machine: each is someone else (--as), in its own window.
  for (const [who, x] of [['founder', 40], ['crewmate', 980]]) {
    spawn(gd, ['--path', HERE, '--resolution', '900x620', '--position', `${x},60`, '--', `--as=${who}`], { detached: true, stdio: 'ignore' }).unref()
  }
} else {
  const args = process.argv.includes('--editor') ? ['--editor', '--path', HERE] : ['--path', HERE]
  spawn(gd, args, { detached: true, stdio: 'ignore' }).unref()
}
