/**
 * ── THE HOMEPAGE, IN WORDS ──────────────────────────────────────────────────
 *
 * EVERY word on seasthebooty.com is in this file, and nothing else is in it. No
 * markup, no styling, no logic. Edit a line, save, push. The page rebuilds
 * itself around whatever is here.
 *
 * ── HOW TO EDIT IT SAFELY ───────────────────────────────────────────────────
 *
 * Every line is wrapped in BACKTICKS ` rather than quotes, on purpose: it means
 * you can type apostrophes and "quote marks" freely without breaking anything.
 * The only two characters that will bite are a backtick itself and the sequence
 * ${ . Neither belongs in a sentence.
 *
 * Keep the commas at the end of each line and the structure as it is. If you
 * break it, `npm run build` stops and tells you where, so nothing broken can
 * reach the site.
 *
 * ── THE RULES THE PAGE IS HELD TO ───────────────────────────────────────────
 *
 * 1. NO EM-DASHES and no en-dashes. House rule, and `npm run check` now fails
 *    the build on one in this file. Use a period, or a spaced hyphen - like
 *    that - which is how you write anyway.
 * 2. AMERICAN spellings. Color, harbor, gray.
 * 3. EVERY NUMBER IN HERE IS CHECKED against the code. 152 species, 5 zones,
 *    9 boss raids, 4 chapters, 27 isles, 48 minutes, level 100, $9.99 once.
 *    If you change one, check docs/systems/landing-page.md first: the last set
 *    of numbers on this page was wrong for months because nobody did.
 * 4. DO NOT CLAIM a live contest, Crown and Anchor, ship PvP, card packs, or a
 *    Steam version. All retired or parked. The full list is in that same doc.
 *
 * ── AND ONE RULE THAT IS NOT MECHANICAL ─────────────────────────────────────
 *
 * It is in YOUR voice and first person, decided 2026-09-16. Write it the way
 * you write to testers on the board. Read it out loud. If it is not a sentence
 * you would actually say to somebody, it does not go on the page.
 */

/** One section of the page: a small label, a heading, and its paragraphs. */
export type HomeBand = {
  /** The little gold label above the heading. Two or three words. */
  eyebrow: string
  /** The heading. */
  title: string
  /** One string per paragraph. Add or remove lines freely. */
  body: string[]
  /**
   * Which set of screenshots sits beside this band, or null for words only.
   * The art alternates sides down the page on its own. Filenames for each set
   * are in web/public/lp/README.md.
   */
  art: 'sea' | 'cast' | 'fight' | null
}

export const HOME = {
  /** Above the title. */
  eyebrow: `Shibling Games`,
  /** The game. */
  title: `Small Fishes`,
  /** The pun. It is the identity, so it sits right under the title. */
  tagline: `Seas the Booty.`,
  /** The opening paragraph, under the title. The most important words here. */
  pitch: `I made a fishing game and it got a bit out of hand. There’s a whole sea to sail now, a crew to sign, and nine boss fights waiting at the end of it. Runs in a browser tab.`,

  /** The main button, top of the page. */
  playButton: `Play free`,
  /** The second button. Only appears when there is actually a trailer. */
  trailerButton: `Watch the trailer`,
  /** The small line under the buttons. */
  underButtons: `No download, no cost, no catch.`,
  /** The sign-in link at the end of that line, for people who already play. */
  signInLink: `Already sailing?`,

  /** The sections, in the order they appear. */
  bands: [
    {
      eyebrow: `The sea`,
      title: `There’s no zone menu. Just the sea.`,
      body: [
        `The whole chart is one piece of water and it starts out dark. You clear the fog by sailing into it. And you cast wherever you happen to be, so how deep you’re fishing is really just how far out you were willing to go.`,
        `There are 27 isles to find out there, plus a fair amount of buried stuff that isn’t drawn on the map at all. Night falls every 48 minutes. And 9 regulars work that water who’ll start holding things back for you once you’ve brought them enough of what they’re after.`,
      ],
      art: `sea`,
    },
    {
      eyebrow: `The cast`,
      title: `A needle spins and you get about a second`,
      body: [
        `Hit the band clean and you keep the fish and the streak. Miss it and the streak’s gone. The window gets smaller the deeper you fish, which is sort of the whole problem.`,
        `152 species across 5 zones. Six of them are giants down in the Ancient Deep that you can’t sell at all. You just keep those.`,
      ],
      art: `cast`,
    },
    {
      eyebrow: `The fight`,
      title: `And then there’s the part with cannons`,
      body: [
        `Turn-based ship fights, and you aim every shot yourself on a moving bar. Four chapters. It opens on coastal pirates and ends somewhere a lot worse, and then there’s a finale I’m pretty proud of that you fight on the fishing dial.`,
        `Your crew are sea creatures you sign one at a time and level up to 100. If one dies out there it’s gone for good. That part isn’t going to change.`,
      ],
      art: `fight`,
    },
    {
      eyebrow: `The cost`,
      title: `It’s free, and I’m not going to nickel and dime you`,
      body: [
        `Everything in here can be earned by playing. No seasons, nothing expires, and nothing you buy makes a fish bite faster or a shot hit harder. I really didn’t want this to be one of those games.`,
        `Captain is $9.99 one time, not a subscription, and it opens the deep end - the Ancient Deep, the last chapter, the harder gauntlets. The first three chapters are a full game on their own and they cost nothing.`,
      ],
      art: null,
    },
  ] as HomeBand[],

  /** The button at the bottom, for whoever read the whole thing. */
  closingButton: `Make a captain`,
  /** And the last line on the page. */
  closingNote: `Still in open beta, so expect the odd rough edge. No password to remember either, I just email you a link.`,
}

/**
 * ── WHAT GOOGLE PRINTS, AND WHAT A PASTED LINK SHOWS ────────────────────────
 *
 * Not on the page itself, but read by far more people than the page is. Keep it
 * under about 160 characters or search results cut it off mid-sentence.
 */
export const SEARCH_DESCRIPTION = `A fishing game that got a bit out of hand. Sail an open sea, catch 152 species, sign a crew, and take a ship into nine boss fights. Free, in your browser.`

/**
 * ── THE SOCIAL CARD ─────────────────────────────────────────────────────────
 *
 * The picture that unfurls when the link is pasted anywhere. It has room for
 * one good line and one small one, and that is all. The title and the pun are
 * already on it.
 */
export const SOCIAL_CARD = {
  line: `A fishing game that got a bit out of hand.`,
  note: `Free in your browser. No download.`,
}

/**
 * ── ALT TEXT ────────────────────────────────────────────────────────────────
 *
 * What a screen reader says in place of each screenshot, and what shows if an
 * image fails to load. Describe what is happening in the shot, plainly.
 */
export const SHOT_ALT = {
  sea: {
    desktop: `The open sea chart, with the boat under sail and the fog rolled back`,
    phone: `The same sea on a phone`,
  },
  cast: {
    desktop: `The fishing dial mid cast, the needle coming round to the perfect band`,
    phone: `A perfect catch landing on the fishing dial`,
  },
  fight: {
    desktop: `A turn of ship combat, the aim bar mid swing`,
    phone: `Ship combat on a phone`,
  },
}

/** What the trailer's play button announces to a screen reader. */
export const TRAILER_LABEL = `Watch the trailer`
