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
import { seaPageProps } from './localGameApi'

export type Screen = {
  /** Build the screen's props from the save. `q` is the URL's query. */
  load: (q: URLSearchParams) => Promise<Record<string, unknown>>
  Component: ComponentType<Record<string, unknown>>
}

const SeaMap = lazy(() => import('@/app/(app)/sea/SeaMap')) as unknown as ComponentType<Record<string, unknown>>

export const SCREENS: Record<string, Screen> = {
  '/sea': {
    load: async (q) => seaPageProps({ open: q.get('open') ?? undefined, card: q.get('card') ?? undefined, boss: q.get('boss') ?? undefined }),
    Component: SeaMap,
  },
}

/** Where the shell opens, and where anything retired lands (the web sends
 *  / and the old rooms to the chart the same way). */
export const HOME = '/sea'
