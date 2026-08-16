// CAMPAIGN CONTINUITY CHECKS — run before every build (`prebuild`).
//
// These are invariants the type system cannot see: they are about WHO is aboard
// and WHAT the player knows at a given point in the story, which is data spread
// across raidMap, bossRaids and legendaryUnlocks. Every one of them below has
// already shipped broken at least once.
//
// Run manually with `npm run check`.

import { RAID_MAP, RAID_CHAPTERS, chapterForNode } from '../lib/raidMap'
import { LEGENDARY_GATE } from '../lib/legendaryUnlocks'
import { getRaidConfigById } from '../lib/raidRegistry'

const problems: string[] = []

// ── 0. Every map node's raid is in the registry ──────────────────────────────
// claimRaidLoot validates a claim against `raidUniqueLootIds(raidId)`, which
// reads RAID_BY_ID. A raid the registry does not know returns an EMPTY set, so
// every unique it rolled is filtered out as unclaimable and the crate pays
// nothing but coins -- silently, because the client still drew the item and
// still printed its label.
//
// THE_SUNKEN_HAND_CHALLENGE shipped exactly like this: imported into the
// registry file and left out of ALL_RAIDS, so Finn's challenge crate could not
// grant a hull, a raid item or a gem row to anybody. It was reported as "the
// chest was empty" twice before the cause was found, because nothing failed
// loudly -- the only symptom is a reward you are shown and do not receive.
//
// The type system cannot see this: an unused import is legal, and the map node
// only references the config's `.raidId` string.
for (const node of RAID_MAP) {
  if (node.raidId && !getRaidConfigById(node.raidId)) {
    problems.push(`Raid node "${node.id}" points at raidId "${node.raidId}", which is not in ALL_RAIDS (lib/raidRegistry). Its crate will grant nothing but coins.`)
  }
}

// ── 1. Nobody speaks before they join ────────────────────────────────────────
// CREW_SPEAKER's own doc says "Doby + Kat from the start, then one legendary per
// chapter", but nothing enforced it, and two lines shipped with Mira on stage in
// chapters I and II when she does not join until IV.
const SPEAKER_FOR_SLUG: Record<string, string> = {
  mako: 'Mako', dole: 'Dole', coelacanth: 'Laz', moorish_idol: 'Mira',
}
const chapterIndex = (id: string) => RAID_CHAPTERS.findIndex(c => c.id === id)
const debutChapter: Record<string, number> = {}
for (const [slug, nodeId] of Object.entries(LEGENDARY_GATE)) {
  const name = SPEAKER_FOR_SLUG[slug]
  if (name) debutChapter[name] = chapterIndex(chapterForNode(nodeId).id)
}

for (const node of RAID_MAP) {
  if (node.type !== 'raid' || !node.raidId) continue
  const cfg = getRaidConfigById(node.raidId) as { preFightDialogue?: { speaker: string; crew?: { name: string } }[] } | undefined
  const ch = chapterIndex(chapterForNode(node.id).id)
  for (const line of cfg?.preFightDialogue ?? []) {
    if (line.speaker !== 'crew') continue
    const name = line.crew?.name
    if (!name) continue
    const debut = debutChapter[name]
    if (debut !== undefined && debut > ch) {
      problems.push(
        `${name} speaks in "${node.label}" (chapter ${ch + 1}) but does not join until chapter ${debut + 1}.`,
      )
    }
  }
}

// ── 2. Every route a node points at exists ───────────────────────────────────
// The challenge finale shipped pointing at a page that had never been written;
// it would have 404'd the first player who cleared him and went back for more.
import { existsSync } from 'node:fs'
for (const node of RAID_MAP) {
  if (!node.route) continue
  if (!existsSync(`app/(app)${node.route}/page.tsx`)) {
    problems.push(`Node "${node.id}" points at ${node.route}, which has no page.tsx.`)
  }
}

// ── 3. A previewable node must not spoil what it gates ───────────────────────
// previewWhenLocked opens the node's whole SHEET before it is unlocked - label,
// flavor, description, every drop tile. Four separate strings shipped naming
// Finn to players who had not met him, including the reveal's own punchline.
for (const node of RAID_MAP) {
  if (node.previewWhenLocked !== true) continue
  const detail = node.detail
  const strings: (string | undefined)[] = [
    node.label, node.flavor, node.bridge,
    detail?.description, detail?.dropsNote, detail?.summary, detail?.ctaLabel,
    ...(detail?.enemies ?? []),
    ...((detail?.drops ?? []).flatMap(d => [d.label, d.sublabel])),
  ]
  // "Finndicate" is fine — the organisation has been named since chapter one.
  // A bare "Finn" ties the angler to it, which is the twist.
  for (const s of strings) {
    if (typeof s === 'string' && /\bfinn\b|finn-dicate|\*finn\*/i.test(s)) {
      problems.push(`Node "${node.id}" previews while locked and names Finn: ${JSON.stringify(s.slice(0, 90))}`)
    }
  }
}

if (problems.length > 0) {
  console.error(`\n  Campaign continuity: ${problems.length} problem${problems.length > 1 ? 's' : ''}\n`)
  for (const p of problems) console.error(`   - ${p}`)
  console.error('')
  process.exit(1)
}
console.log('Campaign continuity: ok')
