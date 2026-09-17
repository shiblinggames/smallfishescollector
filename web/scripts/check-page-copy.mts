/**
 * HOUSE COPY RULES, for the copy that lives in COMPONENTS.
 *
 * check-copy.mts polices the data modules in lib/: badges, items, crew classes,
 * the tours. It could not see the other half of what a player reads, which is
 * every string and every line of JSX text inside app/ and components/: the raid
 * combat log, the gauntlet's warnings, the gear help text, tooltips, aria
 * labels. A sweep on 2026-09-16 found 289 em and en dashes in that half, 126
 * of them in the raid fight alone, and the one rule the game has about prose
 * was being enforced on a fifth of the prose.
 *
 * This walks the TypeScript AST rather than grepping, because the repo's
 * comments are full of dashes on purpose and a regex cannot tell a comment
 * from a sentence a player sees. String literals, template literal parts and
 * JSX text are exactly the nodes a player can see; nothing else is looked at.
 *
 * Typography is not prose and is allowed through:
 *   - a lone dash on its own as an empty value ("—" in a stat cell)
 *   - a numeric or single-character range ("3–20 chars", "A–Z", `${a}–${b}`)
 *
 * ── AND AMERICAN SPELLINGS ──────────────────────────────────────────────────
 *
 * The house rule since 2026-07-12, swept once and then quietly re-broken: a
 * scan on 2026-09-16 found seventy British spellings in copy a player reads,
 * "harbour" thirty-one times, including on the chart's own legend. A rule
 * enforced by one sweep is a rule that lasts until the next writer.
 *
 * This rule runs over `lib/` as well, because that is where the dialogue, the
 * badge names and the story nodes live, and they are the bulk of the prose.
 * The dash rule stays on `app/` and `components/` only, where `check-copy.mts`
 * does not reach.
 *
 * Two kinds of string are exempt and both matter:
 *   - anything that is not prose: a url, a key, a path, camelCase. This is
 *     what keeps `?gems=cancelled` (a Stripe return value the code matches on)
 *     from being "corrected" into a broken payment flow.
 *   - PROPER NAMES. A character called Grey Nance is not a spelling mistake.
 *
 * Exits 1 on any finding. `npm run check` runs this, so does `prebuild`.
 */
import ts from 'typescript'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['app', 'components']
/** The spelling rule reaches further than the dash rule: lib/ is where the
 *  dialogue and the catalogs live. */
const SPELL_ROOTS = ['app', 'components', 'lib']
const SKIP = /(calibrate|boundary|waterline|[\\/]pixi[\\/]|[\\/]skiff[\\/]|app[\\/]dev[\\/]|app[\\/]admin[\\/]|fishing-test|[\\/]demo[\\/]|turnbased|practice|[\\/]generate\.ts$)/
const EXT = /\.(tsx|ts)$/

/** British -> American, for player-facing prose. */
const SPELLINGS: [RegExp, string][] = [
  [/harbour/i, 'harbor'], [/colour/i, 'color'], [/armour/i, 'armor'],
  [/honour/i, 'honor'], [/behaviour/i, 'behavior'], [/neighbour/i, 'neighbor'],
  [/favour/i, 'favor'], [/rumour/i, 'rumor'], [/vapour/i, 'vapor'],
  [/centre/i, 'center'], [/\bmetre\b/i, 'meter'], [/theatre/i, 'theater'],
  [/sombre/i, 'somber'], [/defence/i, 'defense'], [/offence/i, 'offense'],
  [/\bgrey\b/i, 'gray'], [/storey/i, 'story'], [/manoeuvre/i, 'maneuver'],
  [/marvellous/i, 'marvelous'], [/skilful/i, 'skillful'],
  // THE -ISE FAMILY NEEDS ITS SUFFIX. Bare "specialis" also matches
  // "specialist", "organis" matches "organism" and "realis" matches "realism",
  // all of which are correct here and all of which this game says.
  [/\b(special|organ|real|apolog|custom|recogn)is(e|ed|es|ing|ation|able)\b/i, 'the -ize spelling'],
  [/\banalys(e|ed|es|ing)\b/i, 'analyz-'],
  [/travelling/i, 'traveling'], [/travelled/i, 'traveled'], [/traveller/i, 'traveler'],
  [/labelled/i, 'labeled'], [/labelling/i, 'labeling'], [/modelling/i, 'modeling'],
  [/jewellery/i, 'jewelry'], [/moustache/i, 'mustache'],
]

/** Names somebody chose, which a spell-checker has no business touching. */
/**
 * Names somebody chose, which a spell-checker has no business touching. A
 * name is cut out of the line before the line is checked, so a sentence that
 * contains one is still checked for everything else in it.
 *
 * `Grey` on its own is a first name off the wanderers' name table
 * (lib/seaTraders), which is also where five of the nine regulars came from.
 */
const NAMES = [/Grey Nance/, /Old Armour/, /^Grey$/]

/** Prose, or an identifier wearing quotes? This is what keeps a Stripe return
 *  value like `?gems=cancelled` out of a copy edit. */
function isProse(t: string): boolean {
  if (/\s/.test(t)) return true
  if (/[_/?=&.#-]/.test(t)) return false
  if (/^[a-z]+([A-Z][a-z]*)+$/.test(t)) return false
  return true
}

const DASH = /[—–]/
const LONE = /^\s*[—–]\s*$/
const RANGE = /^[A-Za-z0-9~]?\s*[–—]\s*[A-Za-z0-9~]?$|\d\s*[–—]\s*\d|\w[–—]\w$/

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { walk(p, out); continue }
    if (EXT.test(name) && !SKIP.test(p)) out.push(p)
  }
}

/** Is this run of text typography rather than a sentence? */
function allowed(text: string): boolean {
  if (LONE.test(text)) return true
  // A long multi-line string is code that happens to live in a literal: a
  // shader, a block of CSS in a <style>, a prompt to a model. Prose a player
  // reads is a sentence or two, and never carries its own line breaks.
  if (text.includes('\n') && text.length > 160) return true
  // Every dash in it sits between two range-ish tokens.
  const parts = text.split(/[—–]/)
  if (parts.length >= 2) {
    let ok = true
    for (let i = 0; i < parts.length - 1; i++) {
      const l = parts[i].trimEnd().slice(-1)
      const r = parts[i + 1].trimStart().slice(0, 1)
      if (!(/[A-Za-z0-9~]/.test(l) && /[A-Za-z0-9~]/.test(r) && (l.length && r.length)) ) { ok = false; break }
      // A letter-to-letter dash inside a sentence ("wits—the") is a dash, not a
      // range; only allow when both sides are single tokens like 3–20 or A–Z.
      const lt = parts[i].trimEnd().split(/\s+/).pop() ?? ''
      const rt = parts[i + 1].trimStart().split(/\s+/)[0] ?? ''
      if (!(/^[A-Za-z0-9~.,%]+$/.test(lt) && /^[A-Za-z0-9~.,%]+$/.test(rt) && (lt.length <= 4 || /\d/.test(lt)) && (rt.length <= 4 || /\d/.test(rt)))) { ok = false; break }
    }
    if (ok) return true
  }
  return false
}

const files: string[] = []
for (const r of ROOTS) walk(r, files)
const spellFiles: string[] = []
for (const r of SPELL_ROOTS) walk(r, spellFiles)

let findings = 0
let strings = 0

// ── RULE 2: AMERICAN SPELLINGS ─────────────────────────────────────────────
for (const file of [...new Set(spellFiles)]) {
  const src = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const check = (node: ts.Node, text: string) => {
    if (!isProse(text)) return
    // Code that lives in a string: a shader, a block of CSS, a prompt. Prose a
    // player reads is a sentence or two and never carries its own line breaks.
    if (text.includes('\n') && text.length > 160) return
    // Cut the protected names out and check what is left, so a sentence
    // containing one is still checked for everything else in it.
    const prose = NAMES.reduce((t, n) => t.replace(n, ' '), text)
    for (const [re, good] of SPELLINGS) {
      const m = re.exec(prose)
      if (!m) continue
      findings++
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      console.log(`\n[spelling] ${relative('.', file)}:${line + 1} "${m[0]}" should be "${good}"`)
      console.log(`   "${text.trim().slice(0, 120)}"`)
      return
    }
  }
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text)
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) check(node, node.text)
    else if (ts.isJsxText(node)) check(node, node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const report = (node: ts.Node, text: string) => {
    strings++
    if (!DASH.test(text) || allowed(text)) return
    findings++
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    console.log(`\n[page copy] ${relative('.', file)}:${line + 1} contains an em/en dash`)
    console.log(`   "${text.trim().slice(0, 140)}"`)
  }
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) report(node, node.text)
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) report(node, node.text)
    else if (ts.isJsxText(node)) report(node, node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

if (findings > 0) {
  console.log(`\nPage copy: ${findings} finding${findings === 1 ? '' : 's'}. House rules: no em or en dashes, and American spellings, in anything a player reads.`)
  process.exit(1)
}
console.log(`Page copy: ok (${strings} strings across ${files.length} files, spellings across ${spellFiles.length})`)
