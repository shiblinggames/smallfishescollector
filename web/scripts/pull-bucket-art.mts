// ONE-OFF: bring the Supabase storage art into public/ (Steam prep, Phase A
// step 3, 2026-09-28). Lists every object in the card-arts and enemy-arts
// buckets, downloads it, and writes it to public/<bucket>/<name>.webp
// (quality 85, longest side capped at 1400, alpha kept). The code reaches it
// through lib/artUrl (cardArt / enemyArt), which maps the database's .png
// filenames to the .webp here. Re-running is safe; existing files are
// overwritten. New art goes straight into public/, never into a bucket.

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function list(bucket: string, prefix = ''): Promise<string[]> {
  const res = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  })
  const rows = await res.json() as { name: string; id: string | null }[]
  const out: string[] = []
  for (const r of rows) {
    const full = prefix ? `${prefix}/${r.name}` : r.name
    if (r.id === null) out.push(...await list(bucket, full)) // a folder
    else out.push(full)
  }
  return out
}

let before = 0, after = 0, n = 0
for (const bucket of ['card-arts', 'enemy-arts']) {
  const names = await list(bucket)
  for (const name of names) {
    const src = await fetch(`${URL_}/storage/v1/object/public/${bucket}/${encodeURI(name)}`)
    if (!src.ok) { console.log(`skip ${bucket}/${name}: ${src.status}`); continue }
    const buf = Buffer.from(await src.arrayBuffer())
    const outRel = path.join('public', bucket, name.replace(/\.(png|jpe?g)$/i, '.webp'))
    fs.mkdirSync(path.dirname(outRel), { recursive: true })
    const img = sharp(buf).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    const webp = await img.webp({ quality: 85, alphaQuality: 90, effort: 5 }).toBuffer()
    fs.writeFileSync(outRel, webp)
    before += buf.length; after += webp.length; n++
  }
}
console.log(`${n} images: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`)
