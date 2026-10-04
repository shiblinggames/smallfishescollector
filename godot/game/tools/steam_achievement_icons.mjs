// THE STEAM ACHIEVEMENT ICONS: for every row of godot/steam/achievements.csv,
// a 64px unlocked icon and a greyed, darkened locked one, from the badge art in
// web/public (the house art; nothing new painted). Steamworks takes them one
// by one on each achievement's page.
//
//   NODE_PATH=web/node_modules node godot/game/tools/steam_achievement_icons.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const ROOT = path.resolve(HERE, '..', '..', '..')
const CSV = path.join(ROOT, 'godot', 'steam', 'achievements.csv')
const OUT = path.join(ROOT, 'godot', 'steam', 'achievements')
fs.mkdirSync(OUT, { recursive: true })

const rows = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1)
let made = 0
const missing = []
for (const row of rows) {
  const id = row.split(',')[0]
  const image = row.split(',').pop().trim()
  const src = path.join(ROOT, 'web', 'public', image.replace(/^\//, ''))
  if (!image || !fs.existsSync(src)) { missing.push(id); continue }
  const base = sharp(src).resize(64, 64, { fit: 'contain', background: { r: 20, g: 16, b: 14, alpha: 1 } }).flatten({ background: { r: 20, g: 16, b: 14 } })
  await base.clone().png().toFile(path.join(OUT, `${id}.png`))
  await base.clone().grayscale().modulate({ brightness: 0.55 }).png().toFile(path.join(OUT, `${id}_locked.png`))
  made++
}
console.log(`icons: ${made} made${missing.length ? `, no art for ${missing.join(', ')}` : ''}`)
