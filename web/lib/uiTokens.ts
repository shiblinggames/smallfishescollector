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
