/**
 * RAID ITEM COPY AUDIT.  `npx tsx audit-item-copy.mts`
 *
 * A raid item's description is the ONLY place most players ever read what it
 * does, and the forged tiers carry four and five effects each. Two things go
 * wrong on a card that long, and both did:
 *
 *   1. A rate gets written as prose. "a fifth of your Savvy", "half the
 *      incoming shot", "a chance each hit", "an even chance". The player then
 *      cannot compare it to the effect two clauses along that DID print its
 *      number, and quietly assumes they are different kinds of thing.
 *   2. An effect is on the item but not on the card at all, usually a downside.
 *      Leviathan's Cannon charged 10% off every non-crit and called it "a
 *      softened non-crit penalty".
 *
 * So this checks the copy against the DATA: every effect worth a percentage
 * must have that percentage somewhere in the description. It also enforces the
 * house no-em-dash rule, since these are player-facing strings.
 *
 * Exits non-zero on a finding, so it can gate a commit.
 */
import { RAID_ITEMS, getForgeRecipe, type RaidEffectType } from './lib/raidItems'

/** Effects whose value is a count, not a rate. Nothing to spell as a %. */
const COUNT_EFFECTS = new Set<RaidEffectType>(['lethal_save', 'crit_ramp_turns'])

/** Effects whose value is a FLAG (always 1 = "this item does the thing"). The
 *  behaviour still has to be described, but there is no number to print, and
 *  letting these fall through would demand a meaningless "100%" on the card. */
const FLAG_EFFECTS = new Set<RaidEffectType>(['pierce_crit', 'ambush_each_phase', 'ward_refill_on_save'])

/** The percentage a player should be able to read straight off the card. */
function expectedPct(type: RaidEffectType, v: number): number | null {
  if (COUNT_EFFECTS.has(type) || FLAG_EFFECTS.has(type)) return null
  const pct = type.endsWith('_mult') ? Math.round(Math.abs(1 - v) * 100) : Math.round(v * 100)
  return pct === 0 ? null : pct
}

/** Prose standing in for a number. "always" is NOT here on purpose: for a rate
 *  of 1.0 it is plainer English than "100% chance", and it is how every primer
 *  on the board already reads. */
const VAGUE = /\b(an even chance|even odds|a good chance|a small chance|a decent chance|sometimes|occasionally|frequently|now and then|a fifth|a quarter|a third|half of|greatly|significantly|somewhat|a softened)\b/gi

let findings = 0
for (const item of RAID_ITEMS) {
  const tier = getForgeRecipe(item.id)?.tier
  const label = tier === 3 ? 'ABYSSAL' : tier === 2 ? 'FORGED' : item.rarity
  const said = new Set((item.description.match(/\d+(?:\.\d+)?/g) ?? []).map(Number))
  const problems: string[] = []

  for (const e of item.effects) {
    const pct = expectedPct(e.type, e.value as number)
    if (pct === null) continue
    // A rate of exactly 1 may be stated as a guarantee in words instead of
    // "100%": "always opens each fight", "opens every fight with". Both are
    // plainer English than the number and are how the primers already read.
    if (e.value === 1 && /\b(always|every fight|each fight|every raid fight)\b/i.test(item.description)) continue
    if (!said.has(pct)) problems.push(`${e.type} = ${e.value} but "${pct}%" is nowhere on the card`)
  }
  for (const v of new Set(item.description.match(VAGUE) ?? [])) problems.push(`vague: "${v}"`)
  if (/[—–]/.test(item.description)) problems.push('contains an em/en dash')

  if (!problems.length) continue
  findings += problems.length
  console.log(`\n[${label}] ${item.name}`)
  console.log(`  "${item.description}"`)
  for (const p of problems) console.log(`   ! ${p}`)
}

console.log(findings === 0
  ? `\nItem copy: ok (${RAID_ITEMS.length} items)`
  : `\n${findings} finding(s) across ${RAID_ITEMS.length} items`)
process.exit(findings === 0 ? 0 : 1)
