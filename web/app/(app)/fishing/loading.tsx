// Route-level Suspense fallback for /fishing.
//
// It used to be a grey skeleton. This page has no Suspense boundaries of its
// own, so it holds every pixel until the slowest of fourteen queries lands, and
// it is the screen players open more than any other. That wait gets a moment.
//
// IT IS THE PAGE'S OWN BACKDROP. The fixed layer below is copied stop for stop
// from FishingHub (same image, same objectPosition, same four-stop scrim), so
// when the real page arrives the water does not move at all: the tiles simply
// fade in over a scene that was already there. An invented loading illustration
// would have to cut to the page. This one becomes it. Keep the two in step. If
// FishingHub's backdrop changes, change it here.
//
// SERVER COMPONENT, and it must stay one. Shipping JavaScript to decorate a
// wait for JavaScript only lengthens it. The lure, the bubbles and the tips are
// CSS keyframes (see "THE SOUNDING" in globals.css) and all stop under
// prefers-reduced-motion. The image is already in cache for anyone who has been
// here before, and the scrim reads fine on its own the one time it is not.

const TIPS = [
  'Only a Perfect catch can come up golden.',
  'A perfect streak belongs to its zone. Fish another and it breaks.',
  'Different bait brings up different fish. Stock up at the tackle shop.',
]

export default function Loading() {
  return (
    <>
      {/* Copied from FishingHub. Same layer, same z-index, same everything. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fishing-zones-bg.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(2,8,14,0.62) 0%, rgba(2,8,14,0.20) 16%, rgba(2,8,14,0.38) 50%, rgba(2,6,10,0.72) 100%)' }} />

        {/* Bubbles, over the painting but under the words. Hand-staggered rather
            than generated so no two share a size, lane or rate and the group
            never pulses in time. */}
        {[
          { left: '30%', size: 4, delay: '0s',    dur: '9s' },
          { left: '44%', size: 6, delay: '-3.2s', dur: '11s' },
          { left: '68%', size: 3, delay: '-5.6s', dur: '8s' },
          { left: '78%', size: 5, delay: '-1.4s', dur: '12.5s' },
          { left: '22%', size: 3, delay: '-7.8s', dur: '10s' },
        ].map((b, i) => (
          <div key={i} className="fl-bubble" style={{
            position: 'absolute', bottom: '-8px', left: b.left,
            width: b.size, height: b.size, borderRadius: '50%',
            animationDelay: b.delay, animationDuration: b.dur,
            background: 'radial-gradient(circle at 32% 30%, rgba(255,255,255,0.85), rgba(170,220,245,0.28) 60%, rgba(170,220,245,0.05) 100%)',
          }} />
        ))}
      </div>

      <main aria-label="Loading" style={{ position: 'relative', zIndex: 1 }}>
        <div className="px-5 max-w-lg mx-auto" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: '5rem' }}>

          {/* THE LINE AND THE LURE. A line dropped from above down to a lure
              that turns slowly on it. Small on purpose: the painting is the
              scene, this is only the thing that proves the screen is alive. */}
          <div style={{ position: 'relative', width: 20, height: 150 }}>
            <div aria-hidden style={{ position: 'absolute', top: 0, left: '50%', width: 1, height: 118, background: 'linear-gradient(180deg, rgba(220,240,255,0.04), rgba(220,240,255,0.42))' }} />
            <div aria-hidden className="fl-bob" style={{ position: 'absolute', top: 116, left: '50%', marginLeft: -7 }}>
              <div style={{
                width: 14, height: 20, borderRadius: '50% 50% 50% 50% / 38% 38% 62% 62%',
                background: 'linear-gradient(160deg, #ffe9a8 0%, #f0c040 42%, #9a6f16 100%)',
                boxShadow: '0 0 16px rgba(240,192,64,0.5), inset 0 -2px 3px rgba(0,0,0,0.35)',
              }} />
              <div className="fl-glint" style={{
                position: 'absolute', top: 3, left: 3, width: 4, height: 5, borderRadius: '50%',
                background: 'rgba(255,255,255,0.95)', filter: 'blur(0.5px)',
              }} />
              {/* The hook, a bare stroke rather than a drawn shape. */}
              <div style={{ position: 'absolute', top: 19, left: 6, width: 6, height: 9, borderLeft: '1.5px solid rgba(214,222,232,0.72)', borderBottom: '1.5px solid rgba(214,222,232,0.72)', borderBottomLeftRadius: 7 }} />
            </div>
          </div>

          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#d6e8f4', letterSpacing: '0.05em', marginTop: 22, textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>
            Sounding the depths
          </p>

          {/* One slot, three lines taking turns on a 15s cycle. Height is
              reserved so nothing shifts as they swap. */}
          <div style={{ position: 'relative', height: 38, width: '100%', maxWidth: 320, marginTop: 10 }}>
            {TIPS.map((t, i) => (
              <p key={t} className="font-karla font-600 fl-tip"
                style={{
                  position: 'absolute', inset: 0, textAlign: 'center',
                  animationDelay: `${i * -5}s`,
                  fontSize: '0.84rem', lineHeight: 1.45, color: 'rgba(198,220,236,0.72)',
                  textShadow: '0 1px 8px rgba(0,0,0,0.7)',
                }}>
                {t}
              </p>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
