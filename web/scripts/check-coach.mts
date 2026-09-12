/**
 * EVERY TOUR CARD THAT NAMES A CONTROL CAN POINT AT IT.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The tours and the cues flash the real control they are talking about, by
 * putting `target: 'x'` on a card and `data-coach="x"` on the element. A row of
 * eight identical discs is not something a captain can be talked through in
 * prose, so the flash is not decoration — it is most of how the card works.
 *
 * It rots in three different ways and all three had happened:
 *
 *   A TARGET WITH NO HANDLE. The first voyage's third beat is "Now *Cast*",
 *   which had asked for `cast` since it was written, at a button that never had
 *   a handle. The one instruction in the tour that names a control lit nothing.
 *
 *   A CARD THAT NAMES SOMETHING AND ASKS FOR NOTHING. "Watch it drop into the
 *   *hold*" pointed at one chip in a row of five that all look alike.
 *
 *   AND A WHOLE SURFACE THAT NEVER READ ITS OWN FIELD. SeaCue has carried a
 *   `target` on its type since it was written, populated on six of nine cues,
 *   and the component never looked at it — so every cue describing a disc left
 *   the captain to find it.
 *
 * None of that shows up in a build, a typecheck, or to anyone who has already
 * seen the tour. It only breaks for brand-new captains, who are exactly the
 * people who cannot tell you it is broken.
 *
 * ── WHAT IT CHECKS ──────────────────────────────────────────────────────────
 *
 * Two directions. Every `target` resolves to a handle that exists somewhere,
 * and every card that NAMES something in *asterisks* either asks for a handle
 * or is on the list of things that are not on screen to point at.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

/**
 * Handles are declared two ways and both count: written straight onto an
 * element, or handed to a component that forwards it. Scanning only the first
 * reports live controls as missing — which it did, for the two that matter.
 */
const handles = new Set<string>()
/** Prefixes from a template-literal handle: `crew-${card.id}` gives "crew-". */
const prefixes = new Set<string>()
const LITERAL = /data-coach="([a-z-]+)"/g
const FORWARDED = /\bcoach(?:Id)?[=:]\s*['"]([a-z-]+)['"]/g
/**
 * ── THE TWO WAYS A HANDLE IS WRITTEN WITHOUT BEING A LITERAL ───────────────
 *
 * Both are legitimate markup this script used to call dead, which is the worst
 * failure a checker has: it cried wolf on three live marks, the suite went red,
 * and a red suite nobody can fix is a suite nobody runs. It sat red for weeks.
 *
 * CONDITIONAL: `data-coach={captain ? 'captain-seat' : undefined}`. The mark is
 * a string sitting in the expression, so the string is what we take.
 *
 * BUILT FROM A LIST: ``coach={`crew-${card.id}`}``, which is how one component
 * lights four doors. The ids are data rather than source, so the exact handle
 * cannot be known here -- but the PREFIX can, and a card asking for
 * "crew-assign" is satisfied by something that demonstrably emits "crew-" plus
 * a runtime value. Weaker than an exact match, and honest about it: it still
 * catches a typo'd prefix, which is the mistake worth catching.
 */
const EXPR = /(?:data-)?coach(?:Id)?=\{([^}]*)\}/g
/** Every quoted mark inside such an expression, not just the first: a ternary
 *  holds the branch it is testing as well as the handle it hands over. */
const QUOTED = /['"]([a-z-]+)['"]/g
const TEMPLATE = /(?:data-)?coach(?:Id)?=\{`([a-z-]+)-\$\{/g

const walk = (dir: string) => {
  for (const n of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, n.name)
    if (n.isDirectory()) { walk(p); continue }
    if (!/\.tsx?$/.test(n.name)) continue
    const src = readFileSync(p, 'utf8')
    for (const m of src.matchAll(LITERAL)) handles.add(m[1])
    for (const m of src.matchAll(FORWARDED)) handles.add(m[1])
    for (const m of src.matchAll(EXPR)) {
      for (const q of m[1].matchAll(QUOTED)) handles.add(q[1])
    }
    for (const m of src.matchAll(TEMPLATE)) prefixes.add(`${m[1]}-`)
  }
}
walk(join(ROOT, 'app'))
walk(join(ROOT, 'components'))

type Card = { where: string; id: string; target: string; text: string }
const cards: Card[] = []

const grab = (file: string, label: string) => {
  const src = readFileSync(file, 'utf8')
  for (const blk of src.split(/\n  \{\n/).slice(1)) {
    const tx = blk.match(/text: '(.*)'/)
    if (!tx) continue
    cards.push({
      where: label,
      id: blk.match(/id: '([a-z]+)'/)?.[1] ?? '-',
      target: blk.match(/target: '([a-z-]+)'/)?.[1] ?? '',
      text: tx[1],
    })
  }
}
grab(join(ROOT, 'lib', 'seaOnboarding.ts'), 'tour')
grab(join(ROOT, 'app', '(app)', 'sea', 'SeaCue.tsx'), 'cue')

/** Words that name something the captain has to FIND on a screen. */
const NAMED = /\*(level|almanac|chart|crew|slots|pennant|hold|helm|cast|market|navigation)\*/i

/**
 * Named in a card, and deliberately not flashed. Each of these is a place or a
 * thing on the WATER rather than a control in the frame — an island's gold
 * mark, the Sea Gate, a trader to hail. The card sends you looking at the
 * world, which is the point, and there is no element to light.
 */
const NOT_ON_SCREEN = new Set(['hail', 'call', 'wargate'])

/**
 * ── AND A FORWARDER HAS TO ACTUALLY FORWARD ────────────────────────────────
 *
 * The two checks below count a handle as declared if any file mentions the
 * name — and that includes the CALL SITE. So a component that accepts a `coach`
 * prop and never renders it still looks wired: the tour asks for `cast`,
 * FishingHere passes coach="cast", and nothing in between puts it on an
 * element.
 *
 * Probed exactly that by deleting the attribute from DialButton, and the check
 * passed. A check that cannot fail is not a check. So: any component that takes
 * the prop has to put it on something.
 */
let dropped = 0
const walkFwd = (dir: string) => {
  for (const n of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, n.name)
    if (n.isDirectory()) { walkFwd(p); continue }
    if (!/\.tsx$/.test(n.name)) continue
    const src = readFileSync(p, 'utf8')
    for (const prop of ['coach', 'coachId']) {
      // Declared as a prop on this component...
      if (!new RegExp('\\n\\s*' + prop + '\\?:\\s').test(src)) continue
      // ...so it has to reach an element. Loose on the expression, because a
      // table-driven one renders `data-coach={d.coach}` rather than the bare
      // name — what matters is that the prop gets onto an element at all.
      if (new RegExp('data-coach=\\{[^}]*\\b' + prop + '\\b').test(src)) continue
      dropped++
      console.log(`    DROPPED ${n.name} takes a "${prop}" prop and never renders data-coach`)
    }
  }
}
walkFwd(join(ROOT, 'app'))
walkFwd(join(ROOT, 'components'))

let dead = 0
let unlit = 0
for (const c of cards) {
  // A handle is carried if it is written out, or if something emits its
  // prefix and fills the rest from data. See TEMPLATE above.
  const carried = handles.has(c.target) || [...prefixes].some(pre => c.target.startsWith(pre))
  if (c.target && !carried) {
    dead++
    console.log(`    DEAD   ${c.where}/${c.id} asks for "${c.target}", which nothing carries`)
  } else if (!c.target && NAMED.test(c.text) && !NOT_ON_SCREEN.has(c.id)) {
    unlit++
    console.log(`    UNLIT  ${c.where}/${c.id} names *${c.text.match(NAMED)?.[1]}* and lights nothing`)
    console.log(`             "${c.text.slice(0, 74)}..."`)
  }
}

console.log(`\n  Coach marks: ${cards.length} card(s), ${handles.size} handle(s), `
  + `${dead} dead, ${unlit} unlit, ${dropped} dropped.`)
if (dead || unlit || dropped) process.exitCode = 1
