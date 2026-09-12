/**
 * NO BACKTICK EVER REACHES A SHADER SOURCE.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Every shader in this codebase is a JavaScript template literal, and a
 * template literal ends at the first backtick it meets — including one sitting
 * harmlessly inside a GLSL comment. Quoting an identifier in backticks is how
 * every other comment in these files is written, so the trap is not "somebody
 * did something odd", it is "somebody wrote a comment the normal way".
 *
 * It cost three builds in one afternoon. The failure surfaces as a TypeScript
 * parse error a hundred lines further down, which reads as the shader being
 * broken rather than the comment being broken, and that misdirection is most of
 * what makes it expensive.
 *
 * ── HOW IT DECIDES ──────────────────────────────────────────────────────────
 *
 * The first version of this looked for `void main(` inside the literal and
 * called it healthy if it found one. Useless: main() is declared long before
 * the comments that tend to carry backticks, so a stray one AFTER it still
 * passed. It failed its own probe, which is exactly why the probe is worth
 * running.
 *
 * Every shader here closes with a backtick alone at the start of a line. That
 * is the real terminator, so the rule is simply: nothing that could close the
 * literal may appear before it.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'app', '(app)', 'sea')

/** A template literal opened by one of these is shader source. */
const OPENERS = ['const FRAG = `', 'const VERT = `', 'const FRAGMENT = `', 'const VERTEX = `']

const TICK = String.fromCharCode(96)
const CLOSER = '\n' + TICK

let checked = 0
let bad = 0

for (const name of readdirSync(DIR)) {
  if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue
  const src = readFileSync(join(DIR, name), 'utf8')
  for (const open of OPENERS) {
    let from = 0
    for (;;) {
      const at = src.indexOf(open, from)
      if (at < 0) break
      from = at + open.length
      checked++
      const rest = src.slice(from)
      const meant = rest.indexOf(CLOSER)
      if (meant < 0) {
        bad++
        console.log(`    ${name}: ${open.trim()} never closes on a line of its own`)
        continue
      }
      const body = rest.slice(0, meant)
      const stray = body.indexOf(TICK)
      if (stray >= 0) {
        bad++
        const line = src.slice(0, from + stray).split('\n').length
        const ctx = (body.slice(Math.max(0, stray - 80), stray + 20).split('\n').pop() ?? '').trim()
        console.log(`    ${name}:${line}  a backtick closes ${open.trim()} early`)
        console.log(`      ...${ctx}`)
      }
    }
  }
}

console.log(`\n  Shaders: ${checked} source literal(s), ${bad} closed early.`)
if (bad) process.exitCode = 1
