// ── NAMES OTHER PEOPLE HAVE TO READ ─────────────────────────────────────────
//
// A username is not private. It goes on the leaderboards, on the badge wall, in
// the mail, and on another captain's chart when the two of you sail together,
// so it is the one string a player writes that everybody else is made to look
// at. There was nothing stopping any of it.
//
// ── WHY A LIST AND NOT A LIBRARY ────────────────────────────────────────────
//
// This app deploys on pnpm and an undeclared import passes locally and fails on
// Vercel, so a dependency for this is a deployment risk in exchange for a word
// list we would still have to tune. It is a word list either way; this one is
// in the repo where it can be read and argued with.
//
// ── THE SCUNTHORPE PROBLEM IS THE WHOLE DESIGN ──────────────────────────────
//
// Naive substring matching bans real people. It is worse than usual here: this
// is a FISHING game, so `bass` is a fish, `analyst` and `assassin` are ordinary
// words, and `Dick` is somebody's actual name. So the list is in two halves.
//
//   ANYWHERE  long and unambiguous. Nothing innocent contains these, so they
//             are caught wherever they appear.
//   WHOLE     short or ambiguous. Blocked only when the name is ESSENTIALLY
//             just that word, which stops `ass` from taking `bass` with it.
//
// Deliberately not exhaustive and deliberately not clever. It stops the lazy
// cases, which is the realistic goal; anybody determined enough to defeat it
// can be handled by a human, and a filter tuned until nothing gets through is a
// filter that has started rejecting real names.

/** Characters people substitute to slip a word past a list. */
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
}

/**
 * Down to bare letters: leet undone, separators dropped.
 *
 * The separator strip is what catches `f_u_c_k`, and it is why the check runs
 * on this rather than on what the captain typed.
 */
function fold(raw: string): string {
  let out = ''
  for (const ch of raw.toLowerCase()) out += LEET[ch] ?? ch
  return out.replace(/[^a-z]/g, '')
}

/**
 * The same, WITHOUT undoing leet.
 *
 * Both are needed and neither is enough. `b17ch` only reads as a word once the
 * digits become letters; `ass123` only reads as one once they are thrown away,
 * because the leet map turns its 1 and 3 into `i` and `e` and leaves `assie`.
 * A name is checked as both things it could be.
 */
function foldPlain(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * And with every run of a repeated letter squeezed to one, which is how
 * `fuuuuck` gets through a list containing `fuck`.
 *
 * Checked ALONGSIDE the un-squeezed form, never instead of it: squeezing turns
 * `bootes` into `botes` and would miss a word that legitimately doubles a
 * letter.
 */
function squeeze(folded: string): string {
  return folded.replace(/(.)\1+/g, '$1')
}

/** Caught wherever it appears. Nothing innocent contains these. */
const ANYWHERE = [
  'nigger', 'nigga', 'faggot', 'fag', 'tranny', 'kike', 'chink', 'gook',
  'wetback', 'towelhead', 'retard', 'nazi', 'hitler', 'holocaust',
  'pedo', 'paedo', 'rapist', 'molest', 'incest', 'bestiality',
  // `shit` also refuses `shitake`, which is a common misspelling of a mushroom.
  // Left in: the trade is one rare mushroom against the most common profanity
  // in English, and the captain who wanted it can spell it `shiitake`.
  'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'asshole', 'dumbass',
  'whore', 'slut', 'wank', 'jizz', 'cumshot', 'blowjob', 'handjob',
  'pussy', 'penis', 'vagina', 'clitoris', 'testicle', 'scrotum',
  'porn', 'hentai', 'masturbat', 'ejaculat', 'orgasm',
  'suicide', 'killyourself', 'kys',
]

/**
 * Blocked only when the name is essentially just this word.
 *
 * Every one of these is a substring of something ordinary: `ass` of `bass`
 * (a fish, in a fishing game), `anal` of `analyst`, `cum` of `cumberland`,
 * `sex` of `sussex`, `cock` of `peacock`, `dick` of a great many real people.
 */
const WHOLE = [
  'ass', 'arse', 'anal', 'anus', 'cum', 'sex', 'sexy', 'cock', 'dick',
  'dik', 'tit', 'tits', 'boob', 'boobs', 'butt', 'turd', 'crap', 'damn',
  'piss', 'poop', 'fuk', 'fck', 'stfu', 'wtf', 'rape', 'spic', 'coon',
  'homo', 'queer', 'dyke', 'twat', 'prick', 'knob', 'bollock', 'shag',
]

/** Filler a name can be padded with while still being "just that word". */
const PADDING = /^(x+|_+|\d+|the|mr|mrs|dr|lord|capt|captain|sir)$/

/**
 * IS THIS NAME ONE OF THE WHOLE-WORD TERMS WEARING A HAT.
 *
 * `ass` should be refused, and so should `xxassxx` and `theass` and `ass123`,
 * because all four are the same name. `bass` should not be, and neither should
 * `cassidy`. So the name is split on the usual separators and each piece is
 * measured: a piece that IS the word, or is the word with recognised padding
 * around it, counts.
 */
function wholeWordHit(raw: string): string | null {
  const parts = raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  // The undivided name counts as a piece too, so `xxcumxx` is seen whole, and
  // both readings of it, so `ass123` and `b17ch` are each caught by whichever
  // one turns them back into a word.
  const pieces = [...parts, fold(raw), foldPlain(raw)].filter(Boolean)
  const readings = new Set<string>()
  for (const piece of pieces) {
    readings.add(fold(piece))
    readings.add(foldPlain(piece))
  }
  for (const f of readings) {
    for (const word of WHOLE) {
      if (f === word) return word
      if (f.length <= word.length) continue
      // The word with padding on one or both ends and nothing else.
      const at = f.indexOf(word)
      if (at < 0) continue
      const before = f.slice(0, at)
      const after = f.slice(at + word.length)
      if ((!before || PADDING.test(before)) && (!after || PADDING.test(after))) return word
    }
  }
  return null
}

/**
 * Does this name contain something nobody should have to read.
 *
 * Returns the term that matched, or null. The term is for logging and tests,
 * never for the player: telling somebody exactly which letters tripped the
 * filter is a set of instructions for getting round it.
 */
export function findProfanity(raw: string): string | null {
  if (!raw) return null
  const f = fold(raw)
  const s = squeeze(f)
  for (const word of ANYWHERE) {
    if (f.includes(word) || s.includes(word)) return word
  }
  return wholeWordHit(raw)
}

export function isClean(raw: string): boolean {
  return findProfanity(raw) === null
}

/** What the player is told. Deliberately says nothing about what matched. */
export const PROFANITY_MESSAGE = 'Pick another name, Captain. That one will not do.'
