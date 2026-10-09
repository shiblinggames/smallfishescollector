// BUILD THE STEAM GAME (Godot port, 2026-10-04; for Steam Playtest).
//
//   node tools/build.mjs                    build the playtest channel
//   node tools/build.mjs --channel game     build the store game's channel
//   node tools/build.mjs --no-export        only (re)write the SteamPipe scripts
//
// 1. EXPORT TEMPLATES. Godot needs its export templates for this exact
//    version. When missing they are fetched once (about 1 GB) from Godot's
//    releases and unpacked where Godot looks for them.
// 2. THE ART. tools/setup.mjs copies the pictures in (art/ is not committed),
//    so the build always carries the current art.
// 3. THE EXPORT. The "Windows" preset (export_presets.cfg) into
//    build/steam/content/: SeasTheBooty.exe, its .pck, GodotSteam's DLLs.
// 4. THE CHANNEL. override.cfg beside the exe carries the channel's Steam App
//    ID (godot/steam/ids.json), which SteamLayer reads at start, and the build
//    stamp (version, commit, date) the title screen can show.
// 5. STEAMPIPE. app_build and depot_build scripts in build/steam/scripts/ for
//    the channel's app and depot, and the one steamcmd line to upload them.
//    You run that line yourself: it logs in to your builder account (your
//    password and Steam Guard code are typed into steamcmd, never here).

import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const IDS = path.join(HERE, '..', 'steam', 'ids.json')
const OUT = path.join(HERE, 'build', 'steam')
const CONTENT = path.join(OUT, 'content')
const SCRIPTS = path.join(OUT, 'scripts')
const VERSION = '4.7.2'
const TEMPLATE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Godot', 'export_templates', `${VERSION}.stable`)
const TEMPLATE_URL = `https://github.com/godotengine/godot-builds/releases/download/${VERSION}-stable/Godot_v${VERSION}-stable_export_templates.tpz`

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const channel = arg('--channel', 'playtest')
const doExport = !process.argv.includes('--no-export')

function godot() {
  if (process.env.GODOT) return process.env.GODOT
  const winget = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages')
  if (fs.existsSync(winget)) {
    for (const d of fs.readdirSync(winget)) {
      if (!d.startsWith('GodotEngine.GodotEngine')) continue
      for (const f of fs.readdirSync(path.join(winget, d))) {
        if (f.startsWith(`Godot_v${VERSION}`) && f.endsWith('_console.exe')) return path.join(winget, d, f)
      }
    }
  }
  return 'godot'
}

const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'))
const ch = ids[channel]
if (!ch) throw new Error(`No channel "${channel}" in godot/steam/ids.json`)

if (doExport) {
  // 1. Export templates.
  if (!fs.existsSync(path.join(TEMPLATE_DIR, 'windows_release_x86_64.exe'))) {
    console.log(`Fetching the Godot ${VERSION} export templates (once, about 1 GB)...`)
    const tpz = path.join(os.tmpdir(), `godot_${VERSION}_templates.tpz`)
    if (!fs.existsSync(tpz)) execFileSync('curl', ['-L', '--fail', '-o', tpz, TEMPLATE_URL], { stdio: 'inherit' })
    const tmp = path.join(os.tmpdir(), `godot_${VERSION}_templates`)
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })
    // Windows' own tar (bsdtar) reads the .tpz (a zip) and drive paths;
    // Git's GNU tar would take "C:" for a remote host.
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe') : 'tar'
    execFileSync(tar, ['-xf', tpz, '-C', tmp], { stdio: 'inherit' })
    fs.mkdirSync(path.dirname(TEMPLATE_DIR), { recursive: true })
    fs.rmSync(TEMPLATE_DIR, { recursive: true, force: true })
    fs.renameSync(path.join(tmp, 'templates'), TEMPLATE_DIR)
  }
  // 2. The art.
  execFileSync('node', [path.join(HERE, 'tools', 'setup.mjs')], { stdio: 'inherit', cwd: HERE })
  // 3. The export.
  fs.rmSync(CONTENT, { recursive: true, force: true })
  fs.mkdirSync(CONTENT, { recursive: true })
  console.log('Exporting...')
  execFileSync(godot(), ['--headless', '--path', HERE, '--export-release', 'Windows', path.join(CONTENT, 'SeasTheBooty.exe')], { stdio: 'inherit' })
  if (!fs.existsSync(path.join(CONTENT, 'SeasTheBooty.pck'))) throw new Error('The export wrote no .pck: see the output above.')
}

// 4. The channel: its App ID and the build stamp.
let commit = 'unknown'
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: HERE }).toString().trim() } catch {}
const stamp = `${channel} ${new Date().toISOString().slice(0, 10)} ${commit}`
fs.mkdirSync(CONTENT, { recursive: true })
fs.writeFileSync(path.join(CONTENT, 'override.cfg'), `; Written by tools/build.mjs: this build's Steam channel.\n[steam]\napp_id=${ch.appId}\n\n[application]\nconfig/build="${stamp}"\n\n[game]\nchannel="${channel}"\n`)
if (!ch.appId) console.log(`\nNOTE: the ${channel} channel has no appId yet in godot/steam/ids.json: the build runs without Steam until it does.`)

// 5. SteamPipe.
fs.mkdirSync(SCRIPTS, { recursive: true })
const q = (p) => p.replace(/\\/g, '\\\\')
const depotVdf = path.join(SCRIPTS, `depot_build_${ch.depotId}.vdf`)
fs.writeFileSync(depotVdf, `"DepotBuild"
{
	"DepotID" "${ch.depotId}"
	"FileMapping"
	{
		"LocalPath" "*"
		"DepotPath" "."
		"Recursive" "1"
	}
	"FileExclusion" "*.pdb"
	"FileExclusion" "steam_appid.txt"
}
`)
const appVdf = path.join(SCRIPTS, `app_build_${ch.appId}.vdf`)
fs.writeFileSync(appVdf, `"AppBuild"
{
	"AppID" "${ch.appId}"
	"Desc" "${stamp}"
	"ContentRoot" "${q(CONTENT)}"
	"BuildOutput" "${q(path.join(OUT, 'output'))}"
	"SetLive" "${ch.branch || ''}"
	"Depots"
	{
		"${ch.depotId}" "${q(depotVdf)}"
	}
}
`)
console.log(`\nBuilt ${stamp} into ${CONTENT}`)
if (ch.appId && ch.depotId) {
  console.log(`\nTo upload (steamcmd asks for the password and Steam Guard code itself):\n  steamcmd +login <your builder account> +run_app_build "${appVdf}" +quit`)
} else {
  console.log(`\nFill in the ${channel} appId and depotId in godot/steam/ids.json, then run this again for the upload line.`)
}
