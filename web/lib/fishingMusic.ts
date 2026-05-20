// Module-level audio singleton for the fishing soundtrack. Lives outside
// React's component tree so it survives navigation — leaving /fishing can
// fade the music out gracefully instead of being chopped by React unmount.
//
// HTML <audio> is used (not Web Audio API) because iOS WebKit + PWA mode
// route Web Audio through a session that often doesn't actually output;
// <audio> uses the reliable "media playback" session.

let el: HTMLAudioElement | null = null
let fadeRaf: number | null = null

function pickSrc(): string {
  // Prefer OGG/Vorbis when supported — no encoder padding, so <audio loop>
  // can cycle gaplessly. Fall back to MP3 for older WebKit.
  if (typeof document === 'undefined') return '/fishingsoundtrack.mp3'
  const probe = document.createElement('audio')
  if (probe.canPlayType('audio/ogg; codecs="vorbis"')) return '/fishingsoundtrack.ogg'
  return '/fishingsoundtrack.mp3'
}

function ensure(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  if (el) return el
  const audio = document.createElement('audio')
  audio.src = pickSrc()
  audio.loop = true
  audio.preload = 'auto'
  audio.muted = true // start muted so autoplay is permitted
  audio.setAttribute('playsinline', '')
  audio.setAttribute('aria-hidden', 'true')
  audio.style.display = 'none'
  document.body.appendChild(audio)
  // Autoplay (muted) so the element is "live" before the user taps unmute.
  audio.play().catch(() => {})
  el = audio
  return audio
}

function cancelFade() {
  if (fadeRaf !== null) {
    cancelAnimationFrame(fadeRaf)
    fadeRaf = null
  }
}

/** Start (or resume) the music. Pass muted=false synchronously inside a
 *  user-gesture handler to unlock playback on iOS. */
export function startFishingMusic(muted: boolean): void {
  const a = ensure()
  if (!a) return
  cancelFade()
  a.volume = 1
  a.muted = muted
  if (!muted) a.play().catch(() => {})
}

export function setFishingMusicMuted(muted: boolean): void {
  const a = ensure()
  if (!a) return
  cancelFade()
  a.volume = 1
  a.muted = muted
  if (!muted) a.play().catch(() => {})
}

/** Fade volume to 0 over the given ms, then pause. Safe to call when the
 *  element is already paused / muted — a no-op in that case. */
export function fadeOutFishingMusic(ms: number = 800): void {
  if (!el) return
  const a = el
  if (a.paused || a.muted) {
    try { a.pause() } catch {}
    return
  }
  cancelFade()
  const startVol = a.volume
  const startedAt = performance.now()
  const step = () => {
    const t = (performance.now() - startedAt) / ms
    if (t >= 1) {
      try { a.volume = 0; a.pause(); a.volume = startVol } catch {}
      fadeRaf = null
      return
    }
    try { a.volume = Math.max(0, startVol * (1 - t)) } catch {}
    fadeRaf = requestAnimationFrame(step)
  }
  fadeRaf = requestAnimationFrame(step)
}
