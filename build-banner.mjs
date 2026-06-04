// 728x90 marketing banner for Small Fishes: Seas the Booty.
//
// Renders N frames with sharp (gradient bg + title + tagline + a fish
// swimming across), writes them to .banner/frame_NNN.png, then hands
// off to ffmpeg to assemble an optimized looping GIF. Run:
//
//   node build-banner.mjs
//
// Output: small-fishes-banner.gif at repo root.

import sharp from './web/node_modules/sharp/lib/index.js'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const W = 728
const H = 90
const FRAMES = 36
const FPS = 18
const FRAME_DIR = path.resolve(__dirname, '.banner')
const OUT = path.resolve(__dirname, 'small-fishes-banner.gif')

const FISH_PATH = path.resolve(__dirname, 'web/public/fish/blue-marlin.png')

// SVG renderers — sharp's librsvg understands these inline.

function bgSvg() {
  // Deep ocean gradient + subtle radial highlight in the upper-left
  // so the title area gets a soft halo without needing a real shader.
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="#0c3a5e"/>
        <stop offset="55%" stop-color="#06243d"/>
        <stop offset="100%" stop-color="#020e1b"/>
      </linearGradient>
      <radialGradient id="halo" cx="0.18" cy="0.4" r="0.55">
        <stop offset="0%"  stop-color="#f0c040" stop-opacity="0.13"/>
        <stop offset="60%" stop-color="#f0c040" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#ocean)"/>
    <rect width="${W}" height="${H}" fill="url(#halo)"/>
    <!-- Subtle ripple lines so it doesn't read as flat -->
    <path d="M 0 60 Q 100 56 200 60 T 400 60 T 600 60 T 800 60" stroke="rgba(255,255,255,0.04)" stroke-width="1" fill="none"/>
    <path d="M 0 76 Q 110 72 210 76 T 410 76 T 610 76 T 810 76" stroke="rgba(255,255,255,0.03)" stroke-width="1" fill="none"/>
  </svg>`
}

function textSvg(glowAlpha) {
  // System serif/sans fallback — Cinzel/Karla aren't on the renderer.
  // Stagger the title across two lines so it lands centered vertically
  // in the 90px band without crowding the tagline.
  const titleGlow = `drop-shadow(0 0 ${Math.round(6 + glowAlpha * 8)}px rgba(240,192,64,${0.35 + glowAlpha * 0.4}))`
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <g style="filter: ${titleGlow}; font-family: Georgia, serif;">
      <text x="22" y="38" font-size="26" font-weight="bold" fill="#fff5d0" letter-spacing="1">
        SMALL FISHES
      </text>
      <text x="22" y="60" font-size="13" font-weight="600" fill="#f0c040" letter-spacing="3">
        SEAS THE BOOTY
      </text>
    </g>
    <text x="22" y="80" font-size="11" font-family="Helvetica, Arial, sans-serif" fill="rgba(240,237,232,0.78)" letter-spacing="0.3">
      Catch like Pokémon. Settle like Stardew. A cozy pirate fishing RPG.
    </text>
  </svg>`
}

function sparkleSvg(frame) {
  // Three sparkles drifting through the title halo; each has its own
  // phase so they don't pulse in unison.
  const phase = frame / FRAMES * Math.PI * 2
  const dots = [
    { x: 30,  y: 18, p: 0,           r: 1.6 },
    { x: 200, y: 30, p: Math.PI * 0.7, r: 1.1 },
    { x: 90,  y: 50, p: Math.PI * 1.3, r: 1.3 },
  ].map(d => {
    const a = (Math.sin(phase + d.p) + 1) / 2 * 0.85 + 0.15
    return `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="#ffe8a8" opacity="${a.toFixed(3)}"/>`
  }).join('')
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${dots}</svg>`
}

async function makeFrame(frame, fishBuf) {
  // Fish swims left-to-right across the right two-thirds of the banner.
  // Starts off-screen-right, ends off-screen-left of the title area so
  // it loops cleanly. Subtle vertical bob via a sine.
  const t = frame / FRAMES
  const fishX = Math.round(W - 100 - t * (W * 0.55))
  const fishY = Math.round(15 + Math.sin(t * Math.PI * 2) * 4)
  // Title glow phase — slow pulse so it breathes once per loop.
  const glow = (Math.sin(t * Math.PI * 2) + 1) / 2

  const base = await sharp(Buffer.from(bgSvg())).png().toBuffer()
  const text = await sharp(Buffer.from(textSvg(glow))).png().toBuffer()
  const sparkle = await sharp(Buffer.from(sparkleSvg(frame))).png().toBuffer()

  return sharp(base)
    .composite([
      { input: fishBuf, left: fishX, top: fishY },
      { input: text,    left: 0,     top: 0 },
      { input: sparkle, left: 0,     top: 0 },
    ])
    .png()
    .toBuffer()
}

async function main() {
  await rm(FRAME_DIR, { recursive: true, force: true })
  await mkdir(FRAME_DIR, { recursive: true })

  // Pre-process fish: resize down, drop-shadow via blurred dup, golden tint
  // so it pops against the ocean instead of getting lost in the gradient.
  const fishRaw = await readFile(FISH_PATH)
  const fishMain = await sharp(fishRaw)
    .resize({ height: 56, fit: 'inside' })
    .modulate({ saturation: 1.4, brightness: 1.05 })
    .toBuffer()

  console.log(`Rendering ${FRAMES} frames at ${W}x${H}…`)
  for (let i = 0; i < FRAMES; i++) {
    const buf = await makeFrame(i, fishMain)
    const num = String(i).padStart(3, '0')
    await writeFile(path.join(FRAME_DIR, `frame_${num}.png`), buf)
    if (i % 6 === 0) process.stdout.write(`  ${i + 1}/${FRAMES}\n`)
  }

  console.log('Assembling GIF…')
  await new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(FPS),
      '-i', path.join(FRAME_DIR, 'frame_%03d.png'),
      '-loop', '0',
      '-filter_complex', '[0:v] split [a][b]; [a] palettegen=max_colors=128:stats_mode=full [p]; [b][p] paletteuse=dither=bayer:bayer_scale=4',
      OUT,
    ]
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] })
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
  })

  console.log(`\nWrote ${OUT}`)
}

main().catch(err => { console.error(err); process.exit(1) })
