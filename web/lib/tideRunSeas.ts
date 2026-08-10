// Tide Run seas — the water you sail, unlocked by distance alongside the boats.
//
// A sea is FOUR PALETTE STOPS, one per quarter of the day/night cycle the game
// already runs through as you travel (midday → dusk → night → dawn, looping).
// Nothing here is art: every sky, sea, island, cloud and foam pixel is drawn
// from these eight colours, so a whole new world costs nothing to download and
// nothing to decode. That is why the seas exist at all — a second unlock track
// with no asset budget behind it.
//
// TWO RULES EVERY SEA MUST KEEP, because they are playability rather than taste:
//
//   1. `island` has to read against BOTH sky and sea. Rocks, stacks, the far
//      ridge and the sea stacks you jump are all drawn in it, so a sea where it
//      sinks into the water is a sea where hazards are invisible.
//   2. `foam` is the surface line and the splash particles. It has to stay
//      lighter than seaTop or the waterline disappears and the boat looks like
//      it is floating in soup.
//
// Thresholds interleave with the boats (75/150/225/300/…), so the two ladders
// alternate and there is always something close rather than two rewards landing
// at once and then a long silence.

export type SeaStop = {
  skyTop: string; skyBot: string
  seaTop: string; seaMid: string; seaBot: string
  island: string; cloud: string; foam: string
}

export type TideRunSea = {
  id: string
  name: string
  /** Metres of BEST distance required. 0 = the starting water. */
  unlockAt: number
  blurb: string
  /** Midday, dusk, night, dawn. The game lerps between adjacent stops. */
  stops: [SeaStop, SeaStop, SeaStop, SeaStop]
  /** Two colours for the locker swatch, so a sea can be recognised at a glance
   *  without rendering the game to preview it. */
  swatch: [string, string]
}

export const DEFAULT_SEA_ID = 'home'

export const TIDE_RUN_SEAS: TideRunSea[] = [
  {
    id: 'home',
    name: 'Home Waters',
    unlockAt: 0,
    blurb: 'The run you know. Warm light, honest water.',
    swatch: ['#5da7d4', '#1f5b80'],
    stops: [
      { skyTop: '#5da7d4', skyBot: '#a8d4ec', seaTop: '#1f5b80', seaMid: '#0e3a5c', seaBot: '#03182a',
        island: '#46648c', cloud: 'rgba(255,255,255,0.42)', foam: 'rgba(220,240,255,0.70)' },
      { skyTop: '#c66a4a', skyBot: '#f0b388', seaTop: '#3b3a5c', seaMid: '#1e2240', seaBot: '#0a0e1f',
        island: '#3c3a5a', cloud: 'rgba(255,210,180,0.45)', foam: 'rgba(255,230,200,0.65)' },
      { skyTop: '#1a2548', skyBot: '#3a4d7a', seaTop: '#0c1830', seaMid: '#060d20', seaBot: '#020510',
        island: '#1a2540', cloud: 'rgba(180,200,230,0.28)', foam: 'rgba(180,200,230,0.55)' },
      { skyTop: '#7a5a82', skyBot: '#f3b298', seaTop: '#2a3854', seaMid: '#13203a', seaBot: '#070d1c',
        island: '#3a3852', cloud: 'rgba(255,220,200,0.40)', foam: 'rgba(255,225,205,0.62)' },
    ],
  },
  {
    id: 'shallows',
    name: 'The Sunlit Shallows',
    unlockAt: 125,
    blurb: 'Sand close under the keel and light all the way down.',
    swatch: ['#7fd0e0', '#2e8f92'],
    stops: [
      { skyTop: '#79c7e8', skyBot: '#cfeef5', seaTop: '#2e8f92', seaMid: '#186a70', seaBot: '#0a3c46',
        island: '#5b7f86', cloud: 'rgba(255,255,255,0.50)', foam: 'rgba(235,252,255,0.74)' },
      { skyTop: '#e0895c', skyBot: '#ffd2a2', seaTop: '#4a6f78', seaMid: '#2a4a56', seaBot: '#12232c',
        island: '#4c5a62', cloud: 'rgba(255,222,190,0.48)', foam: 'rgba(255,238,214,0.68)' },
      { skyTop: '#20324f', skyBot: '#48627f', seaTop: '#122a34', seaMid: '#0a1a22', seaBot: '#040c12',
        island: '#22343e', cloud: 'rgba(190,212,232,0.30)', foam: 'rgba(198,224,232,0.58)' },
      { skyTop: '#8b6f92', skyBot: '#ffc9a8', seaTop: '#2f5560', seaMid: '#1a343e', seaBot: '#0a1820',
        island: '#3f5058', cloud: 'rgba(255,228,206,0.42)', foam: 'rgba(255,236,216,0.64)' },
    ],
  },
  {
    id: 'storm',
    name: 'The Storm Front',
    unlockAt: 250,
    blurb: 'Low cloud, hard water, and no light to speak of.',
    swatch: ['#6d7a88', '#243642'],
    stops: [
      { skyTop: '#6d7a88', skyBot: '#a4b0ba', seaTop: '#243642', seaMid: '#16242e', seaBot: '#080f16',
        island: '#3d4c58', cloud: 'rgba(226,232,238,0.55)', foam: 'rgba(236,244,250,0.78)' },
      { skyTop: '#7d6a6a', skyBot: '#bda3a0', seaTop: '#2a2f3e', seaMid: '#191d29', seaBot: '#0a0d14',
        island: '#3b3d4c', cloud: 'rgba(226,214,212,0.50)', foam: 'rgba(240,232,230,0.70)' },
      { skyTop: '#151c26', skyBot: '#2e3a48', seaTop: '#0a1119', seaMid: '#060a10', seaBot: '#020407',
        island: '#1b232d', cloud: 'rgba(170,184,198,0.32)', foam: 'rgba(190,206,220,0.60)' },
      { skyTop: '#5c5a70', skyBot: '#b3a6b0', seaTop: '#1e2a36', seaMid: '#121a24', seaBot: '#070b10',
        island: '#2f3a46', cloud: 'rgba(214,210,220,0.42)', foam: 'rgba(226,228,236,0.66)' },
    ],
  },
  {
    id: 'volcanic',
    name: 'The Ash Reach',
    unlockAt: 400,
    blurb: 'Black water under a sky that never quite clears.',
    swatch: ['#7a4b3a', '#1a1210'],
    stops: [
      { skyTop: '#7a4b3a', skyBot: '#c98a63', seaTop: '#241a18', seaMid: '#150f0e', seaBot: '#070505',
        island: '#463029', cloud: 'rgba(255,196,158,0.42)', foam: 'rgba(255,206,168,0.68)' },
      { skyTop: '#8e3a26', skyBot: '#e07a44', seaTop: '#2b1a16', seaMid: '#180e0c', seaBot: '#080404',
        island: '#4e2c22', cloud: 'rgba(255,168,116,0.46)', foam: 'rgba(255,190,140,0.70)' },
      { skyTop: '#1d1112', skyBot: '#3d2220', seaTop: '#120b0b', seaMid: '#0a0606', seaBot: '#030202',
        island: '#2a1a18', cloud: 'rgba(224,140,100,0.26)', foam: 'rgba(240,170,130,0.56)' },
      { skyTop: '#5a3040', skyBot: '#d08a66', seaTop: '#1f1516', seaMid: '#120c0d', seaBot: '#060404',
        island: '#3a2626', cloud: 'rgba(255,186,150,0.38)', foam: 'rgba(255,200,164,0.62)' },
    ],
  },
  {
    id: 'frozen',
    name: 'The Frozen Reach',
    unlockAt: 550,
    blurb: 'White sky, white water, and nothing warm for miles.',
    swatch: ['#dceaf2', '#3f7f9e'],
    stops: [
      { skyTop: '#b8d6e6', skyBot: '#eef7fb', seaTop: '#3f7f9e', seaMid: '#265b76', seaBot: '#0e2c3d',
        island: '#7b98a8', cloud: 'rgba(255,255,255,0.62)', foam: 'rgba(255,255,255,0.82)' },
      { skyTop: '#c99a9a', skyBot: '#f6d9d2', seaTop: '#4a6e86', seaMid: '#2c4a5e', seaBot: '#122430',
        island: '#6f8492', cloud: 'rgba(255,232,228,0.52)', foam: 'rgba(255,246,242,0.74)' },
      { skyTop: '#28384e', skyBot: '#54718c', seaTop: '#16303e', seaMid: '#0c1e28', seaBot: '#040c12',
        island: '#33485a', cloud: 'rgba(206,224,238,0.34)', foam: 'rgba(222,240,250,0.62)' },
      { skyTop: '#9a8fae', skyBot: '#e8d6e2', seaTop: '#3a6076', seaMid: '#213e50', seaBot: '#0c1c26',
        island: '#5d7686', cloud: 'rgba(240,238,248,0.46)', foam: 'rgba(248,250,255,0.70)' },
    ],
  },
  {
    id: 'bioluminescent',
    name: 'The Glowing Deep',
    unlockAt: 750,
    blurb: 'The water lights itself out here. Nobody knows why.',
    swatch: ['#123044', '#25e0c0'],
    stops: [
      { skyTop: '#123044', skyBot: '#1f5570', seaTop: '#07222c', seaMid: '#04161e', seaBot: '#010a0e',
        island: '#16414c', cloud: 'rgba(120,220,220,0.30)', foam: 'rgba(120,255,228,0.80)' },
      { skyTop: '#1d2450', skyBot: '#3a4a86', seaTop: '#08202e', seaMid: '#04141e', seaBot: '#01080e',
        island: '#183a4e', cloud: 'rgba(150,190,240,0.28)', foam: 'rgba(150,240,255,0.78)' },
      { skyTop: '#050a14', skyBot: '#101f34', seaTop: '#03121a', seaMid: '#020a10', seaBot: '#000406',
        island: '#0b2430', cloud: 'rgba(90,180,190,0.22)', foam: 'rgba(110,255,220,0.86)' },
      { skyTop: '#20264c', skyBot: '#4a5a86', seaTop: '#082430', seaMid: '#041620', seaBot: '#010a0e',
        island: '#154050', cloud: 'rgba(160,200,235,0.30)', foam: 'rgba(140,250,230,0.80)' },
    ],
  },
]

export function tideRunSea(id: string | null | undefined): TideRunSea {
  return TIDE_RUN_SEAS.find(s => s.id === id) ?? TIDE_RUN_SEAS[0]
}

export function isSeaUnlocked(id: string, bestDistance: number): boolean {
  return bestDistance >= tideRunSea(id).unlockAt
}

/** The next sea still to earn, or null once they are all sailed. */
export function nextSea(bestDistance: number): TideRunSea | null {
  return TIDE_RUN_SEAS.find(s => bestDistance < s.unlockAt) ?? null
}

/** Seas earned by crossing from `before` to `after`, in ladder order. */
export function seasUnlockedBetween(before: number, after: number): TideRunSea[] {
  return TIDE_RUN_SEAS.filter(s => s.unlockAt > before && s.unlockAt <= after)
}
