export const TAB_ORDER: Record<string, number> = {
  '/tavern':      0,
  '/packs':       1,
  '/collection':  2,
  '/marketplace': 3,
}

export function getTabDirection(fromPath: string, toPath: string): number {
  const fromRoot = '/' + fromPath.split('/')[1]
  const toRoot = '/' + toPath.split('/')[1]
  const from = TAB_ORDER[fromRoot] ?? -1
  const to = TAB_ORDER[toRoot] ?? -1
  if (from === -1 || to === -1) return 0
  return to > from ? 1 : to < from ? -1 : 0
}
