'use client'

import { useState, useTransition } from 'react'
import { vibrate } from '@/lib/haptics'
import { motion, AnimatePresence } from 'framer-motion'
import { updateUsername, updateCharacterColor, updateAvatarColors } from '@/app/(app)/u/actions'
import { markSetupSeen } from '@/app/actions/firstRun'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import { AVATAR_PALETTE, NONE_VALUE } from '@/lib/avatarColors'
import CharacterAvatar from '@/components/CharacterAvatar'
import WelcomeModal from './WelcomeModal'
import { GUIDES } from '@/lib/onboardingScenes'
import PopupShell from '@/components/PopupShell'

// ONE CARD, THREE STEPS. It used to be three separately sized cards and the
// panel resized under a captain as they filled it in. One card now, and the
// steps swap inside it.
const HARBOUR = '/welcome-harbour.webp'

// The step transition, likewise identical across the three.
const SWAP = {
  initial: { opacity: 0, y: 16, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -12, scale: 0.97 },
  transition: { duration: 0.2 },
} as const

// ── A GUIDE HAS A COLOUR ────────────────────────────────────────────────────
// Doby was #60a5fa on the first step and #c8a870 on the second, which is one
// character in two colours across two consecutive screens. The accent belongs
// to whoever is speaking, so it is looked up rather than typed at each call.
const VOICE = {
  doby: { portrait: GUIDES.doby.portrait, speaker: 'Doby', accent: '#60a5fa' },
  kat: { portrait: GUIDES.kat.portrait, speaker: 'Kat', accent: '#f0c040' },
} as const

// A character bust + one plain guiding line, in place of the generic eyebrow +
// title, so Doby/Kat walk the new captain through setup.
function GuideHeader({ portrait, speaker, accent, line }: { portrait: string; speaker: string; accent: string; line: string }) {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: '1rem' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={portrait} alt="" loading="lazy" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', flexShrink: 0, border: `1px solid ${accent}66`, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ minWidth: 0 }}>
        <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.16em', color: accent, marginBottom: 3 }}>{speaker}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#f0ede8', lineHeight: 1.2 }}>{line}</p>
      </div>
    </div>
  )
}

type Step = 'username' | 'color' | 'avatar'

interface Props {
  currentColor: string
  unlockedColors: string[]
  showWelcomeAfter: boolean
  hasUsername: boolean
  isPremium: boolean
}

export default function SetupModal({ currentColor, unlockedColors, showWelcomeAfter, hasUsername, isPremium }: Props) {
  const [step, setStep] = useState<Step>(hasUsername ? 'color' : 'username')
  const [done, setDone] = useState(false)

  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [usernamePending, startUsernameTx] = useTransition()

  const [selectedColor, setSelectedColor] = useState(currentColor)
  const [hintSkinId, setHintSkinId] = useState<string | null>(null)
  const [colorPending, startColorTx] = useTransition()

  // Avatar bg + border choices. null = use the shared defaults from
  // lib/avatarColors (transparent).
  const [avatarBg, setAvatarBg] = useState<string | null>(null)
  const [avatarBorder, setAvatarBorder] = useState<string | null>(null)
  const [avatarLockMsg, setAvatarLockMsg] = useState<string | null>(null)
  function flashLockMsg(msg: string) {
    setAvatarLockMsg(msg)
    setTimeout(() => setAvatarLockMsg(prev => (prev === msg ? null : prev)), 4000)
  }
  const [finishPending, startFinishTx] = useTransition()

  const totalSteps = hasUsername ? 2 : 3
  const stepIndex = step === 'username' ? 1 : step === 'color' ? (hasUsername ? 1 : 2) : (hasUsername ? 2 : 3)

  function handleUsernameNext(e: React.FormEvent) {
    e.preventDefault()
    const val = usernameInput.trim()
    // The button is disabled while the box is empty, so this is the keyboard
    // path only. It used to advance to the next step on an empty box, which was
    // the skip link wearing a different hat.
    if (!val) { setUsernameError('Every captain needs a name.'); return }
    setUsernameError('')
    startUsernameTx(async () => {
      const res = await updateUsername(val)
      if ('error' in res && res.error) { setUsernameError(res.error); return }
      setStep('color')
    })
  }

  function handleColorNext() {
    // Save the color choice and advance to the avatar step. If they picked
    // the same color we already have, skip the network call.
    startColorTx(async () => {
      if (selectedColor !== currentColor) await updateCharacterColor(selectedColor)
      setStep('avatar')
    })
  }

  function handleFinish() {
    vibrate(10)
    startFinishTx(async () => {
      // Two writes to the same row, in parallel rather than one after the
      // other: the press used to wait out two round trips in series.
      await Promise.all([
        updateAvatarColors({ bgColor: avatarBg, borderColor: avatarBorder }),
        markSetupSeen(),
      ])
      setDone(true)
      // When there is no welcome to play this IS the end of setup, and the sea
      // page has been showing a dark field until now. Same full load the
      // welcome does, for the same reason: the chart gets built from the
      // finished profile, once.
      if (!showWelcomeAfter) window.location.assign('/sea')
    })
  }

  // ── THE FIRST THING THE GAME EVER SHOWS ──────────────────────────────────
  //
  // Kong: this is the very first impression, and it was a small dark card over
  // a dark, empty page. Now it is a place and a person: the harbour painting
  // behind everything, and a card with YOUR captain in YOUR dinghy on the left,
  // on that same water, who changes as you choose. The name you type is on a
  // plate under them; the colour you pick is the fish in the boat; the avatar
  // colours are the badge in the corner. Every step edits the same picture,
  // so the three steps read as dressing one captain rather than three forms.
  //
  // One column on a phone (the picture across the top, shorter), two from 760.
  const voice = step === 'avatar' ? VOICE.kat : VOICE.doby
  const line = step === 'username'
    ? 'Welcome aboard, Captain! First, what should we call you?'
    : step === 'color' ? 'Now pick your look.' : 'One last thing: your avatar colors.'
  const plateName = (hasUsername ? '' : usernameInput.trim()) || 'Captain'
  const sprites = getCharacterSprites(selectedColor)
  const primary = (accent: string, on: boolean, busy: boolean): React.CSSProperties => ({
    width: '100%', padding: '0.85rem', borderRadius: 12,
    // Tinted, never a solid gold slab (house rule for modal primaries).
    background: on ? `linear-gradient(180deg, ${accent}33, ${accent}1a)` : 'rgba(255,255,255,0.04)',
    border: `1px solid ${on ? `${accent}99` : 'rgba(255,255,255,0.1)'}`,
    boxShadow: on ? `0 0 22px ${accent}22, inset 0 1px 0 rgba(255,255,255,0.1)` : 'none',
    color: on ? '#f4efe4' : '#5a5854', fontSize: '0.86rem', letterSpacing: '0.08em',
    cursor: on && !busy ? 'pointer' : 'default', opacity: busy ? 0.55 : 1,
    transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
  })

  return (
    <>
    {done && showWelcomeAfter && <WelcomeModal />}
    {/* The harbour, behind everything, slowly breathing in. Under the shell's
        scrim (111), which is lightened so the painting reads through it. */}
    {!done && (
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 110, overflow: 'hidden', background: '#07121c', pointerEvents: 'none' }}>
        <motion.img src={HARBOUR} alt="" decoding="async"
          initial={{ scale: 1.04, opacity: 0 }} animate={{ scale: 1.12, opacity: 1 }}
          transition={{ scale: { duration: 40, ease: 'easeOut' }, opacity: { duration: 0.8 } }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 60%' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(4,8,14,0.15) 0%, rgba(4,8,14,0.6) 100%)' }} />
      </div>
    )}
    <PopupShell open={!done} onClose={() => {}} backdropColor="rgba(4,8,14,0.28)">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="setup-card"
        style={{
          margin: 'auto', flexShrink: 0, width: '100%', maxWidth: 'min(880px, 100%)',
          background: 'rgba(8,14,24,0.97)',
          border: `1px solid ${voice.accent}40`,
          borderRadius: 20, overflow: 'hidden',
          boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 40px ${voice.accent}14`,
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}>
        {/* ── YOUR CAPTAIN ─────────────────────────────────────────────── */}
        <div className="setup-hero" style={{ position: 'relative', overflow: 'hidden', background: '#0b1824' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HARBOUR} alt="" decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '38% 62%' }} />
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,14,24,0.1) 0%, rgba(8,14,24,0) 45%, rgba(8,14,24,0.55) 78%, rgba(8,14,24,0.95) 100%)' }} />
          {/* The dinghy, cropped out of the fishing sprite (the fish in its boat),
              sitting on the painted water. Keyed on the colour so a new pick
              bobs in rather than swapping flat. */}
          {/* Centred by a plain wrapper: framer owns the transform of the
              moving layers, and a translateX on them would be clobbered. */}
          <div className="setup-boat-wrap" style={{ position: 'absolute', left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <AnimatePresence mode="popLayout">
              <motion.div key={selectedColor} aria-hidden className="setup-boat"
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                style={{ aspectRatio: '520 / 380' }}>
                <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    width: '100%', height: '100%',
                    backgroundImage: `url(${sprites.rest})`, backgroundRepeat: 'no-repeat',
                    backgroundSize: '173% auto', backgroundPosition: '71% 95%',
                  }} />
              </motion.div>
            </AnimatePresence>
          </div>
          {/* The avatar badge, top left: what the rest of the world will see. */}
          <div style={{ position: 'absolute', top: 14, left: 14 }}>
            <CharacterAvatar characterColor={selectedColor} equippedHat={null} size={54}
              bgColor={avatarBg ?? undefined} ringColor={avatarBorder ?? undefined} />
          </div>
          {/* The name plate. */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center' }}>
            <span className="font-pirata" style={{
              fontSize: '1.7rem', lineHeight: 1, color: '#f3e5c6', padding: '0.35rem 1.1rem 0.3rem',
              borderRadius: 10, background: 'rgba(8,14,24,0.72)', border: '1px solid rgba(243,229,198,0.22)',
              textShadow: '0 2px 10px rgba(0,0,0,0.8)', maxWidth: '86%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              opacity: plateName === 'Captain' && !hasUsername ? 0.6 : 1,
            }}>{plateName}</span>
          </div>
        </div>

        {/* ── THE STEP ─────────────────────────────────────────────────── */}
        <div className="setup-body" style={{ padding: '1.5rem 1.5rem 1.3rem', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Where you are: a pip per step, the current one long. */}
          <div aria-label={`Step ${stepIndex} of ${totalSteps}`} style={{ display: 'flex', gap: 6, marginBottom: '1.1rem' }}>
            {Array.from({ length: totalSteps }).map((_, k) => (
              <span key={k} style={{
                height: 4, borderRadius: 999, width: k + 1 === stepIndex ? 26 : 10,
                background: k + 1 <= stepIndex ? voice.accent : 'rgba(255,255,255,0.14)',
                transition: 'width 0.3s, background 0.3s',
              }} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={step} {...SWAP} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <GuideHeader {...voice} line={line} />

              {step === 'username' && (
                <>
                  <p className="font-karla font-400" style={{ fontSize: '0.8rem', color: '#9aa0a6', marginBottom: '1.2rem', lineHeight: 1.55 }}>
                    This is how other captains will see you, on the leaderboards, in raids, and around the tavern.
                  </p>
                  <form onSubmit={handleUsernameNext} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={e => { setUsernameInput(e.target.value); setUsernameError('') }}
                      placeholder="your_name"
                      className="sg-input font-karla font-600 tracking-[0.06em] w-full"
                      style={{ fontSize: '1.05rem', marginBottom: 6 }}
                      maxLength={20}
                      autoFocus
                      spellCheck={false}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    <p className="font-karla font-400" style={{ fontSize: '0.68rem', color: usernameError ? '#f87171' : '#6a6764', minHeight: 18, marginBottom: '1.1rem' }}>
                      {usernameError || '3 to 20 characters: letters, numbers, underscores'}
                    </p>
                    {/* ── AND THERE IS NO SKIPPING IT ─────────────────────────
                        There was a "skip for now" link under this. It let a
                        captain past with the auto-assigned username they never
                        chose and CANNOT CHANGE LATER (updateUsername is a
                        one-time lock). The one screen that exists to ask this
                        question asks it. */}
                    <button type="submit" disabled={usernamePending || !usernameInput.trim()}
                      className="font-cinzel font-700 uppercase tap" style={{ ...primary(VOICE.doby.accent, !!usernameInput.trim(), usernamePending), marginTop: 'auto' }}>
                      {usernamePending ? '…' : 'Continue'}
                    </button>
                  </form>
                </>
              )}

              {step === 'color' && (
                <>
                  <p className="font-karla font-400" style={{ fontSize: '0.8rem', color: '#9aa0a6', marginBottom: '1rem', lineHeight: 1.5 }}>
                    Unlock more colors as you play.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(66px, 1fr))', gap: 10, marginBottom: '1rem' }}>
                    {CHARACTER_COLORS.map(c => {
                      const sp = getCharacterSprites(c.id)
                      const isActive = selectedColor === c.id
                      const isUnlocked = unlockedColors.includes(c.id)
                      const isHinted = hintSkinId === c.id
                      return (
                        <button key={c.id} type="button" className="setup-swatch"
                          onClick={() => {
                            if (!isUnlocked) { setHintSkinId(isHinted ? null : c.id); return }
                            vibrate(6)
                            setSelectedColor(c.id)
                            setHintSkinId(null)
                          }}
                          style={{
                            background: isActive ? 'rgba(200,168,112,0.12)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${isActive ? 'rgba(200,168,112,0.7)' : isHinted ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: 14, cursor: 'pointer', padding: '0.5rem 0.2rem 0.45rem',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                            boxShadow: isActive ? '0 0 16px rgba(200,168,112,0.25)' : 'none',
                          }}>
                          <div style={{
                            width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', position: 'relative',
                            backgroundImage: `url(${sp.rest})`, backgroundSize: '420% auto', backgroundPosition: '60% 68%', backgroundRepeat: 'no-repeat',
                            backgroundColor: 'rgba(0,0,0,0.25)',
                            opacity: isUnlocked ? 1 : 0.45,
                          }}>
                            {!isUnlocked && (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                              </div>
                            )}
                          </div>
                          <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: isActive ? '#e3c890' : isHinted ? '#f0c040' : '#7a7772' }}>
                            {c.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {hintSkinId && (() => {
                    const skin = CHARACTER_COLORS.find(c => c.id === hintSkinId)
                    if (!skin?.unlockHint) return null
                    return (
                      <div style={{
                        marginBottom: '1rem', background: 'rgba(20,12,4,0.9)',
                        border: '1px solid rgba(240,192,64,0.3)', borderLeft: '3px solid rgba(240,192,64,0.65)',
                        borderRadius: 10, padding: '0.7rem 0.9rem',
                      }}>
                        <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#f0c040', marginBottom: 3 }}>{skin.name}, locked</p>
                        <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}>{skin.unlockHint}</p>
                      </div>
                    )
                  })()}
                  <button type="button" onClick={handleColorNext} disabled={colorPending}
                    className="font-cinzel font-700 uppercase tap" style={{ ...primary(VOICE.doby.accent, true, colorPending), marginTop: 'auto' }}>
                    {colorPending ? '…' : 'Continue'}
                  </button>
                </>
              )}

              {step === 'avatar' && (
                <>
                  <p className="font-karla font-400" style={{ fontSize: '0.8rem', color: '#9aa0a6', marginBottom: '1rem', lineHeight: 1.5 }}>
                    The background and border around your character. It shows up everywhere you do.
                  </p>
                  {(['bg', 'border'] as const).map(kind => (
                    <div key={kind} style={{ marginBottom: 12 }}>
                      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', color: '#7a9bc4', letterSpacing: '0.14em', marginBottom: 7 }}>
                        {kind === 'bg' ? 'Background' : 'Border'}
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 7 }} className="setup-swatches">
                        {AVATAR_PALETTE.map(c => {
                          const cur = kind === 'bg' ? avatarBg : avatarBorder
                          const isActive = cur === c.hex || (cur === null && c.hex === NONE_VALUE)
                          const isNone = c.hex === NONE_VALUE
                          const locked = !!c.premiumOnly && !isPremium
                          const checker = 'linear-gradient(45deg, rgba(255,255,255,0.18) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.18) 75%, transparent 75%, transparent)'
                          return (
                            <button key={`${kind}-${c.id}`} type="button"
                              onClick={() => {
                                if (locked) { flashLockMsg('Become a Captain to unlock this'); return }
                                const v = c.hex === NONE_VALUE ? null : c.hex
                                if (kind === 'bg') setAvatarBg(v); else setAvatarBorder(v)
                              }}
                              aria-label={`${kind === 'bg' ? 'Background' : 'Border'} ${c.label}${locked ? ' (premium)' : ''}`}
                              title={locked ? `${c.label}, Captain only` : c.label}
                              style={{
                                width: '100%', aspectRatio: '1 / 1', borderRadius: '50%', padding: 0, cursor: 'pointer',
                                position: 'relative', appearance: 'none', WebkitAppearance: 'none', opacity: locked ? 0.5 : 1,
                                ...(kind === 'bg'
                                  ? {
                                      backgroundColor: isNone ? 'transparent' : c.hex,
                                      backgroundImage: isNone ? checker : `radial-gradient(circle at 38% 35%, ${c.hex}ee 0%, ${c.hex}77 100%)`,
                                      backgroundSize: isNone ? '8px 8px' : undefined,
                                      border: '1px solid rgba(255,255,255,0.18)',
                                    }
                                  : {
                                      backgroundColor: 'rgba(6,12,20,0.7)',
                                      backgroundImage: isNone ? checker : undefined,
                                      backgroundSize: isNone ? '8px 8px' : undefined,
                                      border: isNone ? '1px dashed rgba(255,255,255,0.4)' : `3px solid ${c.hex}`,
                                    }),
                                outline: isActive ? '2px solid #f0c040' : 'none', outlineOffset: 2,
                              }}>
                              {locked && <LockBadge />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {/* Lock toast slot. No membership upsell during setup. */}
                  <div style={{ minHeight: 24, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {avatarLockMsg && (
                      <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#f0c040', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.35)', borderRadius: 999, padding: '0.25rem 0.7rem' }}>
                        {avatarLockMsg}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={handleFinish} disabled={finishPending}
                    className="font-cinzel font-700 uppercase tap" style={{ ...primary(VOICE.kat.accent, true, finishPending), marginTop: 'auto' }}>
                    {finishPending ? '…' : 'Set sail'}
                  </button>
                  <p className="font-karla font-400 text-center" style={{ fontSize: '0.62rem', color: '#5a5854', marginTop: '0.8rem' }}>
                    You can change these later from your Profile.
                  </p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </PopupShell>
    </>
  )
}

function LockBadge() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ position: 'absolute', inset: 0, margin: 'auto', pointerEvents: 'none', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))' }}>
      <rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    </svg>
  )
}
