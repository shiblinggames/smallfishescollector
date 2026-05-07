'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { updateUsername, updateCharacterColor } from '@/app/u/actions'
import { markSetupSeen } from './welcomeActions'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import WelcomeModal from './WelcomeModal'

interface Props {
  currentColor: string
  unlockedColors: string[]
  showWelcomeAfter: boolean
  hasUsername: boolean
}

export default function SetupModal({ currentColor, unlockedColors, showWelcomeAfter, hasUsername }: Props) {
  const [step, setStep] = useState<'username' | 'color'>(hasUsername ? 'color' : 'username')
  const [done, setDone] = useState(false)

  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [usernamePending, startUsernameTx] = useTransition()

  const [selectedColor, setSelectedColor] = useState(currentColor)
  const [hintSkinId, setHintSkinId] = useState<string | null>(null)
  const [finishPending, startFinishTx] = useTransition()

  function handleUsernameNext(e: React.FormEvent) {
    e.preventDefault()
    const val = usernameInput.trim()
    if (!val) { goToColor(); return }
    setUsernameError('')
    startUsernameTx(async () => {
      const res = await updateUsername(val)
      if ('error' in res && res.error) { setUsernameError(res.error); return }
      goToColor()
    })
  }

  function goToColor() {
    setStep('color')
  }

  function handleFinish() {
    startFinishTx(async () => {
      if (selectedColor !== currentColor) await updateCharacterColor(selectedColor)
      await markSetupSeen()
      setDone(true)
    })
  }

  if (done && showWelcomeAfter) return <WelcomeModal />
  if (done) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <AnimatePresence mode="wait">
        {step === 'username' ? (
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
              What should we call you?
            </p>
            <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#6a6764', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Pick a username for your public profile. You can only set this once, so choose well.
            </p>

            <form onSubmit={handleUsernameNext}>
              <input
                type="text"
                value={usernameInput}
                onChange={e => { setUsernameInput(e.target.value); setUsernameError('') }}
                placeholder="your_name"
                className="sg-input font-karla font-600 tracking-[0.06em] w-full"
                style={{ fontSize: '1rem', marginBottom: usernameError ? 6 : '1.25rem' }}
                maxLength={20}
                autoFocus
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
              />
              {usernameError && (
                <p className="font-karla font-400" style={{ fontSize: '0.68rem', color: '#f87171', marginBottom: '1rem' }}>{usernameError}</p>
              )}
              <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#4a4845', marginBottom: '1.25rem' }}>
                3–20 characters · letters, numbers, underscores
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={goToColor}
                  className="font-karla font-600"
                  style={{
                    flex: 1, padding: '0.7rem',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, cursor: 'pointer',
                    fontSize: '0.75rem', color: '#6a6764',
                  }}
                >
                  Skip
                </button>
                <button
                  type="submit"
                  disabled={usernamePending || !usernameInput.trim()}
                  className="font-karla font-700"
                  style={{
                    flex: 2, padding: '0.7rem',
                    background: usernameInput.trim() ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${usernameInput.trim() ? 'rgba(96,165,250,0.45)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 10, cursor: usernameInput.trim() ? 'pointer' : 'default',
                    fontSize: '0.75rem', color: usernameInput.trim() ? '#60a5fa' : '#4a4845',
                    opacity: usernamePending ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {usernamePending ? '…' : 'Continue →'}
                </button>
              </div>
            </form>

            <p className="font-karla font-400 text-center" style={{ fontSize: '0.58rem', color: '#3a3835', marginTop: '1.25rem' }}>Step 1 of 2</p>
          </motion.div>

        ) : (
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
              Choose your fisher's color. More can be earned as you play.
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
                      backgroundSize: '280% auto', backgroundPosition: 'center 92%',
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
              onClick={handleFinish}
              disabled={finishPending}
              className="font-karla font-700 w-full"
              style={{
                padding: '0.75rem',
                background: 'rgba(200,168,112,0.15)', border: '1px solid rgba(200,168,112,0.45)',
                borderRadius: 10, cursor: 'pointer',
                fontSize: '0.75rem', color: '#c8a870',
                opacity: finishPending ? 0.5 : 1,
              }}
            >
              {finishPending ? '…' : "Let's go →"}
            </button>

            <p className="font-karla font-400 text-center" style={{ fontSize: '0.58rem', color: '#3a3835', marginTop: '1.25rem' }}>{hasUsername ? 'Step 1 of 1' : 'Step 2 of 2'}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
