'use client'

import { useState } from 'react'

/**
 * ── THE TRAILER ─────────────────────────────────────────────────────────────
 *
 * The one block on the landing page that is allowed to be big. A trailer is the
 * only thing that can show a game MOVING, and this game's whole argument is
 * movement: a needle turning, a hull crossing open water, a shot landing.
 *
 * ── WHY IT DOES NOT PLAY ON ITS OWN ─────────────────────────────────────────
 *
 * Autoplay is the default instinct and it is wrong twice. A muted autoplay
 * trailer is a silent trailer, and the sound is half of what a trailer is for.
 * And it costs every visitor a video download to decide they did not want one,
 * on a page whose selling point is that nothing has to be downloaded. So this
 * loads `preload="none"`, shows a still, and fetches nothing until somebody
 * presses play. Then it plays WITH sound, because they asked for it.
 *
 * ── AND WHY THE POSTER IS A REAL FRAME ──────────────────────────────────────
 *
 * The still is the first thing anybody sees and most of them will never press
 * play, so it is doing a screenshot's job whether it likes it or not. It should
 * be a frame worth looking at on its own, not black, and not a title card: a
 * title card under a title tells a visitor the same thing twice.
 *
 * ── TWO KINDS ───────────────────────────────────────────────────────────────
 *
 * A file we host, or a YouTube id. Both are here because the choice is a
 * hosting decision rather than a design one, and it should not need a rewrite.
 * A hosted file is cleaner (no third-party chrome, no suggested videos over the
 * end frame) and costs bandwidth. YouTube is free and brings its own furniture.
 * The FAÇADE matters either way: an embedded YouTube iframe on page load pulls
 * several hundred kilobytes and sets cookies before anybody has asked for a
 * video, so the iframe is not created until the press.
 */
export type Trailer =
  | { kind: 'file'; src: string; poster: string }
  | { kind: 'youtube'; id: string; poster: string }

export default function TrailerFrame({ trailer, label }: { trailer: Trailer; label: string }) {
  const [playing, setPlaying] = useState(false)

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: 18,
        overflow: 'hidden',
        background: '#02060c',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 40px 90px rgba(0,0,0,0.7), 0 0 90px rgba(20,120,150,0.14)',
      }}
    >
      {!playing && (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={label}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            padding: 0,
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
            display: 'block',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={trailer.poster}
            alt=""
            aria-hidden
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* Darkened toward the middle so the button has something to sit on
              whatever the frame underneath happens to be. */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(60% 60% at 50% 50%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.12) 70%, rgba(0,0,0,0.30) 100%)',
            }}
          />
          <span className="trailer-play" aria-hidden>
            <svg viewBox="0 0 24 24" width="30" height="30" focusable="false">
              <path d="M8 5.2v13.6L19.5 12 8 5.2z" fill="currentColor" />
            </svg>
          </span>
          <span
            className="font-cinzel font-700"
            aria-hidden
            style={{
              position: 'absolute',
              left: '50%',
              bottom: '13%',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              fontSize: '0.74rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(244,236,216,0.92)',
              textShadow: '0 2px 18px rgba(0,0,0,0.9)',
            }}
          >
            {label}
          </span>
        </button>
      )}

      {playing && trailer.kind === 'file' && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={trailer.src}
          poster={trailer.poster}
          controls
          autoPlay
          playsInline
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', background: '#02060c' }}
        />
      )}

      {playing && trailer.kind === 'youtube' && (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${trailer.id}?autoplay=1&rel=0&modestbranding=1`}
          title={label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ display: 'block', width: '100%', height: '100%', border: 'none' }}
        />
      )}
    </div>
  )
}
