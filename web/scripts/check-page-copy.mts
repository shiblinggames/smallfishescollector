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
 * Exits 1 on any finding. `npm run check` runs this, so does `prebuild`.
 */
import ts from 'typescript'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['app', 'components']
const SKIP = /(calibrate|boundary|waterline|[\\/]pixi[\\/]|[\\/]skiff[\\/]|app[\\/]dev[\\/]|app[\\/]admin[\\/]|fishing-test|[\\/]demo[\\/]|turnbased|practice|[\\/]generate\.ts$)/
const EXT = /\.(tsx|ts)$/

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

let findings = 0
let strings = 0
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
  console.log(`\nPage copy: ${findings} finding${findings === 1 ? '' : 's'} across ${files.length} files. House rule: no em or en dashes in anything a player reads. A period is nearly always the fix.`)
  process.exit(1)
}
console.log(`Page copy: ok (${strings} strings across ${files.length} files)`)
