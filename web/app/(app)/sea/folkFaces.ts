// The regulars' faces, as a list of files, so the boot screen can fetch them
// before the chart needs them. FolkPanel warms the same set on mount; this is
// the same list a screen earlier, from a module small enough to be imported by
// the loading screen without dragging the panel's chunk with it.
import { FOLK } from '@/lib/seaFolk'
import { getCharacterSprites } from '@/lib/characters'
import { HATS } from '@/lib/hats'

export function folkFaceUrls(): string[] {
  const urls = new Set<string>()
  for (const f of FOLK.map(x => x.face)) {
    urls.add(getCharacterSprites(f.characterColor).rest)
    const hat = HATS.find(h => h.id === f.hat)
    if (hat?.restImageUrl) urls.add(hat.restImageUrl)
  }
  return [...urls]
}
