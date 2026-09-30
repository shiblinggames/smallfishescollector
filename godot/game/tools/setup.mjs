// SET UP THE GODOT PROJECT (Godot port, stage 0, 2026-09-30).
//
//   node tools/setup.mjs          copy the content in, fetch GodotSteam
//   node tools/setup.mjs --check  fail if the content here differs from web/
//
// 1. CONTENT. The game's data lives in web/content (the web is still the
//    source of truth while the port runs). Godot cannot read outside its
//    project, so the files it needs are copied into content/ and committed,
//    and --check fails when a copy has drifted from web/.
// 2. GODOTSTEAM. The GDExtension build (Godot 4.4+), pinned by version and
//    checksum and unpacked into addons/godotsteam. Its binaries are not
//    committed (godot/.gitignore); this fetches them on a new machine.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const WEB = path.join(HERE, '..', '..', 'web')

/** The web content the port reads so far. Add a file here as a system is ported. */
const CONTENT = ['fish_species.json', 'profile_defaults.json']

const GODOTSTEAM = {
  version: '4.22.1',
  url: 'https://codeberg.org/godotsteam/godotsteam/archive/baa0b1c2c16b822c9641f94f7d38558b21a3daf2.zip',
  sha256: 'aa31d7208c651f80ef1fccf1be96a4e476c1abf0fb018dd72d9db7bc2929971d',
}

const check = process.argv.includes('--check')
let bad = 0

fs.mkdirSync(path.join(HERE, 'content'), { recursive: true })
for (const name of CONTENT) {
  const from = path.join(WEB, 'content', name)
  const to = path.join(HERE, 'content', name)
  const src = fs.readFileSync(from)
  if (check) {
    if (!fs.existsSync(to) || !src.equals(fs.readFileSync(to))) { console.log(`  DRIFT content/${name} differs from web/content (run node tools/setup.mjs)`); bad++ }
  } else if (!fs.existsSync(to) || !src.equals(fs.readFileSync(to))) {
    fs.writeFileSync(to, src)
    console.log(`  content/${name} copied`)
  }
}
if (check) {
  console.log(bad ? `  ${bad} content file(s) drifted` : `  content: ${CONTENT.length} files match web/`)
  process.exit(bad ? 1 : 0)
}

const addon = path.join(HERE, 'addons', 'godotsteam')
const stamp = path.join(addon, '.version')
if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === GODOTSTEAM.version) {
  console.log(`  GodotSteam ${GODOTSTEAM.version} already in addons/`)
} else {
  const res = await fetch(GODOTSTEAM.url)
  if (!res.ok) throw new Error(`GodotSteam download failed: ${res.status}`)
  const zip = Buffer.from(await res.arrayBuffer())
  const sum = crypto.createHash('sha256').update(zip).digest('hex')
  if (sum !== GODOTSTEAM.sha256) throw new Error(`GodotSteam checksum mismatch: ${sum}`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'godotsteam-'))
  const file = path.join(tmp, 'gs.zip')
  fs.writeFileSync(file, zip)
  // bsdtar reads zips: Windows 10+ ships it in System32 (named in full, since
  // Git Bash's GNU tar may come first on PATH and cannot), macOS has it as tar.
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  execFileSync(tar, ['-xf', 'gs.zip'], { cwd: tmp })
  fs.rmSync(addon, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(addon), { recursive: true })
  fs.cpSync(path.join(tmp, 'godotsteam', 'addons', 'godotsteam'), addon, { recursive: true })
  fs.writeFileSync(stamp, GODOTSTEAM.version + '\n')
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`  GodotSteam ${GODOTSTEAM.version} unpacked into addons/godotsteam`)
}
