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
}

export default function ProfileSection({ username: initialUsername, usernameChanged: initialChanged, showcaseVariantIds: initialShowcase, pickerCards }: Props) {
  const [username, setUsername] = useState(initialUsername)
  const [usernameChanged, setUsernameChanged] = useState(initialChanged)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [showUsernameForm, setShowUsernameForm] = useState(false)
  const [selectedShowcase, setSelectedShowcase] = useState<number[]>(initialShowcase)
  const [pickerOpen, setPickerOpen] = useState(false)
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
      setPickerOpen(false)
    })
  }

  return (
    <div>
      <p className="sg-eyebrow mb-3" style={{ color: '#9a9488' }}>My Profile</p>

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>

        {/* Username row */}
        <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{username}</p>
            <Link href={`/u/${username}`} className="font-karla text-[#6a6764] hover:text-[#f0c040] transition-colors" style={{ fontSize: '0.65rem' }}>
              View public profile →
            </Link>
          </div>
          {!usernameChanged && !showUsernameForm && (
            <button
              onClick={() => setShowUsernameForm(true)}
              className="font-karla font-600 uppercase tracking-[0.10em] text-[#6a6764] hover:text-[#f0ede8] transition-colors"
              style={{ fontSize: '0.6rem' }}
            >
              Change Name
            </button>
          )}
        </div>

        {/* Username form */}
        {showUsernameForm && (
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
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
                <button type="submit" disabled={pending} className="btn-gold text-xs" style={{ padding: '0.4rem 1rem' }}>
                  {pending ? '…' : 'Save'}
                </button>
                <button type="button" onClick={() => { setShowUsernameForm(false); setUsernameError('') }} className="btn-ghost text-xs" style={{ padding: '0.4rem 1rem' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Showcase row */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <p className="font-karla font-600 uppercase tracking-[0.10em] text-[#6a6764]" style={{ fontSize: '0.6rem' }}>
              Showcase · {selectedShowcase.length} / 5
            </p>
            <div className="flex items-center gap-3">
              {selectedShowcase.length > 0 && !pickerOpen && (
                <button
                  onClick={() => { setSelectedShowcase([]); startTransition(async () => { await updateShowcase([]) }) }}
                  className="font-karla font-600 uppercase tracking-[0.10em] text-[#6a6764] hover:text-[#f87171] transition-colors"
                  style={{ fontSize: '0.6rem' }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setPickerOpen(v => !v)}
                className="font-karla font-600 uppercase tracking-[0.10em] text-[#f0c040] hover:opacity-80 transition-opacity"
                style={{ fontSize: '0.6rem' }}
              >
                {pickerOpen ? 'Done' : 'Edit'}
              </button>
            </div>
          </div>

          {/* Picker save button */}
          {pickerOpen && (
            <div className="mb-4">
              <p className="font-karla font-300 text-[#8a8880] mb-3" style={{ fontSize: '0.72rem' }}>
                Tap cards to select your top 5 showcase catches
              </p>
              {pickerCards.length === 0 ? (
                <p className="font-karla font-300 text-[#6a6764] text-sm">Open some packs first!</p>
              ) : (
                <div className="flex flex-wrap justify-center gap-4 mb-4">
                  {pickerCards.map(card => {
                    const selectedIdx = selectedShowcase.indexOf(card.variantId)
                    const isSelected = selectedIdx !== -1
                    const isDisabled = !isSelected && selectedShowcase.length >= 5
                    return (
                      <div key={card.variantId} className="relative">
                        <div
                          onClick={() => isDisabled ? undefined : toggleCard(card.variantId)}
                          className="transition-all duration-200"
                          style={{
                            cursor: isDisabled ? 'default' : 'pointer',
                            opacity: isDisabled ? 0.25 : 1,
                            outline: isSelected ? '2px solid #f0c040' : 'none',
                            outlineOffset: 5,
                            borderRadius: '50%',
                          }}
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
              <button
                onClick={handleSaveShowcase}
                disabled={pending}
                className="btn-gold w-full disabled:opacity-30"
                style={{ fontSize: '0.75rem' }}
              >
                {pending ? 'Saving…' : 'Save Showcase'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
