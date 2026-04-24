'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { updateUsername, updateShowcase } from '@/app/u/actions'

export interface PickerCard {
  variantId: number
  variantName: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  dropWeight: number
  name: string
  filename: string
}

interface Props {
  username: string
  usernameChanged: boolean
  showcaseVariantIds: number[]
  pickerCards: PickerCard[]
  isPremium: boolean
}

export default function ProfileSection({ username: initialUsername, usernameChanged: initialChanged, showcaseVariantIds: initialShowcase, pickerCards, isPremium }: Props) {
  const [username, setUsername] = useState(initialUsername)
  const [usernameChanged, setUsernameChanged] = useState(initialChanged)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [showUsernameForm, setShowUsernameForm] = useState(false)
  const [selectedShowcase, setSelectedShowcase] = useState<number[]>(initialShowcase)
  const [modalOpen, setModalOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function toggleCard(variantId: number) {
    setSelectedShowcase(prev => {
      if (prev.includes(variantId)) return prev.filter(id => id !== variantId)
      if (prev.length >= 5) return prev
      return [...prev, variantId]
    })
  }

  function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault()
    setUsernameError('')
    startTransition(async () => {
      const result = await updateUsername(usernameInput)
      if (result.error) {
        setUsernameError(result.error)
      } else {
        setUsername(usernameInput.trim().toLowerCase())
        setUsernameChanged(true)
        setShowUsernameForm(false)
        setUsernameInput('')
      }
    })
  }

  function handleSaveShowcase() {
    startTransition(async () => {
      await updateShowcase(selectedShowcase)
      setModalOpen(false)
    })
  }

  return (
    <>
      <div>
        <p className="sg-eyebrow mb-3" style={{ color: '#9a9488' }}>My Profile</p>

        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 14, overflow: 'hidden' }}>

          {/* Username + badges */}
          <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.11)' }}>
            <div className="flex flex-col gap-1.5">
              <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{username}</p>
              <div className="flex items-center gap-2">
                {isPremium && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.3)' }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#f0c040' }}>Member</span>
                  </div>
                )}
                <Link href={`/u/${username}`} className="font-karla text-[#6a6764] hover:text-[#f0c040] transition-colors" style={{ fontSize: '0.65rem' }}>
                  View profile →
                </Link>
              </div>
            </div>
            {!usernameChanged && !showUsernameForm && (
              <button
                onClick={() => setShowUsernameForm(true)}
                className="font-karla font-600 uppercase tracking-[0.10em] text-[#6a6764] hover:text-[#f0ede8] transition-colors shrink-0"
                style={{ fontSize: '0.6rem' }}
              >
                Change Name
              </button>
            )}
          </div>

          {/* Username form */}
          {showUsernameForm && (
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.11)' }}>
              <form onSubmit={handleSaveUsername} className="flex flex-col gap-2">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  placeholder="new username"
                  className="sg-input font-karla font-600 tracking-[0.08em] text-sm"
                  maxLength={20}
                  autoFocus
                  spellCheck={false}
                />
                {usernameError && <p className="font-karla font-300 text-red-400" style={{ fontSize: '0.7rem' }}>{usernameError}</p>}
                <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.6rem' }}>
                  3–20 characters · letters, numbers, underscores · one time only
                </p>
                <div className="flex gap-2">
                  <button type="submit" disabled={pending} className="btn-ghost text-xs" style={{ padding: '0.4rem 1rem' }}>
                    {pending ? '…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => { setShowUsernameForm(false); setUsernameError('') }} className="btn-ghost text-xs" style={{ padding: '0.4rem 1rem' }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Showcase section */}
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.95rem' }}>Showcase</p>
                <p className="font-karla font-600 text-[#6a6764]" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                  {selectedShowcase.length > 0 ? `${selectedShowcase.length} / 5 fish on your public profile` : 'Shown on your public profile'}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(true)}
                className="font-karla font-700 uppercase tracking-[0.12em] shrink-0"
                style={{
                  fontSize: '0.68rem', color: '#f0c040',
                  padding: '0.4rem 0.9rem', borderRadius: '2rem',
                  border: '1px solid rgba(240,192,64,0.35)',
                  background: 'rgba(240,192,64,0.08)',
                }}
              >
                Edit
              </button>
            </div>

            {(() => {
              const showcaseCards = selectedShowcase
                .map(id => pickerCards.find(c => c.variantId === id))
                .filter((c): c is PickerCard => !!c)
              return showcaseCards.length > 0 ? (
                <div className="flex gap-2 justify-center">
                  {showcaseCards.map(card => (
                    <div key={card.variantId} style={{ width: 64, height: 64, overflow: 'hidden', flexShrink: 0, borderRadius: '50%' }}>
                      <div style={{ transform: 'scale(0.457)', transformOrigin: 'top left', width: 140 }}>
                        <FishCard
                          name={card.name}
                          filename={card.filename}
                          borderStyle={card.borderStyle}
                          artEffect={card.artEffect}
                          variantName={card.variantName}
                          dropWeight={card.dropWeight}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-karla font-600 text-center" style={{ fontSize: '0.78rem', color: '#4a4845', padding: '0.75rem 0' }}>
                  No fish selected — tap Edit to choose your highlights
                </p>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Showcase modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.94)', backdropFilter: 'blur(8px)' }}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="max-w-lg w-full relative max-h-[85vh] flex flex-col"
            style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 font-karla font-300 text-[#a0a09a] hover:text-[#f0ede8] text-xs uppercase tracking-widest transition-colors"
            >
              Close
            </button>

            <div className="overflow-y-auto p-8 flex-1">
              <p className="sg-eyebrow text-center mb-1">Profile</p>
              <p className="font-cinzel font-700 text-[#f0ede8] text-center text-xl mb-6">{username}</p>

              <div>
                <p className="font-karla font-300 text-[#a0a09a] text-center text-xs tracking-wide mb-2">
                  Tap to select your top 5 showcase catches
                </p>
                <p className="font-karla font-300 text-center mb-8" style={{ fontSize: '0.7rem', color: selectedShowcase.length === 5 ? '#f0c040' : '#6a6764' }}>
                  {selectedShowcase.length} / 5 selected
                  {selectedShowcase.length > 0 && (
                    <button onClick={() => setSelectedShowcase([])} className="ml-3 text-[#6a6764] hover:text-[#a0a09a] transition-colors">
                      Clear
                    </button>
                  )}
                </p>

                {pickerCards.length === 0 ? (
                  <p className="font-karla font-300 text-[#6a6764] text-xs text-center">Open some packs first!</p>
                ) : (
                  <div className="flex flex-wrap justify-center gap-6">
                    {pickerCards.map(card => {
                      const selectedIdx = selectedShowcase.indexOf(card.variantId)
                      const isSelected = selectedIdx !== -1
                      return (
                        <div key={card.variantId} className="relative">
                          <div
                            className={`rounded-full transition-all duration-200 ${!isSelected && selectedShowcase.length >= 5 ? 'opacity-25' : 'cursor-pointer'}`}
                            style={isSelected ? { outline: '2px solid #f0c040', outlineOffset: '5px' } : {}}
                            onClick={() => (!isSelected && selectedShowcase.length >= 5) ? undefined : toggleCard(card.variantId)}
                          >
                            <FishCard
                              name={card.name}
                              filename={card.filename}
                              borderStyle={card.borderStyle}
                              artEffect={card.artEffect}
                              variantName={card.variantName}
                              dropWeight={card.dropWeight}
                            />
                          </div>
                          {isSelected && (
                            <div className="absolute top-0 right-0 w-5 h-5 rounded-full flex items-center justify-center pointer-events-none" style={{ background: '#f0c040' }}>
                              <span className="font-karla font-700 text-black" style={{ fontSize: '0.6rem' }}>{selectedIdx + 1}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.13)', padding: '1rem 2rem' }}>
              <button onClick={handleSaveShowcase} disabled={pending} className="btn-ghost w-full disabled:opacity-30">
                {pending ? 'Saving…' : 'Save Showcase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
