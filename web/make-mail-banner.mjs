// One-off: crop Admiral Ruse's portrait into a wide mail banner that keeps
// his face visible. The mail banner box is 140px tall at ~340px wide
// (~2.43:1) with object-fit:cover, and his face sits in the upper portion,
// so a default center crop would cut off his head. We take the TOP band.
import sharp from 'sharp'

const SRC = 'public/raid5_admiralruse.png'
const OUT = 'public/mail_ch3_banner.png'

const meta = await sharp(SRC).metadata()
console.log('source:', meta.width, 'x', meta.height)

// 2.43:1 banner, generous resolution for retina. position 'top' keeps the
// spiky head + face and crops the torso/hand off the bottom.
await sharp(SRC)
  .resize(820, 338, { fit: 'cover', position: 'top' })
  .png()
  .toFile(OUT)

const out = await sharp(OUT).metadata()
console.log('banner:', out.width, 'x', out.height, '->', OUT)
