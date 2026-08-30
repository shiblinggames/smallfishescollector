// ── A CAPTAIN'S FIRST HOUR, IN ORDER ────────────────────────────────────────
//
// The whole new-player experience, as a list of beats. Doby and Kat walk a
// fresh captain from the dock to their first fish and then show them what is
// out there.
//
// ── FISH FIRST, TOWN SECOND, AND THAT ORDER IS THE DESIGN ───────────────────
//
// The obvious tour is the town: here is the market, here is the tackle shop,
// here is where you sell things. It is also the wrong one, because at minute
// zero none of those words mean anything. A market you cannot sell to and a
// tackle shop you cannot afford are two buildings the captain nods at and
// forgets.
//
// One fish changes every one of them. THEN the market is where that fish is
// worth something, and the tackle shop is what the money is for, and the whole
// town stops being a list of doors and becomes a set of answers to a question
// they already have. It is also what the game is about: fishing is the loop,
// and the first five minutes should be spent doing it rather than being shown
// around the building it is paid for in.
//
// ── AND THE ISLANDS ARE SHOWN, NOT VISITED ──────────────────────────────────
//
// The tour flies the camera to each one and names it. Sailing to all six would
// be a genuinely long voyage — the Crew Hall alone is four thousand pixels
// north — and arriving somewhere is not what makes a place stick. Seeing it,
// being told what it is, and knowing it is out there is enough at this stage;
// SeaLandfallHint says the useful sentence again the first time they actually
// moor, which is when it becomes usable.
//
// ── VOICE ───────────────────────────────────────────────────────────────────
//
// PLAIN. Direct instructions for somebody who has been playing for ninety
// seconds. No pirate flavour, no mood, no cryptic — that voice belongs to the
// campaign and it belongs there because the campaign has earned the patience it
// asks for. Say the thing, in as few words as it takes. One *asterisked* term
// per line at most, and only on the word they have to remember.

import { GUIDES } from './onboardingScenes'

/** The chart's own temperature. Colder than the fishing blue, which is a
 *  harbour colour; this is open water. */
export const SEA_ACCENT = '#7fd6c0'

export type Beat = {
  speaker: string
  portrait: string
  text: string
  /**
   * What has to happen before the beat is done.
   *
   *   'next'    — the captain reads it and taps Next.
   *   'cast'    — waits until the rod is actually out. The line before it says
   *               to sail out and cast, and nothing advances until they do:
   *               a tour that walks itself past the one instruction it gave is
   *               a tour that taught nothing.
   *   'catch'   — waits for a fish in the hold.
   *   'look'    — the camera flies somewhere and holds while they read.
   */
  until: 'next' | 'cast' | 'catch' | 'look'
  /** For `look`: the place the camera flies to, by chart id. */
  at?: string
  /** Flash the real control rather than describing it. Matches `data-coach`. */
  target?: string
}

const D = GUIDES.doby
const K = GUIDES.kat

/**
 * THE FIRST VOYAGE.
 *
 * Steering, then a fish, then the world. Eleven beats sounds like a lot and is
 * not, because only the first three arrive before the captain is doing
 * something — the rest are spread across an actual catch and a flight over the
 * chart, which is a tour of a place rather than a wall of text about one.
 */
export const FIRST_VOYAGE: Beat[] = [
  // ── THE BOAT ──────────────────────────────────────────────────────────
  {
    ...D,
    // The steering line teaches the input they actually have. A fine pointer
    // means a mouse, and a mouse usually means keys under the other hand.
    text: typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
      ? 'Welcome aboard, Captain. This is the whole sea. Hold *WASD* to steer.'
      : 'Welcome aboard, Captain. This is the whole sea. Drag anywhere to steer.',
    until: 'next',
  },
  {
    ...K,
    text: 'Take her out past the shallows. Anywhere off the dock will do.',
    until: 'next',
  },

  // ── THE FIRST CAST ────────────────────────────────────────────────────
  {
    ...K,
    text: 'Out on open water the *Cast* button comes up. No menus. The fish are where you are.',
    until: 'cast',
    target: 'cast',
  },
  {
    ...K,
    // The dial explanation used to live in the retired fishing hub's intro
    // scene. It belongs here now, at the moment the dial is on screen.
    text: 'Stop the needle in the *green* to land it. The *gold* is a Perfect, and it pays more.',
    until: 'catch',
  },
  {
    ...D,
    text: 'That is your first. It goes in the *hold* until you sell it.',
    until: 'next',
  },

  // ── AND WHAT IS OUT THERE ─────────────────────────────────────────────
  {
    ...D,
    text: 'Now look where you are. Every island out here is somewhere you can tie up.',
    until: 'next',
  },
  {
    ...D,
    text: 'The *Mainland*. Tavern, market, tackle shop and more — the market is where that fish turns into coin.',
    until: 'look',
    at: 'mainland',
  },
  {
    ...K,
    text: 'The *Homestead* is yours. It is not much yet. It gets better.',
    until: 'look',
    at: 'home',
  },
  {
    ...D,
    text: 'The *Shipyard*. Your rack, your loadout, and every upgrade you will ever buy for her.',
    until: 'look',
    at: 'shipyard',
  },
  {
    ...K,
    text: 'The *Tally House* posts the day’s orders — fish somebody wants, and what they pay for them.',
    until: 'look',
    at: 'trawl_docks',
  },
  {
    ...K,
    text: 'And the *Crew Hall*, north. You will want hands aboard before long.',
    until: 'look',
    at: 'crew_hall',
  },
  {
    ...D,
    text: 'That is the sea, Captain. Go and sell that fish.',
    until: 'next',
  },
]
