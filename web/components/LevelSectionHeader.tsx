// Shared section header shown centered above a level bar — a simple Cinzel
// title. Used above the expeditions "Navigation" nav-level bar (ShipHero) and
// the fishing zone selector "Fishing" level bar (ZoneLanding) so the two tops
// read as one matched set. One source, so they never drift apart.
export function LevelSectionHeader({ label }: { label: string }) {
  return (
    <p className="font-cinzel font-700" style={{ textAlign: 'center', marginBottom: 9, fontSize: '1.5rem', letterSpacing: '0.04em', color: '#eef2f8' }}>
      {label}
    </p>
  )
}
