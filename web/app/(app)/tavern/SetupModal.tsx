'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { updateUsername, updateCharacterColor, updateAvatarColors } from '@/app/(app)/u/actions'
import { markSetupSeen } from './welcomeActions'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import { AVATAR_PALETTE, NONE_VALUE } from '@/lib/avatarColors'
import CharacterAvatar from '@/components/CharacterAvatar'
import WelcomeModal from './WelcomeModal'
import BecomeCaptainButton from '@/components/BecomeCaptainButton'

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
    if (!val) { setStep('color'); return }
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
    startFinishTx(async () => {
      await updateAvatarColors({ bgColor: avatarBg, borderColor: avatarBorder })
      await markSetupSeen()
      setDone(true)
    })
  }

  if (done && showWelcomeAfter) return <WelcomeModal />
  if (done) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <AnimatePresence mode="wait">
        {step === 'username' && (
          <motion.div
            key="username"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            style={{
              width: '100%', maxWidth: 400,
              background: '#060e1a',
              border: '1px solid rgba(255,255,255,0.1)',
              borderTop: '3px solid #60a5fa',
              borderRadius: 18,
              padding: '2rem 1.75rem',
            }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.52rem', color: '#60a5fa', marginBottom: '1.25rem' }}>
              Small Fishes
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f0ede8', lineHeight: 1.2, marginBottom: '0.5rem' }}>
              Pick your captain name
            </p>
            <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#9aa0a6', marginBottom: '1.5rem', lineHeight: 1.55 }}>
              This is how other captains will see you — on the leaderboards, in raids, and around the tavern.
            </p>

            <form onSubmit={handleUsernameNext}>
              <input
                type="text"
                value={usernameInput}
                onChange={e => { setUsernameInput(e.target.value); setUsernameError('') }}
                placeholder="your_name"
                className="sg-input font-karla font-600 tracking-[0.06em] w-full"
                style={{ fontSize: '1rem', marginBottom: usernameError ? 6 : '1rem' }}
                maxLength={20}
                autoFocus
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
              />
              {usernameError && (
                <p className="font-karla font-400" style={{ fontSize: '0.68rem', color: '#f87171', marginBottom: '1rem' }}>{usernameError}</p>
              )}
              <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#4a4845', marginBottom: '0.4rem' }}>
                3–20 characters · letters, numbers, underscores
              </p>
              {/* Permanence caveat kept small + low-key. Leading with it
                  (the old copy) discouraged players from picking one
                  in case they "got it wrong" — better to put visibility
                  benefits up top and let this sit as a footnote. */}
              <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#4a4845', marginBottom: '1.25rem' }}>
                Permanent — set once, kept forever.
              </p>
              {/* Continue is now the full-width primary CTA. Skip drops
                  to a small text link below so it reads as "I'll come
                  back to this," not as an equal-weight alternative —
                  highly suggests picking a name without forcing it. */}
              <button
                type="submit"
                disabled={usernamePending || !usernameInput.trim()}
                className="font-karla font-700 w-full"
                style={{
                  padding: '0.8rem',
                  background: usernameInput.trim() ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${usernameInput.trim() ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 10, cursor: usernameInput.trim() ? 'pointer' : 'default',
                  fontSize: '0.78rem', color: usernameInput.trim() ? '#60a5fa' : '#4a4845',
                  opacity: usernamePending ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {usernamePending ? '…' : 'Continue →'}
              </button>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.7rem' }}>
                <button
                  type="button"
                  onClick={() => setStep('color')}
                  className="font-karla font-600"
                  style={{
                    background: 'none', border: 'none', padding: '0.3rem 0.6rem',
                    cursor: 'pointer',
                    fontSize: '0.66rem', color: '#5a5550',
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                    textDecorationColor: 'rgba(255,255,255,0.18)',
                  }}
                >
                  Skip for now
                </button>
              </div>
            </form>

            <p className="font-karla font-400 text-center" style={{ fontSize: '0.58rem', color: '#3a3835', marginTop: '1.25rem' }}>Step {stepIndex} of {totalSteps}</p>
          </motion.div>
        )}

        {step === 'color' && (
          <motion.div
            key="color"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            style={{
              width: '100%', maxWidth: 400,
              background: '#060e1a',
              border: '1px solid rgba(255,255,255,0.1)',
              borderTop: '3px solid #c8a870',
              borderRadius: 18,
              padding: '2rem 1.75rem',
            }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.52rem', color: '#c8a870', marginBottom: '1.25rem' }}>
              Small Fishes
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f0ede8', lineHeight: 1.2, marginBottom: '0.5rem' }}>
              Pick your character
            </p>
            <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#6a6764', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Unlock more colors as you play.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: hintSkinId ? 0 : '1.25rem' }}>
              {CHARACTER_COLORS.map(c => {
                const sprites = getCharacterSprites(c.id)
                const isActive = selectedColor === c.id
                const isUnlocked = unlockedColors.includes(c.id)
                const isHinted = hintSkinId === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (!isUnlocked) { setHintSkinId(isHinted ? null : c.id); return }
                      setSelectedColor(c.id)
                      setHintSkinId(null)
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      opacity: !isUnlocked ? 0.5 : 1,
                    }}
                  >
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%', overflow: 'hidden',
                      backgroundImage: `url(${sprites.rest})`,
                      backgroundSize: '420% auto', backgroundPosition: '60% 68%',
                      backgroundRepeat: 'no-repeat',
                      border: isActive ? '2px solid #c8a870' : isHinted ? '2px solid rgba(240,192,64,0.5)' : '2px solid rgba(255,255,255,0.1)',
                      boxShadow: isActive ? '0 0 12px rgba(200,168,112,0.45)' : 'none',
                      position: 'relative',
                    }}>
                      {!isUnlocked && (
                        <div style={{
                          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(0,0,0,0.52)', borderRadius: '50%',
                        }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round">
                            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: isActive ? '#c8a870' : isHinted ? '#f0c040' : '#6a6764' }}>
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
                  margin: '0.85rem 0 1.25rem',
                  background: 'rgba(20,12,4,0.9)',
                  border: '1px solid rgba(240,192,64,0.3)',
                  borderLeft: '3px solid rgba(240,192,64,0.65)',
                  borderRadius: 10, padding: '0.7rem 0.9rem',
                }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#f0c040', marginBottom: 3 }}>
                    {skin.name} — Locked
                  </p>
                  <p className="font-karla font-400" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}>
                    {skin.unlockHint}
                  </p>
                </div>
              )
            })()}

            <button
              onClick={handleColorNext}
              disabled={colorPending}
              className="font-karla font-700 w-full"
              style={{
                padding: '0.75rem',
                background: 'rgba(200,168,112,0.15)', border: '1px solid rgba(200,168,112,0.45)',
                borderRadius: 10, cursor: 'pointer',
                fontSize: '0.75rem', color: '#c8a870',
                opacity: colorPending ? 0.5 : 1,
              }}
            >
              {colorPending ? '…' : 'Continue →'}
            </button>

            <p className="font-karla font-400 text-center" style={{ fontSize: '0.58rem', color: '#3a3835', marginTop: '1.25rem' }}>Step {stepIndex} of {totalSteps}</p>
          </motion.div>
        )}

        {step === 'avatar' && (
          <motion.div
            key="avatar"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            style={{
              width: '100%', maxWidth: 400,
              background: '#060e1a',
              border: '1px solid rgba(255,255,255,0.1)',
              borderTop: '3px solid #f0c040',
              borderRadius: 18,
              padding: '1.6rem 1.5rem 1.5rem',
            }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.52rem', color: '#f0c040', marginBottom: '1rem' }}>
              Small Fishes
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f0ede8', lineHeight: 1.2, marginBottom: '0.4rem' }}>
              Pick your avatar colors
            </p>
            <p className="font-karla font-400" style={{ fontSize: '0.7rem', color: '#6a6764', marginBottom: '1.1rem', lineHeight: 1.5 }}>
              Background and border around your character. Shows up everywhere you do.
            </p>

            {/* Live preview */}
            <div className="flex items-center justify-center" style={{ marginBottom: 14 }}>
              <CharacterAvatar
                characterColor={selectedColor}
                equippedHat={null}
                size={84}
                bgColor={avatarBg ?? undefined}
                ringColor={avatarBorder ?? undefined}
              />
            </div>

            {/* Background swatches */}
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', color: '#7a9bc4', letterSpacing: '0.14em', marginBottom: 6 }}>
              Background
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 12 }}>
              {AVATAR_PALETTE.map(c => {
                const isActive = avatarBg === c.hex || (avatarBg === null && c.hex === NONE_VALUE)
                const isNone = c.hex === NONE_VALUE
                const locked = !!c.premiumOnly && !isPremium
                return (
                  <button
                    key={`bg-${c.id}`}
                    type="button"
                    onClick={() => {
                      if (locked) { flashLockMsg('Requires Premium membership'); return }
                      setAvatarBg(c.hex === NONE_VALUE ? null : c.hex)
                    }}
                    aria-label={`Background ${c.label}${locked ? ' (premium)' : ''}`}
                    title={locked ? `${c.label} — premium only` : c.label}
                    style={{
                      width: '100%', aspectRatio: '1 / 1',
                      borderRadius: '50%',
                      backgroundColor: isNone ? 'transparent' : c.hex,
                      backgroundImage: isNone
                        ? 'linear-gradient(45deg, rgba(255,255,255,0.18) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.18) 75%, transparent 75%, transparent)'
                        : `radial-gradient(circle at 38% 35%, ${c.hex}ee 0%, ${c.hex}77 100%)`,
                      backgroundSize: isNone ? '8px 8px' : undefined,
                      border: isActive ? `2px solid #f0c040` : '1px solid rgba(255,255,255,0.18)',
                      boxShadow: isActive ? `0 0 10px rgba(240,192,64,0.35)` : 'none',
                      cursor: 'pointer',
                      padding: 0,
                      opacity: locked ? 0.55 : 1,
                      position: 'relative',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                    }}
                  >
                    {locked && <LockBadge />}
                  </button>
                )
              })}
            </div>

            {/* Border swatches */}
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', color: '#7a9bc4', letterSpacing: '0.14em', marginBottom: 6 }}>
              Border
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 12 }}>
              {AVATAR_PALETTE.map(c => {
                const isActive = avatarBorder === c.hex || (avatarBorder === null && c.hex === NONE_VALUE)
                const isNone = c.hex === NONE_VALUE
                const locked = !!c.premiumOnly && !isPremium
                return (
                  <button
                    key={`bd-${c.id}`}
                    type="button"
                    onClick={() => {
                      if (locked) { flashLockMsg('Requires Premium membership'); return }
                      setAvatarBorder(c.hex === NONE_VALUE ? null : c.hex)
                    }}
                    aria-label={`Border ${c.label}${locked ? ' (premium)' : ''}`}
                    title={locked ? `${c.label} — premium only` : c.label}
                    style={{
                      width: '100%', aspectRatio: '1 / 1',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(6,12,20,0.7)',
                      backgroundImage: isNone
                        ? 'linear-gradient(45deg, rgba(255,255,255,0.18) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.18) 75%, transparent 75%, transparent)'
                        : undefined,
                      backgroundSize: isNone ? '8px 8px' : undefined,
                      border: isNone ? '1px dashed rgba(255,255,255,0.4)' : `3px solid ${c.hex}`,
                      outline: isActive ? '2px solid #f0c040' : 'none',
                      outlineOffset: 2,
                      cursor: 'pointer',
                      padding: 0,
                      opacity: locked ? 0.55 : 1,
                      position: 'relative',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                    }}
                  >
                    {locked && <LockBadge />}
                  </button>
                )
              })}
            </div>

            {/* Lock toast + premium link slot */}
            <div style={{ minHeight: 22, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {avatarLockMsg ? (
                <p className="font-karla font-700" style={{
                  fontSize: '0.66rem', color: '#f0c040',
                  background: 'rgba(240,192,64,0.12)',
                  border: '1px solid rgba(240,192,64,0.35)',
                  borderRadius: 999, padding: '0.25rem 0.7rem',
                  letterSpacing: '0.04em',
                }}>
                  {avatarLockMsg}
                </p>
              ) : !isPremium ? (
                <BecomeCaptainButton label="Unlock more as a Captain" style={{ padding: '0.55rem 1rem', fontSize: '0.78rem' }} />
              ) : null}
            </div>

            <button
              onClick={handleFinish}
              disabled={finishPending}
              className="font-karla font-700 w-full"
              style={{
                padding: '0.75rem',
                background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.45)',
                borderRadius: 10, cursor: 'pointer',
                fontSize: '0.78rem', color: '#f0c040',
                opacity: finishPending ? 0.5 : 1,
              }}
            >
              {finishPending ? '…' : "Let's go →"}
            </button>
            <p className="font-karla font-400 text-center" style={{ fontSize: '0.58rem', color: '#3a3835', marginTop: '1rem' }}>
              Step {stepIndex} of {totalSteps} · you can change these later from Profile
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
