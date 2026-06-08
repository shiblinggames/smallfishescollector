// Pure helper for resolving a crew's current assignment track. Lives in
// /lib so both server-side server-action callers and client components can
// import it — `'use server'` files (web/app/(app)/crew/actions.ts) silently
// strip any non-async export, which would drop this helper at build time
// if it lived there.

export type CrewAssignment = 'voyage' | 'raid' | 'bench'

/** Voyage assignment wins over raid (they're mutually exclusive per the DB
 *  CHECK constraint, so only one can be non-null at a time). */
export function crewAssignment(c: { voyageSlot: number | null; raidSlot: number | null }): CrewAssignment {
  if (c.voyageSlot !== null) return 'voyage'
  if (c.raidSlot !== null) return 'raid'
  return 'bench'
}
