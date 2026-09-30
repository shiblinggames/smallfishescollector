// STEAM ACHIEVEMENTS, FROM THE BADGES (Steam prep, 2026-09-29).
//
// Steamworks has no upload for an achievement list: each one is typed into the
// partner site. This writes what to type, and the icons to upload, so nothing
// is invented by hand:
//   desktop/steam/achievements.csv    one row per badge, in registry order
//   desktop/steam/achievement-icons/  <id>.jpg (earned) and <id>_locked.jpg
//                                     (greyed), git-ignored, rebuilt from here
//
// The API name IS the badge id, so the desktop shell unlocks by id with no
// table to keep (desktop/electron/steam.cjs). Icons are JPG on the game's navy,
// because Steam takes no transparency; ICON is the size the partner page asks
// for, change it there if Valve's page says otherwise.
//
//   npx tsx scripts/steam-achievements.mts

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { BADGES } from '../lib/badges'

const ICON = 256
const NAVY = { r: 7, g: 17, b: 28 }
const OUT = path.resolve(process.cwd(), '..', 'desktop', 'steam')
const ICONS = path.join(OUT, 'achievement-icons')
fs.mkdirSync(ICONS, { recursive: true })

const csv = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
const rows = ['api_name,display_name,description,difficulty,icon,icon_locked']
const missing: string[] = []
const idOk = /^[a-z0-9_]{1,64}$/

for (const b of BADGES) {
  if (!idOk.test(b.id)) throw new Error(`badge id ${b.id} is not a usable Steam API name`)
  const src = path.join(process.cwd(), 'public', b.imageUrl.replace(/^\//, ''))
  if (fs.existsSync(src)) {
    const base = sharp(src).resize(ICON, ICON, { fit: 'contain', background: { ...NAVY, alpha: 1 } }).flatten({ background: NAVY })
    await base.clone().jpeg({ quality: 90 }).toFile(path.join(ICONS, `${b.id}.jpg`))
    await base.clone().grayscale().modulate({ brightness: 0.55 }).jpeg({ quality: 90 }).toFile(path.join(ICONS, `${b.id}_locked.jpg`))
  } else missing.push(b.id)
  rows.push([b.id, b.name, b.description, b.difficulty, `${b.id}.jpg`, `${b.id}_locked.jpg`].map(csv).join(','))
}

fs.writeFileSync(path.join(OUT, 'achievements.csv'), rows.join('\n') + '\n')
const longest = BADGES.reduce((a, b) => b.description.length > a.description.length ? b : a)
console.log(`  ${BADGES.length} achievements -> desktop/steam/achievements.csv`)
console.log(`  icons: ${BADGES.length - missing.length} of ${BADGES.length} (${ICON}px, earned + locked)`)
if (missing.length) console.log(`  NO ART YET: ${missing.join(', ')}`)
console.log(`  longest description: ${longest.id}, ${longest.description.length} characters`)
