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
import { redirect } from './shims/navigation'
import { isPremiumActive } from '@/lib/premium'
import { storyLogData } from '@/app/(app)/achievements/storyLogData'
import { api, seaPageProps, marketPageProps, parlorLobbyProps, fishArtPool, tackleShopProps, homePageProps, gauntletPageProps, badgesPageModel, profilePageProps, currentSave } from './localGameApi'
import { chartRoomLobbyProps } from '@/lib/core/lobbies'

export type Screen = {
  /** Build the screen's props from the save. `q` is the URL's query. */
  load: (q: URLSearchParams) => Promise<Record<string, unknown>>
  Component: ComponentType<Record<string, unknown>>
}

const screen = (load: () => Promise<{ default: unknown }>) => lazy(load as () => Promise<{ default: ComponentType<Record<string, unknown>> }>)
const SeaMap = screen(() => import('@/app/(app)/sea/SeaMap'))
const MarketClient = screen(() => import('@/app/(app)/tavern/market/MarketClient'))
const Tavern = screen(() => import('./rooms/Tavern'))
const ShipyardClient = screen(() => import('@/app/(app)/shipyard/ShipyardClient'))
const TrawlDocksClient = screen(() => import('@/app/(app)/trawl-docks/TrawlDocksClient'))
const SlotsView = screen(() => import('@/app/(app)/tavern/SlotsView'))
const RouletteView = screen(() => import('@/app/(app)/tavern/roulette/RouletteView'))
const WorldChartClient = screen(() => import('@/app/(app)/charting/world-chart/WorldChartClient'))
const CaptainsLogView = screen(() => import('@/app/(app)/achievements/CaptainsLogView'))
// The puzzles sit in the same frames their web pages use.
const Charting = screen(() => import('./rooms/Puzzles').then(m => ({ default: m.Charting })))
const ChartRoomPuzzle = screen(() => import('./rooms/Puzzles').then(m => ({ default: m.ChartRoomPuzzle })))
const ParlorGame = screen(() => import('./rooms/Puzzles').then(m => ({ default: m.ParlorGame })))
const Lobby = screen(() => import('./rooms/Lobbies'))
const BlackjackView = screen(() => import('@/app/(app)/tavern/blackjack/BlackjackView'))
const TackleShopView = screen(() => import('@/app/(app)/marketplace/tackle-shop/TackleShopView'))
const HomeClient = screen(() => import('@/app/(app)/home/HomeClient'))
const Gauntlet = screen(() => import('./rooms/Gauntlet'))
const BadgesView = screen(() => import('@/app/(app)/badges/BadgesView'))
const Profile = screen(() => import('./rooms/Profile'))
const OnlineOnly = screen(() => import('./rooms/OnlineOnly'))

export const SCREENS: Record<string, Screen> = {
  '/sea': {
    load: async (q) => seaPageProps({ open: q.get('open') ?? undefined, card: q.get('card') ?? undefined, boss: q.get('boss') ?? undefined }),
    Component: SeaMap,
  },
  '/tavern/market': { load: async () => marketPageProps(), Component: MarketClient },
  '/shipyard': {
    load: async () => { const state = await api.harbour.shipyardState(); if ('error' in state) redirect('/sea'); return state },
    Component: ShipyardClient,
  },
  '/trawl-docks': { load: async () => ({ daily: await api.dailies.getDailyChallenge() }), Component: TrawlDocksClient },
  '/tavern/slots': {
    load: async () => {
      const [wallet, stats, jackpot] = await Promise.all([api.casino.getCasinoState(), api.casino.getSlotStats(), api.casino.getSlotsJackpot()])
      return { wallet, stats, jackpot }
    },
    Component: SlotsView,
  },
  '/tavern/roulette': { load: async () => ({ initial: await api.casino.getRouletteState() }), Component: RouletteView },
  '/charting': { load: async () => ({ game: 'match', state: await api.chartRoom.getMatchState() }), Component: Charting },
  '/charting/minefield': { load: async () => ({ game: 'minefield', state: await api.chartRoom.getMinefieldState() }), Component: Charting },
  '/charting/world-chart': { load: async () => api.chartRoom.getWorldChartState(), Component: WorldChartClient },
  '/tavern/chart-room/hold': { load: async () => ({ game: 'hold', state: await api.chartRoom.getHoldState() }), Component: ChartRoomPuzzle },
  '/tavern/chart-room/rigging': {
    // A Captain's puzzle, as on the web: anyone else goes back to the Chart Room.
    load: async () => {
      if (!isPremiumActive(currentSave()!.profile)) redirect('/tavern/chart-room')
      return { game: 'rigging', state: await api.chartRoom.getRiggingState() }
    },
    Component: ChartRoomPuzzle,
  },
  '/tavern/chart-room': {
    load: async () => {
      const [hold, match, minefield, rigging] = await Promise.all([
        api.chartRoom.getHoldState(), api.chartRoom.getMatchState(), api.chartRoom.getMinefieldState(), api.chartRoom.getRiggingState(),
      ])
      return { room: 'chart-room', props: chartRoomLobbyProps({ profile: currentSave()!.profile, hold, match, minefield, rigging, topCharters: [] }) }
    },
    Component: Lobby,
  },
  '/tavern/casino': {
    load: async () => {
      const [wallet, jackpot] = await Promise.all([api.casino.getCasinoState(), api.casino.getSlotsJackpot()])
      return { room: 'casino', props: {
        initial: wallet, jackpotPot: jackpot.pot,
        // Other captains' winnings: none offline (the leaderboards retire on Steam).
        denBoards: { overall: [], blackjack: [], roulette: [], slots: [] },
        hasSeenGuide: (currentSave()!.profile.has_seen_den_guide as boolean | null) ?? false,
      } }
    },
    Component: Lobby,
  },
  '/tavern/trivia': { load: async () => ({ room: 'parlor', props: await parlorLobbyProps() }), Component: Lobby },
  '/tavern/trivia/board': {
    load: async () => ({ game: 'board', state: await api.parlor.getCaptainsBoardState(), parlorPoints: Number(currentSave()!.profile.parlor_points ?? 0) }),
    Component: ParlorGame,
  },
  '/tavern/trivia/capstan': {
    // A Captain's game, as on the web.
    load: async () => {
      if (!isPremiumActive(currentSave()!.profile)) redirect('/tavern/trivia')
      return { game: 'capstan', state: await api.parlor.getCapstanState(), parlorPoints: Number(currentSave()!.profile.parlor_points ?? 0) }
    },
    Component: ParlorGame,
  },
  '/tavern/trivia/king': {
    load: async () => ({ game: 'king', state: await api.parlor.getPirateKingState(), parlorPoints: Number(currentSave()!.profile.parlor_points ?? 0) }),
    Component: ParlorGame,
  },
  '/tavern/blackjack': {
    load: async () => {
      const [dailyWagered, resumed] = await Promise.all([api.casino.getDailyWagered(), api.casino.resumeHand()])
      return { profile: currentSave()!.profile, dailyWagered, resumed, fishArtPool: fishArtPool() }
    },
    Component: BlackjackView,
  },
  '/marketplace/tackle-shop': { load: async () => tackleShopProps(), Component: TackleShopView },
  // The web's /hooks is the tackle shop now.
  '/hooks': { load: async () => redirect('/marketplace/tackle-shop'), Component: TackleShopView },
  '/home': { load: async () => homePageProps(), Component: HomeClient },
  '/raids/gauntlet': {
    load: async () => { const page = await gauntletPageProps('davy'); if (page.redirect) redirect(page.redirect); return page.props! },
    Component: Gauntlet,
  },
  '/raids/dons-gauntlet': {
    load: async () => { const page = await gauntletPageProps('don'); if (page.redirect) redirect(page.redirect); return page.props! },
    Component: Gauntlet,
  },
  // ── Retired routes, sent where the web sends them ──
  '/crew': { load: async () => redirect('/sea?open=crew'), Component: OnlineOnly },
  '/packs': { load: async () => redirect('/sea?open=crew'), Component: OnlineOnly },
  '/expeditions': {
    load: async (q) => { const boss = q.get('boss'); return redirect(boss ? `/sea?boss=${encodeURIComponent(boss)}` : '/sea') },
    Component: OnlineOnly,
  },
  '/expeditions/forge': { load: async () => redirect('/sea?open=forge'), Component: OnlineOnly },
  '/expeditions/items': { load: async () => redirect('/sea?open=loadout'), Component: OnlineOnly },
  '/expeditions/ship': { load: async () => redirect('/sea?open=ship'), Component: OnlineOnly },
  // ── Between players: the online game's ──
  // No leaderboards and no contests on Steam at all: anything still pointing
  // at them lands on the chart.
  '/leaderboard': { load: async () => redirect('/sea'), Component: OnlineOnly },
  '/tavern/contests': { load: async () => redirect('/sea'), Component: OnlineOnly },
  '/social': { load: async () => ({ which: 'social' }), Component: OnlineOnly },
  '/u': { load: async () => ({ which: 'captain' }), Component: OnlineOnly },
  '/profile': { load: async () => profilePageProps(), Component: Profile },
  '/badges': { load: async () => badgesPageModel(), Component: BadgesView },
  '/achievements': {
    load: async () => ({ storyData: storyLogData(currentSave()!.profile, await api.raids.getRaidMapView()) }),
    Component: CaptainsLogView,
  },
  '/tavern': { load: async () => ({ seed: currentSave()!.uid, rap: await api.sea.folkState() }), Component: Tavern },
}

/** The screen for a path: exact, or another captain's page under /u/. */
export function screenFor(pathname: string): Screen | undefined {
  return SCREENS[pathname] ?? (pathname.startsWith('/u/') ? SCREENS['/u'] : undefined)
}

/** Where the shell opens, and where anything retired lands (the web sends
 *  / and the old rooms to the chart the same way). */
export const HOME = '/sea'
