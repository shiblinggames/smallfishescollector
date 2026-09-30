// A FRESH CAPTAIN'S PROFILE, FROM THE SCHEMA (Steam prep, 2026-09-30).
//
// On the web a new account is a `profiles` row at its column defaults (the
// sign-up trigger inserts only the id; set_default_username names it). The
// desktop build has no database, so its starter save takes the same row from
// the schema snapshot (supabase/live/02_tables.sql): content/profile_defaults.json,
// written by scripts/export-profile-defaults.mts and checked against the
// snapshot by scripts/check-profile-defaults.mts, so a new column can never
// leave the offline game starting a captain differently from the web.
//
// Pure: it reads text, so the check and the exporter share it.

export type ProfileDefaults = Record<string, unknown>

/** Every column of `profiles` with the value a new row gets. `now()` is left
 *  as null here (the save stamps its own creation time); a column with no
 *  default is null. */
export function parseProfileDefaults(ddl: string): ProfileDefaults {
  const start = ddl.indexOf('create table if not exists public.profiles (')
  if (start < 0) throw new Error('no profiles table in the snapshot')
  const body = ddl.slice(ddl.indexOf('\n', start) + 1, ddl.indexOf('\n);', start))
  const out: ProfileDefaults = {}
  for (const raw of body.split('\n')) {
    const line = raw.trim().replace(/,$/, '')
    if (!line) continue
    const name = line.split(/\s+/)[0]
    const m = /\sdefault (.+?)(?: not null)?$/.exec(line)
    out[name] = m ? literal(m[1], name) : null
  }
  return out
}

function literal(d: string, col: string): unknown {
  if (d === 'true') return true
  if (d === 'false') return false
  if (d === 'now()') return null
  if (/^-?\d+(\.\d+)?$/.test(d)) return Number(d)
  if (/^'\{\}'::\w+\[\]$/.test(d) || /^ARRAY\[\]::\w+\[\]$/.test(d)) return []
  if (d === "'{}'::jsonb") return {}
  if (d === "'[]'::jsonb") return []
  let m = /^'((?:[^']|'')*)'::(?:text|character varying)$/.exec(d)
  if (m) return m[1].replace(/''/g, "'")
  m = /^ARRAY\[(.+)\]$/.exec(d)
  if (m) return m[1].split(',').map(x => {
    const s = /^'((?:[^']|'')*)'::text$/.exec(x.trim())
    if (!s) throw new Error(`profiles.${col}: array default ${d} is not understood`)
    return s[1]
  })
  throw new Error(`profiles.${col}: default ${d} is not understood; teach lib/profileDefaults`)
}
