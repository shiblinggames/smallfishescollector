/**
 * HOUSE COPY RULES, enforced.  `npm run check` runs this; so does `prebuild`.
 *
 * This started as audit-item-copy.mts, which checked raid items only. That was
 * the right idea aimed at one twentieth of the copy: a sweep found 51 strings
 * breaking the em-dash rule across badges, crew classes, crew skins and
 * Gauntlet upgrades, and raid items were clean for exactly one reason, which is
 * that they were the only content type with a script watching them.
 *
 * So the check moved out here and took every SYSTEMS copy source with it: the
 * strings that tell a player what a thing does. Story and dialogue are NOT in
 * scope (see the note at the bottom) because a dash is a legitimate device in
 * speech and this rule is about UI prose.
 *
 * Two rules:
 *
 *  1. NO EM OR EN DASHES. House voice. They read as machine-written, and the
 *     replacement is nearly always a full stop, which is also shorter.
 *  2. Every raid-item effect worth a percentage prints that percentage in its
 *     description. Kept from the original audit. Two things went wrong on a
 *     card carrying five effects, and both did: a rate written as prose
 *     ("an even chance"), and an effect on the item but nowhere on the card.
 */
import { RAID_ITEMS, getForgeRecipe, type RaidEffectType } from '../lib/raidItems'
import { BADGES, BADGE_DETAIL } from '../lib/badges'
import { CLASSES } from '../lib/crewClasses'
import { CREW_SKINS } from '../lib/crewSkins'
import { GAUNTLET_UPGRADES } from '../lib/gauntletUpgrades'
import { CREW_EFFECTS } from '../lib/crewEffects'
import { ROUTE_CONFIGS } from '../lib/voyageRoutes'
import { REPAIR_KITS } from '../lib/repairKits'
import { ALL_DAILY_CHALLENGES } from '../lib/dailyChallenges'
import { ISLES } from '../lib/seaIsles'
import { DIG_SITES } from '../lib/seaDigs'
import { FRAGMENTS } from '../lib/seaBottles'
import { PERSONAS } from '../lib/seaTraders'
import { HOTSPOTS, FURNITURE, PORTAL_REACH } from '../lib/homestead'

let findings = 0
const fail = (where: string, why: string, text?: string) => {
  findings++
  console.log(`\n[${where}] ${why}`)
  if (text) console.log(`   "${text}"`)
}

// ── Rule 1: no em/en dashes in systems copy ─────────────────────────────────
const DASH = /[—–]/
type Src = { label: string; strings: (string | null | undefined)[] }

const SOURCES: Src[] = [
  { label: 'raid item',       strings: RAID_ITEMS.flatMap(i => [i.name, i.description, i.source]) },
  { label: 'badge',           strings: BADGES.flatMap(b => [b.name, b.description]) },
  { label: 'badge detail',    strings: Object.values(BADGE_DETAIL) },
  { label: 'crew class',      strings: Object.values(CLASSES).flatMap(c => [c.name, c.blurb, ...(c.milestones as { desc?: string }[]).map(m => m.desc)]) },
  { label: 'crew skin',       strings: CREW_SKINS.flatMap(s => [s.name, s.blurb]) },
  { label: 'gauntlet upgrade', strings: GAUNTLET_UPGRADES.flatMap(u => [u.name, u.description]) },
  { label: 'crew trait',      strings: Object.values(CREW_EFFECTS).flatMap(e => [(e as { name?: string }).name, (e as { desc?: string }).desc]) },
  { label: 'voyage route',    strings: Object.values(ROUTE_CONFIGS).flatMap(r => [r.name, r.tagline, r.riskLabel]) },
  { label: 'repair kit',      strings: REPAIR_KITS.flatMap(k => [k.name, (k as { description?: string }).description]) },
  { label: 'daily challenge', strings: ALL_DAILY_CHALLENGES.map(c => c.label) },
  // Isle names and the notes left on them. The notes are the longest prose the
  // sea surfaces and the likeliest place for a stray dash to get in.
  { label: 'isle', strings: ISLES.flatMap(i => [i.name, i.note?.title, i.note?.body]) },
  { label: 'dig site', strings: DIG_SITES.flatMap(d => [d.name, d.found]) },
  // Sixteen logs the sea hands out in bottles. The longest free prose in the
  // game and the likeliest place for a stray dash to survive a rewrite.
  { label: 'bottle', strings: FRAGMENTS },
  // Everything the strangers out on the water say about themselves. The
  // largest single body of prose in the game and the newest, so the likeliest
  // place for a stray dash to get in.
  { label: 'sea NPC', strings: PERSONAS.flatMap(p => [p.mood, ...p.lines]) },
  // The homestead: every build, every furnishing, and what the stones reach.
  { label: 'homestead', strings: [
    ...HOTSPOTS.flatMap(h => [h.label, h.note, ...h.builds.flatMap(b => [b.name, b.blurb])]),
    ...FURNITURE.flatMap(f => [f.label, ...f.options.map(o => o.name)]),
    ...PORTAL_REACH,
  ] },
]

for (const src of SOURCES) {
  for (const t of src.strings) {
    if (t && DASH.test(t)) fail(src.label, 'contains an em/en dash', t)
  }
}

// ── Rule 2: raid-item effects print their number ────────────────────────────
const COUNT_EFFECTS = new Set<RaidEffectType>(['lethal_save', 'crit_ramp_turns'])
const FLAG_EFFECTS = new Set<RaidEffectType>(['pierce_crit', 'ambush_each_phase', 'ward_refill_on_save'])

function expectedPct(type: RaidEffectType, v: number): number | null {
  if (COUNT_EFFECTS.has(type) || FLAG_EFFECTS.has(type)) return null
  const pct = type.endsWith('_mult') ? Math.round(Math.abs(1 - v) * 100) : Math.round(v * 100)
  return pct === 0 ? null : pct
}

/** Prose standing in for a number. "always" is NOT here on purpose: for a rate
 *  of 1.0 it is plainer English than "100% chance". */
const VAGUE = /\b(an even chance|even odds|a good chance|a small chance|a decent chance|sometimes|occasionally|frequently|now and then|a fifth|a quarter|a third|half of|greatly|significantly|somewhat|a softened)\b/gi

for (const item of RAID_ITEMS) {
  const tier = getForgeRecipe(item.id)?.tier
  const label = tier === 3 ? 'ABYSSAL' : tier === 2 ? 'FORGED' : item.rarity
  const said = new Set((item.description.match(/\d+(?:\.\d+)?/g) ?? []).map(Number))
  for (const e of item.effects) {
    const pct = expectedPct(e.type, e.value as number)
    if (pct === null) continue
    if (e.value === 1 && /\b(always|every fight|each fight|every raid fight)\b/i.test(item.description)) continue
    if (!said.has(pct)) fail(`${label} ${item.name}`, `${e.type} = ${e.value} but "${pct}%" is nowhere on the card`, item.description)
  }
  for (const v of new Set(item.description.match(VAGUE) ?? [])) {
    fail(`${label} ${item.name}`, `vague: "${v}"`, item.description)
  }
}

const checked = SOURCES.reduce((n, s) => n + s.strings.filter(Boolean).length, 0)
console.log(findings === 0
  ? `\nCopy rules: ok (${checked} strings across ${SOURCES.length} sources)`
  : `\n${findings} finding(s) across ${checked} strings`)

// NOT IN SCOPE, on purpose: story dialogue (raidMap scenes, boss pre-fight
// lines, onboarding). A dash is a legitimate device in SPEECH, and the no-dash
// rule is about UI prose that describes mechanics. If that ever changes, the
// sources list above is where it goes.

process.exit(findings === 0 ? 0 : 1)
