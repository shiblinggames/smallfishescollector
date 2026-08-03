import sharp from 'sharp'
const OUT = 'C:/Users/Kong/AppData/Local/Temp/claude/c--Users-Kong-Projects-shiblinggames-smallfishes/4564b114-4a5e-416b-a841-64ce0de03450/scratchpad'
// The mail banner is a fixed 140px-tall box with object-fit: cover. On a
// ~350px-wide phone that is 2.5:1, so a 200x200 square keeps only its middle
// 40% vertically. Render exactly that, to see it before sending it.
for (const name of ['hall_6', 'hall_5', 'drill_6']) {
  await sharp('public/crew/' + name + '.png')
    .flatten({ background: '#16130f' })
    .resize(350, 140, { fit: 'cover', position: 'centre' })
    .png().toFile(OUT + '/crop_' + name + '.png')
}
await sharp({ create: { width: 350, height: 3 * 146, channels: 4, background: { r: 10, g: 8, b: 6, alpha: 1 } } })
  .composite(['hall_6', 'hall_5', 'drill_6'].map((n, i) => ({ input: OUT + '/crop_' + n + '.png', left: 0, top: i * 146 })))
  .png().toFile(OUT + '/crops.png')
console.log('rendered')
