// The account's "already shown" hints, from the browser (see app/api/hints).
// Read once per page load and kept; marking updates the kept copy at once.
let cache: Promise<Set<string>> | null = null

export function loadHints(): Promise<Set<string>> {
  if (!cache) {
    cache = fetch('/api/hints')
      .then(r => (r.ok ? r.json() : { hints: [] }))
      .then((j: { hints?: string[] }) => new Set(j.hints ?? []))
      .catch(() => new Set<string>())
  }
  return cache
}

export async function markHint(id: string): Promise<void> {
  const seen = await loadHints()
  if (seen.has(id)) return
  seen.add(id)
  void fetch('/api/hints', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {})
}
