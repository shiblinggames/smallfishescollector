// Route-level fallback for /sea — the most important one in the app, because
// the Fishing tab points here and this page runs the biggest server batch.
// Without this file a tab press sat DEAD until the whole render came home,
// which read as the app hanging; with it, the press answers instantly.
//
// Not a skeleton grid: the sea is a full-canvas world, so the honest fallback
// is the water itself — the same deep colour the chart paints first — with
// one quiet line. No layout to mimic means nothing to jump.

export default function Loading() {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0b1a24',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Tailwind's animate-pulse rather than a named keyframe: no bare
          `pulse` keyframes exist in globals.css, and an animation that
          silently resolves to nothing is a fallback that looks frozen. */}
      <p className="font-cinzel font-700 animate-pulse" style={{
        fontSize: '0.8rem', letterSpacing: '0.3em', textTransform: 'uppercase',
        color: 'rgba(214,232,240,0.45)',
      }}>
        Casting off
      </p>
    </div>
  )
}
