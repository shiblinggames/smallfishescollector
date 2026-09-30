// THE SHELL'S FRAME (Steam prep, 2026-09-30).
//
// The website's two layouts, played by the client: the root layout's chrome
// (the page tint, the battery saver, drag-to-scroll, keyboard advance, the
// watchers in AppChrome) and the game layout's (first-run setup and welcome,
// the Nav, the preloader, the coach ring, the unlock banner, the crew
// promotion, the doubloon guide), around whichever screen the URL names.
//
// Left out, because offline they have nothing to do: the Stripe checkouts
// (membership and gems), the session watcher (there is one session), the
// honeypot, and the Vercel analytics.
//
// The profile the frame reads is the save's own, re-read on every render, and
// router.refresh() re-renders, so a finished setup or a spent doubloon shows
// the moment the screen asks for a refresh, as on the web.

import { Suspense, useEffect, useState, type ComponentType } from 'react'
import { useLocationState, useRouter, Redirected } from './shims/navigation'
import { openSave, currentSave } from './localGameApi'
import { saveStorage } from './saveStorage'
import { SCREENS, HOME } from './screens'
import { isFirstRun } from '@/lib/core/seaPage'
import { canSail } from '@/lib/seaAccess'
import { isPremiumActive } from '@/lib/premium'
import { CHARACTER_COLORS } from '@/lib/characters'
import Nav from '@/components/Nav'
import SetupModal from '@/components/SetupModal'
import WelcomeModal from '@/components/WelcomeModal'
import CastingOff from '@/components/CastingOff'
import CoachFlash from '@/components/CoachFlash'
import UnlockBanner from '@/components/UnlockBanner'
import CrewPromotion from '@/components/CrewPromotion'
import DoubloonGuide from '@/components/DoubloonGuide'
import ClientBackground from '@/components/ClientBackground'
import AppChrome from '@/components/AppChrome'
import BackgroundAnimationPauser from '@/components/BackgroundAnimationPauser'
import DragScrollRows from '@/components/DragScrollRows'
import KeyboardAdvance from '@/components/KeyboardAdvance'

const DARK = <div aria-hidden style={{ position: 'fixed', inset: 0, background: '#0b1a24' }} />

export default function Shell() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void (async () => {
      const { storage } = await saveStorage()
      await openSave(storage)
      setReady(true)
    })()
  }, [])
  if (!ready) return DARK
  return <Frame />
}

function Frame() {
  const { pathname } = useLocationState()
  const router = useRouter()
  const profile = currentSave()!.profile

  // The web sends / (and every retired room) to the chart.
  useEffect(() => { if (pathname === '/' || pathname === '/index.html') router.replace(HOME) }, [pathname, router])

  const freeColorIds = CHARACTER_COLORS.filter(c => c.free).map(c => c.id)
  const unlockedColors = [...freeColorIds, ...((profile.unlocked_character_colors as string[] | null) ?? [])]

  return (
    <>
      <ClientBackground />
      <BackgroundAnimationPauser />
      <DragScrollRows />
      <KeyboardAdvance />
      {!profile.has_seen_setup
        ? <SetupModal
            currentColor={(profile.character_color as string | null) ?? 'default'}
            unlockedColors={unlockedColors}
            showWelcomeAfter={!profile.has_seen_welcome}
            hasUsername={!!profile.username_changed}
            isPremium={isPremiumActive(profile)}
          />
        : !profile.has_seen_welcome
          ? <WelcomeModal />
          : null}
      <Nav
        packsAvailable={profile.packs_available as number | undefined}
        doubloons={profile.doubloons as number | undefined}
        gems={profile.gems as number | undefined}
        canSail={canSail(profile)}
      />
      <ScreenHost />
      <CastingOff enabled={!!profile.has_seen_setup && !!profile.has_seen_welcome} />
      <CoachFlash />
      <UnlockBanner />
      <CrewPromotion />
      <DoubloonGuide />
      <AppChrome />
    </>
  )
}

/** The screen the URL names, with its loader's props. */
function ScreenHost() {
  const { pathname, search, refresh } = useLocationState()
  const screen = SCREENS[pathname]
  const [loaded, setLoaded] = useState<{ path: string; props: Record<string, unknown> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const profile = currentSave()!.profile

  useEffect(() => {
    if (!screen) return
    let live = true
    screen.load(new URLSearchParams(search))
      .then(props => { if (live) { setLoaded({ path: pathname, props }); setError(null) } })
      .catch(e => { if (live && !(e instanceof Redirected)) setError(e instanceof Error ? e.message : String(e)) })
    return () => { live = false }
  }, [screen, pathname, search, refresh])

  if (!screen) return <NotAboard pathname={pathname} />
  // NO SEA UNTIL THERE IS A CAPTAIN: a dark field holds the screen behind the
  // setup and welcome, as the web's /sea page does.
  if (pathname === '/sea' && isFirstRun(profile)) return DARK
  if (error) return <NotAboard pathname={pathname} error={error} />
  // Keep the last props while a refresh reloads (same path), like a server page.
  if (!loaded || loaded.path !== pathname) return DARK
  const C = screen.Component as ComponentType<Record<string, unknown>>
  return <Suspense fallback={DARK}><C {...loaded.props} /></Suspense>
}

function NotAboard({ pathname, error }: { pathname: string; error?: string }) {
  const router = useRouter()
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#0b1a24', color: '#f0ede8', fontFamily: 'var(--font-karla)' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
        <div style={{ fontFamily: 'var(--font-cinzel)', fontSize: 22, marginBottom: 10 }}>
          {error ? 'That room would not open' : 'That room is not aboard yet'}
        </div>
        <div style={{ opacity: 0.7, fontSize: 14, marginBottom: 18 }}>
          {error ?? `${pathname} has not been brought over to this build yet.`}
        </div>
        <button onClick={() => router.push(HOME)}
          style={{ padding: '10px 26px', borderRadius: 999, border: '1px solid rgba(240,192,64,0.6)', background: 'rgba(240,192,64,0.12)', color: '#f0c040', cursor: 'pointer' }}>
          Back to the sea
        </button>
      </div>
    </div>
  )
}
