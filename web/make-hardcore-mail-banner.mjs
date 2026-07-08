// One-off: crop the Davy Jones banner into a blood-dark mail banner for the
// Hardcore Gauntlet launch. Mail banner box ~2.43:1 at 140px tall; rendered at
// retina 820x338 with a red vignette so it reads as hardcore.
import sharp from 'sharp'

const SRC = 'public/davyjonesbanner.png'
const OUT = 'public/mail_hardcore_banner.png'
const W = 820, H = 338

// Blood vignette: clear at the centre (keeps Davy's face), red-black bleed at
// the edges (mirrors the in-game hardcore vignette).
const vignette = Buffer.from(`<svg width="${W}" height="${H}">
  <defs>
    <radialGradient id="g" cx="50%" cy="44%" r="72%">
      <stop offset="50%" stop-color="rgba(20,2,4,0)"/>
      <stop offset="86%" stop-color="rgba(110,8,15,0.42)"/>
      <stop offset="100%" stop-color="rgba(70,3,8,0.72)"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`)

const base = await sharp(SRC)
  .resize(W, H, { fit: 'cover', position: 'center' })
  .modulate({ brightness: 0.9 })
  .tint({ r: 255, g: 226, b: 221 })
  .toBuffer()

await sharp(base).composite([{ input: vignette, blend: 'over' }]).png().toFile(OUT)
const m = await sharp(OUT).metadata()
console.log('banner:', m.width + 'x' + m.height, '->', OUT)
