import sharp from './web/node_modules/sharp/lib/index.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const [,, inputFile, ...names] = process.argv
if (!inputFile || names.length === 0) {
  console.error('Usage: node slice-fish.mjs <image.png> "Name One" "Name Two" ...')
  process.exit(1)
}

const cols = 3
const rows = Math.ceil(names.length / cols)

const img = sharp(path.resolve(__dirname, inputFile))
const meta = await img.metadata()
const tileW = Math.floor(meta.width / cols)
const tileH = Math.floor(meta.height / rows)

console.log(`Image: ${meta.width}x${meta.height}, tile: ${tileW}x${tileH}, grid: ${cols}x${rows}`)

for (let i = 0; i < names.length; i++) {
  const col = i % cols
  const row = Math.floor(i / cols)
  const slug = names[i].toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const outPath = path.resolve(__dirname, 'web/public/fish', `${slug}.png`)

  await sharp(path.resolve(__dirname, inputFile))
    .extract({ left: col * tileW, top: row * tileH, width: tileW, height: tileH })
    .toFile(outPath)

  console.log(`  [${row},${col}] ${names[i]} → fish/${slug}.png`)
}

console.log('Done.')
