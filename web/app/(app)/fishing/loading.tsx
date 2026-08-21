// Route-level Suspense fallback for /fishing.
//
// It used to be a grey skeleton of the zone landing. Two reasons it is not any
// more: this page waits on fourteen queries before a single real pixel lands
// (it has no Suspense boundaries of its own, unlike the tavern and expeditions
// hubs), and it is the most-visited screen in the game. A skeleton is the right
// answer for a wait nobody notices. This one is noticed, so it gets a moment.
//
// SERVER COMPONENT, and it must stay one: shipping JavaScript to decorate a
// wait for JavaScript makes the wait longer. Every moving part is a CSS
// keyframe (see "THE SOUNDING" in globals.css), all of which stop under
// prefers-reduced-motion.
//
// It is framed rather than full-bleed so the Nav and tab bar stay put around
// it. A porthole into the water reads better than a screen fighting the chrome.

const TIPS = [
  'Only a Perfect catch can come up golden.',
  'A perfect streak belongs to its zone. Fish another and it breaks.',
  'Different bait brings up different fish. Stock up at the tackle shop.',
]

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-md" style={{ padding: '1rem 1rem 1.5rem' }}>
      <div
        aria-label="Loading"
        style={{
          position: 'relative',
          minHeight: 'calc(100svh - 210px)',
          borderRadius: 22,
          overflow: 'hidden',
          border: '1px solid rgba(120,180,220,0.14)',
          // Surface light down to true deep. The stops are close together near
          // the top so the light falls away fast, which is what makes the frame
          // read as depth rather than as a blue gradient.
          background: 'linear-gradient(180deg, #123449 0%, #0b2434 18%, #071722 42%, #030d15 72%, #01060b 100%)',
          boxShadow: 'inset 0 0 80px rgba(0,0,0,0.55)',
        }}
      >
        {/* Sun shafts. Two, at different widths and rates, so they never look
            like a mirrored pair. */}
        <div aria-hidden className="fl-shaft" style={{
          position: 'absolute', top: 0, left: '18%', width: 64, height: '62%',
          background: 'linear-gradient(180deg, rgba(150,220,255,0.20) 0%, rgba(150,220,255,0.05) 55%, transparent 100%)',
          filter: 'blur(9px)',
        }} />
        <div aria-hidden className="fl-shaft" style={{
          position: 'absolute', top: 0, left: '62%', width: 38, height: '48%',
          animationDelay: '-4.5s', animationDuration: '14s',
          background: 'linear-gradient(180deg, rgba(150,220,255,0.16) 0%, rgba(150,220,255,0.04) 55%, transparent 100%)',
          filter: 'blur(7px)',
        }} />

        {/* THE DEPTH TICKS, and the whole illusion. Short marks every 34px, a
            long one every 170px, crawling upward past a lure that never moves
            down. Height and travel are set in globals.css in PIXELS chosen to
            divide both intervals, so the loop has no seam at any viewport
            height. Masked soft at top and bottom so marks fade in and out
            rather than clipping at the frame edge. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', maskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)', WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)' }}>
          <div className="fl-ticks" style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            backgroundImage: [
              'repeating-linear-gradient(180deg, rgba(150,210,240,0.16) 0px, rgba(150,210,240,0.16) 1px, transparent 1px, transparent 34px)',
              'repeating-linear-gradient(180deg, rgba(150,210,240,0.26) 0px, rgba(150,210,240,0.26) 2px, transparent 2px, transparent 170px)',
            ].join(', '),
            backgroundSize: '18px 100%, 34px 100%',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'left 22px top, left 22px top',
          }} />
        </div>

        {/* Bubbles. Staggered by hand rather than generated, so each one has its
            own size, lane and rate and the group never pulses in time. */}
        {[
          { left: '30%', size: 4, delay: '0s',    dur: '9s' },
          { left: '44%', size: 6, delay: '-3.2s', dur: '11s' },
          { left: '68%', size: 3, delay: '-5.6s', dur: '8s' },
          { left: '78%', size: 5, delay: '-1.4s', dur: '12.5s' },
          { left: '22%', size: 3, delay: '-7.8s', dur: '10s' },
        ].map((b, i) => (
          <div key={i} aria-hidden className="fl-bubble" style={{
            position: 'absolute', bottom: '-8px', left: b.left,
            width: b.size, height: b.size, borderRadius: '50%',
            animationDelay: b.delay, animationDuration: b.dur,
            background: 'radial-gradient(circle at 32% 30%, rgba(255,255,255,0.85), rgba(170,220,245,0.28) 60%, rgba(170,220,245,0.05) 100%)',
          }} />
        ))}

        {/* THE LINE AND THE LURE. The lure holds its height and bobs; the ticks
            above do the travelling. */}
        <div aria-hidden style={{ position: 'absolute', top: 0, left: '50%', width: 1, height: '46%', background: 'linear-gradient(180deg, rgba(220,240,255,0.06), rgba(220,240,255,0.42))' }} />
        <div aria-hidden className="fl-bob" style={{ position: 'absolute', top: '46%', left: '50%', marginLeft: -7, marginTop: -2 }}>
          <div style={{
            width: 14, height: 20, borderRadius: '50% 50% 50% 50% / 38% 38% 62% 62%',
            background: 'linear-gradient(160deg, #ffe9a8 0%, #f0c040 42%, #9a6f16 100%)',
            boxShadow: '0 0 14px rgba(240,192,64,0.45), inset 0 -2px 3px rgba(0,0,0,0.35)',
          }} />
          <div className="fl-glint" style={{
            position: 'absolute', top: 3, left: 3, width: 4, height: 5, borderRadius: '50%',
            background: 'rgba(255,255,255,0.95)', filter: 'blur(0.5px)',
          }} />
          {/* The hook, a bare stroke rather than a drawn shape. */}
          <div style={{ position: 'absolute', top: 19, left: 6, width: 6, height: 9, borderLeft: '1.5px solid rgba(214,222,232,0.75)', borderBottom: '1.5px solid rgba(214,222,232,0.75)', borderBottomLeftRadius: 7 }} />
        </div>

        {/* The words sit on the floor of the frame, in the dark, where there is
            nothing else competing for the eye. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 1.4rem 2.1rem', textAlign: 'center' }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.02rem', color: '#cfe4f2', letterSpacing: '0.04em' }}>
            Sounding the depths
          </p>
          {/* One slot, three lines taking turns. Reserved height so the frame
              never jumps as they swap. */}
          <div style={{ position: 'relative', height: 34, marginTop: 8 }}>
            {TIPS.map((t, i) => (
              <p key={t} className="font-karla font-600 fl-tip"
                style={{
                  position: 'absolute', inset: 0,
                  animationDelay: `${i * -5}s`,
                  fontSize: '0.82rem', lineHeight: 1.4, color: 'rgba(190,214,232,0.66)',
                }}>
                {t}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
