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
import { createRequire } from 'module'

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
  'sea/mainland-town.png', 'sea/isle-*.webp', 'sea/isle-chest.png', 'sea/isle-chest-deep.png', 'sea/isle-chest-open.png',
  'sea/isle-note.png', 'sea/dig-box.png', 'sea/sea-bottle.png', 'sea-clouds.webp', 'sea/tavern.png', 'sea/market.png', 'sea/tackle.png', 'sea/parlor.png', 'sea/den.png', 'sea/charting.png',
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
// THE CAPTAIN SHEETS lose their painted ripple. Each fishing_<color>_<pose>
// sheet has a pale smear of water painted under its plain hull, and the sheet
// is drawn under every boat, so a static ripple sat on every hull; the port
// draws its own water (the wake's rings, the reflection, the sea up the hull).
// Translucent, non-brown pixels in the bottom 30%, inside the hull's width
// (the fishing line hangs outside it and is kept). Remembered by the source's
// hash so it only runs when the web's art changes.
const SHEET = /^fishing_(.+_)?(rest|wait|cast)\.png$/
const DERIPPLED = path.join(HERE, 'art', '.derippled.json')
const derippled = fs.existsSync(DERIPPLED) ? JSON.parse(fs.readFileSync(DERIPPLED, 'utf8')) : {}
const sheets = []
const copyIfChanged = (from, to) => {
  const src = fs.readFileSync(from)
  if (SHEET.test(path.basename(to))) {
    const sha = crypto.createHash('sha256').update(src).digest('hex')
    if (derippled[path.basename(to)] === sha && fs.existsSync(to)) return
    sheets.push({ to, src, sha })
    return
  }
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
if (sheets.length) {
  const sharp = createRequire(path.join(WEB, 'package.json'))('sharp')
  for (const { to, src, sha } of sheets) {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const W = info.width, H = info.height, y0 = Math.floor(H * 0.7)
    const brown = i => data[i] > data[i + 1] && data[i + 1] >= data[i + 2] && data[i] - data[i + 2] > 40
    let lo = W, hi = -1
    for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      if (data[i + 3] >= 200 && brown(i)) { if (x < lo) lo = x; if (x > hi) hi = x }
    }
    if (hi >= 0) {
      for (let y = y0; y < H; y++) for (let x = Math.max(0, lo - 50); x <= Math.min(W - 1, hi + 50); x++) {
        const i = (y * W + x) * 4
        if (data[i + 3] > 0 && data[i + 3] < 200 && !brown(i)) data[i + 3] = 0
      }
    }
    fs.mkdirSync(path.dirname(to), { recursive: true })
    await sharp(data, { raw: info }).png().toFile(to)
    derippled[path.basename(to)] = sha
    copied++
  }
  fs.writeFileSync(DERIPPLED, JSON.stringify(derippled, null, 1))
}
// NORMAL MAPS for the land (Godot over the web baseline): each island plate
// and building gets a <name>.n.png beside it, so the 2D lights (the sun as it
// crosses the sky, the lanterns at night) shade the painting from the right
// side. Built from the painting: its blurred brightness as fine relief, and its
// blurred alpha as a rounded rim, through a Sobel. Remembered by hash.
const LANDS = [
  'sea/port-mainland.webp', 'sea/mainland-town.png', 'sea/port-home.webp', 'sea/port-tally-house.webp', 'sea/tally-house-v2.webp',
  'sea/port-crew-hall.webp', 'crew/hall_1.png', 'crew/drill_1.png', 'crew/stores_1.png', 'sea/port-posting-house.webp',
  'sea/posting-house-v3.webp', 'sea/port-forge.webp', 'forge/forge.png', 'sea/port-gunwharf.webp', 'sea/gunwharf-v3.webp',
  'sea/port-charterhouse.webp', 'sea/charterhouse-v2.webp', 'sea/port-trawl-harbor.webp', 'sea/trawl-harbor-v3.webp',
  'sea/port-shipyard.webp', 'sea/shipyard-v3.webp', 'sea/isle-plate-1.webp', 'sea/isle-shallows.webp', 'sea/isle-open.webp',
  'sea/isle-deep.webp', 'sea/isle-abyss.webp', 'sea/isle-ancient.webp',
]
const NORMALS = path.join(HERE, 'art', '.normals.json')
const normals = fs.existsSync(NORMALS) ? JSON.parse(fs.readFileSync(NORMALS, 'utf8')) : {}
let made = 0
for (const rel of LANDS) {
  const from = path.join(WEB, 'public', rel)
  if (!fs.existsSync(from)) continue
  const src = fs.readFileSync(from)
  const sha = crypto.createHash('sha256').update(src).digest('hex')
  const to = path.join(HERE, 'art', rel.replace(/\.[a-z]+$/, '.n.png'))
  if (normals[rel] === sha && fs.existsSync(to)) continue
  const sharp = createRequire(path.join(WEB, 'package.json'))('sharp')
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height
  const lum = new Float32Array(W * H), alp = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3] / 255
    alp[i] = a
    lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255 * a
  }
  const blur = (f, r) => {
    const t = new Float32Array(W * H), o = new Float32Array(W * H)
    for (let y = 0; y < H; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += f[y * W + Math.min(W - 1, Math.max(0, x))]
      for (let x = 0; x < W; x++) { t[y * W + x] = acc / (2 * r + 1); acc += f[y * W + Math.min(W - 1, x + r + 1)] - f[y * W + Math.max(0, x - r)] } }
    for (let x = 0; x < W; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += t[Math.min(H - 1, Math.max(0, y)) * W + x]
      for (let y = 0; y < H; y++) { o[y * W + x] = acc / (2 * r + 1); acc += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x] } }
    return o
  }
  const k = Math.max(1, Math.round(W / 500))
  const fine = blur(lum, k), rim = blur(alp, k * 6)
  const h = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) h[i] = fine[i] * 0.9 + rim[i] * 0.7
  const out = Buffer.alloc(W * H * 4)
  const S = 1.7 / k
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const at = (xx, yy) => h[Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))]
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))
    let nx = -dx * S, ny = -dy * S, nz = 1
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l
    const i = (y * W + x) * 4
    out[i] = Math.round((nx * 0.5 + 0.5) * 255); out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255); out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255); out[i + 3] = 255
  }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(to)
  normals[rel] = sha
  made++
}
if (made) fs.writeFileSync(NORMALS, JSON.stringify(normals, null, 1))
if (made) console.log(`  normals: ${made} made`)
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
