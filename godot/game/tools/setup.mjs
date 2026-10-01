// SET UP THE GODOT PROJECT (Godot port, stage 0, 2026-09-30).
//
//   node tools/setup.mjs          copy the content in, fetch GodotSteam
//   node tools/setup.mjs --check  fail if the content here differs from web/
//
// 1. CONTENT. The game's data lives in web/content (the web is still the
//    source of truth while the port runs). Godot cannot read outside its
//    project, so the files it needs are copied into content/ and committed,
//    and --check fails when a copy has drifted from web/.
// 2. ART. The pictures live in web/public (the web is still their home), and
//    they are big (the fish alone are 22 MB), so they are COPIED into art/ and
//    not committed a second time. ART names what the port draws so far; add a
//    path as a screen needs it. The fonts come from the desktop shell's
//    @fontsource packages.
// 3. GODOTSTEAM. The GDExtension build (Godot 4.4+), pinned by version and
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

/** Files or folders under web/public, copied to art/ at the same path. A name
 *  with a * matches any run of characters within its folder. */
const ART = [
  'fishing_rest.png', 'fishing_cast.png', 'fishing_wait.png', 'fishing_*.png', 'fish', 'sea/port-mainland.webp',
  // The look on the boat: every hat, boat, rod, reel and hook sprite, and the loadout's backdrop.
  'hat*_rest.png', 'hat*_cast.png', 'boat_*_cast.png', 'rod_*.png', 'reel_*.png', 'hook_*.png', 'autocaster.png', 'welcome-harbour-open.webp',
  // The Almanac.
  'almanac-paper.jpg', 'ancient.jpg',
  // The Ancient Deep's scenes.
  'scenes/last-fathom.jpg', 'finn_portrait.png',
  // The crate moment, the golden choice, loot and level-up art.
  '*crateclosed.png', '*crateopen.png', 'smallpile.png', 'hat_*_rest.png', 'boat_*_rest.png',
  'worms.png', 'minnow.png', 'nightcrawler.png', 'chum.png', 'anglersformula.png', 'luminouslure.png', 'goldenlure.png',
  'parrot_*.png', 'monkey_*.png', 'seal_*.png', 'lizard_*.png', 'raccoon_*.png', 'crab_*.png', 'plesiosaur_baby.png',
  // Docking: the Mainland's town, the doors ashore, the Tackle Shop's backdrop and the lines.
  'sea/port-*.webp', 'sea/tally-house-v2.webp', 'crew/hall_1.png', 'crew/drill_1.png', 'crew/stores_1.png', 'sea/posting-house-v3.webp',
  'forge/forge.png', 'sea/gunwharf-v3.webp', 'sea/charterhouse-v2.webp', 'sea/trawl-harbor-v3.webp', 'sea/shipyard-v3.webp', 'sea/smack.png',
  'sea/mainland-town.png', 'sea/tavern.png', 'sea/market.png', 'sea/tackle.png', 'sea/parlor.png', 'sea/den.png', 'sea/charting.png',
  'tackle-shop-page-bg.jpg', 'monofilament.png', 'braidedline.png', 'copolymer.png', 'fluorocarbon.png', 'titaniumwire.png', 'deepsealine.png',
  // Sound: the cast, the line hitting the water, the perfect, the dial's tick, and the day, dusk and night music.
  'fishingcast.mp3', 'fishingcast2.mp3', 'fishingperfect.mp3', 'fishingdial.ogg',
  'fishingsoundtrack.ogg', 'fishingsoundtrackopen.ogg', 'fishingsoundtrackdeep.ogg',
]
/** Fonts: [package, file] under desktop/node_modules/@fontsource, to art/fonts. */
const FONTS = [
  ...[600, 700, 800, 900].map(w => ['cinzel', `cinzel-latin-${w}-normal.woff2`]),
  ...[300, 400, 500, 600, 700, 800].map(w => ['karla', `karla-latin-${w}-normal.woff2`]),
]

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

let copied = 0
const copyIfChanged = (from, to) => {
  const src = fs.readFileSync(from)
  if (fs.existsSync(to) && src.equals(fs.readFileSync(to))) return
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.writeFileSync(to, src)
  copied++
}
for (const rel of ART) {
  if (rel.includes('*')) {
    const dir = path.dirname(rel)
    const re = new RegExp('^' + path.basename(rel).split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
    const src = path.join(WEB, 'public', dir)
    for (const f of fs.readdirSync(src)) if (re.test(f) && fs.statSync(path.join(src, f)).isFile()) copyIfChanged(path.join(src, f), path.join(HERE, 'art', dir, f))
    continue
  }
  const from = path.join(WEB, 'public', rel)
  if (fs.statSync(from).isDirectory()) {
    for (const f of fs.readdirSync(from)) if (fs.statSync(path.join(from, f)).isFile()) copyIfChanged(path.join(from, f), path.join(HERE, 'art', rel, f))
  } else copyIfChanged(from, path.join(HERE, 'art', rel))
}
const FONTSRC = path.join(HERE, '..', '..', 'desktop', 'node_modules', '@fontsource')
for (const [pkg, file] of FONTS) {
  const from = path.join(FONTSRC, pkg, 'files', file)
  if (fs.existsSync(from)) copyIfChanged(from, path.join(HERE, 'art', 'fonts', file))
  else console.log(`  font missing: ${pkg}/${file} (run npm install in desktop/)`)
}
console.log(copied ? `  art: ${copied} file(s) copied from web/public` : '  art: up to date')

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
