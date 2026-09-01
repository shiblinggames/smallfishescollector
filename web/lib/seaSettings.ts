// ── WHAT THE CAPTAIN HAS TURNED OFF ─────────────────────────────────────────
//
// Plain module, NOT 'use server': every export here is sync and that directive
// silently drops non-async ones.
//
// ── WHY localStorage AND NOT A PROFILE COLUMN ───────────────────────────────
//
// The house rule is that anything one-time goes in a profile column and never
// in localStorage, because somebody who opens the game on their phone should
// not be walked through the tour a second time. That rule is about things that
// are true of a PLAYER.
//
// These are true of a DEVICE. Sound on a laptop at a desk and sound on a phone
// on a bus are different answers to the same question, and syncing them would
// be actively wrong: turning the music off on the train would silence the
// speakers at home. The SFX flag already lived here for exactly this reason
// (`fishingSfxMuted`, read by lib/fishingMusic at module load) and the other
// two join it rather than starting a second convention.
//
// ── EVERYTHING DEFAULTS ON ──────────────────────────────────────────────────
//
// A setting a player has never touched should be the game as it was designed,
// and the absence of a stored value is exactly that. So the stored string is
// checked for 'off' rather than for 'on': a missing key, a cleared cache and a
// private window all land on the same answer, which is the one somebody who has
// never opened the settings would expect.

export type SeaSetting = 'music' | 'sfx' | 'biteTimer' | 'motion'

const KEY: Record<SeaSetting, string> = {
  // SFX keeps its original key and its original INVERTED sense, because
  // lib/fishingMusic reads it directly at module load and a rename here would
  // silently un-mute everybody who had turned it off.
  sfx: 'fishingSfxMuted',
  music: 'seaMusicOff',
  biteTimer: 'seaBiteTimerOff',
  /**
   * THE DRIFTING FOAM, AND ANYTHING ELSE THAT STREAMS PAST.
   *
   * Stored as OFF like the others, so leaving it alone gives you the sea as
   * designed. Turning it off is the comfort switch: a full-screen field of
   * bright specks travelling at five hundred pixels a second is the single most
   * motion-sick thing the chart does, and `prefers-reduced-motion` is honoured
   * too — but that is a system setting most people have never opened, and
   * "this makes me feel ill" deserves an answer inside the game.
   */
  motion: 'seaMotionOff',
}

/** Fired whenever anything here changes, so a panel and whatever the setting
 *  controls stay in step without threading state through the chart. */
export const SEA_SETTINGS_EVENT = 'sea-settings-changed'

export function getSetting(s: SeaSetting): boolean {
  if (typeof window === 'undefined') return true
  try {
    // The SFX key stores MUTED, the others store OFF. Both are "the thing is
    // not happening", so both read the same way round.
    return window.localStorage.getItem(KEY[s]) !== 'true'
  } catch {
    // A browser refusing storage is not a browser asking for silence.
    return true
  }
}

export function setSetting(s: SeaSetting, on: boolean): void {
  try { window.localStorage.setItem(KEY[s], String(!on)) } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent(SEA_SETTINGS_EVENT, { detail: { setting: s, on } })) } catch { /* noop */ }
}

/** Read all three at once, for a panel that draws them together. */
export function allSettings(): Record<SeaSetting, boolean> {
  return {
    music: getSetting('music'), sfx: getSetting('sfx'),
    biteTimer: getSetting('biteTimer'), motion: getSetting('motion'),
  }
}
