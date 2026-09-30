// THE SCREENS THE SHELL CAN SHOW (Steam prep, 2026-09-30).
//
// Each web route is an async server component: it reads the database and hands
// a client component its props. Here each one is a LOADER that builds the same
// props from the save, and the same client component. The table grows a room at
// a time; a path not in it shows an honest "not aboard yet" with the way home.
//
// Loaders re-run whenever the screen calls router.refresh() (see
// ./shims/navigation), and the screen stays mounted while they do, exactly as a
// refreshed server page hands the same component new props.

import { lazy, type ComponentType } from 'react'
import { api, seaPageProps, marketPageProps, currentSave } from './localGameApi'

export type Screen = {
  /** Build the screen's props from the save. `q` is the URL's query. */
  load: (q: URLSearchParams) => Promise<Record<string, unknown>>
  Component: ComponentType<Record<string, unknown>>
}

const screen = (load: () => Promise<{ default: unknown }>) => lazy(load as () => Promise<{ default: ComponentType<Record<string, unknown>> }>)
const SeaMap = screen(() => import('@/app/(app)/sea/SeaMap'))
const MarketClient = screen(() => import('@/app/(app)/tavern/market/MarketClient'))
const Tavern = screen(() => import('./rooms/Tavern'))

export const SCREENS: Record<string, Screen> = {
  '/sea': {
    load: async (q) => seaPageProps({ open: q.get('open') ?? undefined, card: q.get('card') ?? undefined, boss: q.get('boss') ?? undefined }),
    Component: SeaMap,
  },
  '/tavern/market': { load: async () => marketPageProps(), Component: MarketClient },
  '/tavern': { load: async () => ({ seed: currentSave()!.uid, rap: await api.sea.folkState() }), Component: Tavern },
}

/** Where the shell opens, and where anything retired lands (the web sends
 *  / and the old rooms to the chart the same way). */
export const HOME = '/sea'
