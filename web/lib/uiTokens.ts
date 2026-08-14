/**
 * SHARED UI TOKENS. No data, no logic, no dependencies.
 *
 * These lived in lib/bossRaids.ts, which is 151KB of raid configs, enemy stats,
 * phase tables, loot tables and boss dialogue. Importing ONE constant from a
 * module imports the module, so four screens with nothing to do with raids were
 * shipping the entire campaign dataset to draw a gem glyph:
 *
 *     tavern/trivia/ParlorClaim        GEM_GLYPH
 *     tavern/trivia/ParlorStanding     GEM_GLYPH
 *     tavern/chart-room/WorldChartCard GEM_GLYPH
 *     charting/world-chart/...Client   GEM_GLYPH
 *     expeditions/ShipHero             RARITY_COLOR
 *
 * The build showed the damage plainly: "Barnacle Pete" appeared in TEN separate
 * client chunks, one of them 372KB, because the campaign data was being pulled
 * into route bundles that never touch the campaign.
 *
 * So anything that is purely a token belongs here, where importing it costs
 * nothing. The rule for this file: if it needs another module to exist, it does
 * not go in it.
 */

/** Rarity ladder shared by raid loot, crate drops and item cards. Defined here
 *  rather than in bossRaids so a component can colour by rarity without
 *  importing the raids themselves. */
export type LootRarity =
  | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'ancient' | 'cosmetic'

// The one true gem look: the purple ◆ glyph from the Nav currency display. Use
// these everywhere gems are shown (loot, drops, references) instead of a 💎
// emoji so the gem icon never drifts. Doubloons stay the gold ⟡.
export const GEM_GLYPH = '◆'
export const GEM_COLOR = '#a78bfa'

export const RARITY_COLOR: Record<LootRarity, string> = {
  common:    '#9ca3af',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#f0c040',
  // ANCIENT sits ABOVE legendary and belongs to Finn's two spoils alone. The
  // ladder already spends grey, green, blue, violet and gold, and the forge
  // treatments own salmon and lavender, so crimson is the one register left,
  // and it reads as older and angrier than gold.
  ancient:   '#e0455a',
  // COSMETIC is not a rung on the ladder, it is a different KIND of drop: a
  // hull skin changes nothing about how you fight. Reading them as epic put
  // them in the same purple as real power, so they get their own register.
  cosmetic:  '#2dd4bf',
}

// ── CALL TO ACTION ──────────────────────────────────────────────────────────
/**
 * "THERE IS SOMETHING HERE FOR YOU." The one look for a state the player should
 * act on: a haul ready to collect, a badge to claim, a reward waiting.
 *
 * It exists because the same mistake happened three times in one day. Every
 * surface picked its own opacity, and each one chose a translucent gold wash:
 * the trawl widget's Ready pill at 11%, the trawl panel's status pill at 16%,
 * the almanac's new-entry badge borrowing whatever the zone accent happened to
 * be. A wash reads fine over a flat mock and disappears over painted water, so
 * in every case the ONE state meant to grab you ended up fainter than the four
 * around it that wanted nothing.
 *
 * SOLID GROUND, DARK TYPE. Not a tint. That is the whole point: a call to action
 * must not depend on what is behind it, and these screens are all drawn over
 * art. Dark text on gold also survives a bright background, which gold text on a
 * gold wash does not.
 *
 * This is deliberately NOT the general "no solid gold fills" case. That rule is
 * about large surfaces and panels, where a solid gold plate is garish. These are
 * small pills and counts, and the app already draws them this way in the crew
 * tab, the badges tab and the mail pill. This just gives that shape a name.
 */
export const CTA_BG = '#ffd96a'
export const CTA_TEXT = '#1a1205'
export const CTA_BORDER = '#fff1c8'
export const CTA_GLOW = 'rgba(255,217,106,0.55)'

/** Ready-to-act pill, complete. Spread onto a small badge or status chip.
 *  `glow` off for a count sitting inside an already-bright card. */
export function ctaPill(glow = true): React.CSSProperties {
  return {
    background: CTA_BG,
    color: CTA_TEXT,
    border: `1px solid ${CTA_BORDER}`,
    boxShadow: glow ? `0 0 14px ${CTA_GLOW}, 0 1px 4px rgba(0,0,0,0.45)` : '0 1px 4px rgba(0,0,0,0.45)',
  }
}
