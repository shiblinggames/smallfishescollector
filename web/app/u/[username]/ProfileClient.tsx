'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { rarityFromVariant, RARITY_COLOR } from '@/lib/variants'
import { updateUsername, updateShowcase } from '@/app/u/actions'

interface CardVariant {
  id: number
  variant_name: string
  border_style: BorderStyle
  art_effect: ArtEffect
  drop_weight: number
  cards: { name: string; filename: string }
}

interface Props {
  profile: { id: string; username: string; username_changed: boolean }
  showcaseVariant: unknown
  isOwnProfile: boolean
  ownedCards: unknown[]
  stats: { packsOpened: number; completionPct: number }
}

export default function ProfileClient({ profile, showcaseVariant, isOwnProfile, ownedCards, stats }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const cv = showcaseVariant as CardVariant | null
  const cards = ownedCards as CardVariant[]

  // Username change
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [showUsernameForm, setShowUsernameForm] = useState(false)

  // Showcase picker
  const [showPicker, setShowPicker] = useState(false)

  function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault()
    setUsernameError('')
    startTransition(async () => {
      const result = await updateUsername(usernameInput)
      if (result.error) {
        setUsernameError(result.error)
      } else {
        router.push('/u/' + usernameInput.trim().toLowerCase())
      }
    })
  }

  function handlePickShowcase(variantId: number) {
    startTransition(async () => {
      await updateShowcase(variantId)
      setShowPicker(false)
      router.refresh()
    })
  }

  const rarity = cv ? rarityFromVariant(cv.variant_name, cv.drop_weight) : null
  const rarityColor = rarity ? (RARITY_COLOR[rarity] ?? '#8a8880') : '#8a8880'

  return (
    <div className="flex flex-col items-center gap-6 px-6 max-w-sm mx-auto">

      {/* Showcase card */}
      <div className="flex flex-col items-center gap-3">
        {cv ? (
          <div style={{ width: 160, height: 248 }}>
            <FishCard
              name={cv.cards.name}
              filename={cv.cards.filename}
              borderStyle={cv.border_style}
              artEffect={cv.art_effect}
              variantName={cv.variant_name}
              dropWeight={cv.drop_weight}
            />
          </div>
        ) : (
          <div style={{ width: 160, height: 248, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p className="font-karla font-300 text-[#4a4845] text-xs">No catch yet</p>
          </div>
        )}
        {cv && rarity && (
          <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.62rem', color: rarityColor }}>{rarity}</p>
        )}
      </div>

      {/* Username */}
      {showUsernameForm && isOwnProfile ? (
        <form onSubmit={handleUsernameSubmit} className="flex flex-col items-center gap-2 w-full">
          <input
            type="text"
            value={usernameInput}
            onChange={e => setUsernameInput(e.target.value)}
            placeholder="new username"
            className="sg-input font-karla font-600 tracking-[0.12em] text-center text-sm w-full"
            maxLength={20}
            autoFocus
            spellCheck={false}
          />
          {usernameError && <p className="font-karla font-300 text-red-400 text-xs">{usernameError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-gold text-xs" style={{ padding: '0.4rem 1rem' }}>
              {isPending ? '…' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowUsernameForm(false)} className="btn-ghost text-xs" style={{ padding: '0.4rem 1rem' }}>
              Cancel
            </button>
          </div>
          <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.6rem' }}>This can only be changed once.</p>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.1rem' }}>{profile.username}</p>
          {isOwnProfile && !profile.username_changed && (
            <button
              onClick={() => setShowUsernameForm(true)}
              className="font-karla font-300 text-[#6a6764] hover:text-[#8a8880] transition-colors"
              style={{ fontSize: '0.62rem' }}
            >
              Change username (once)
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-6">
        <div className="text-center">
          <p className="font-cinzel font-700 text-[#f0ede8] text-lg leading-none mb-1">{stats.packsOpened}</p>
          <p className="font-karla font-300 text-[0.62rem] uppercase tracking-[0.12em] text-[#8a8880]">Packs Opened</p>
        </div>
        <div className="w-px bg-[rgba(255,255,255,0.08)]" />
        <div className="text-center">
          <p className="font-cinzel font-700 text-[#f0ede8] text-lg leading-none mb-1">{stats.completionPct}%</p>
          <p className="font-karla font-300 text-[0.62rem] uppercase tracking-[0.12em] text-[#8a8880]">Completion</p>
        </div>
      </div>

      {/* Showcase picker */}
      {isOwnProfile && (
        <button
          onClick={() => setShowPicker(true)}
          className="font-karla font-300 text-[#6a6764] hover:text-[#8a8880] transition-colors"
          style={{ fontSize: '0.68rem', marginTop: '-0.5rem' }}
        >
          {cv ? 'Change showcase card' : 'Set showcase card'}
        </button>
      )}

      {/* Picker modal */}
      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => setShowPicker(false)}
        >
          <div
            className="w-full max-w-sm bg-black border border-[rgba(255,255,255,0.1)] rounded-t-2xl sm:rounded-2xl p-5 max-h-[70vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-4" style={{ fontSize: '0.65rem' }}>
              Choose Showcase Card
            </p>
            <div className="grid grid-cols-3 gap-2">
              {cards.map(card => {
                const r = rarityFromVariant(card.variant_name, card.drop_weight)
                const rc = RARITY_COLOR[r] ?? '#8a8880'
                return (
                  <button
                    key={card.id}
                    onClick={() => handlePickShowcase(card.id)}
                    disabled={isPending}
                    className="flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
                  >
                    <div style={{ width: 80, height: 124 }}>
                      <FishCard
                        name={card.cards.name}
                        filename={card.cards.filename}
                        borderStyle={card.border_style}
                        artEffect={card.art_effect}
                        variantName={card.variant_name}
                        dropWeight={card.drop_weight}
                      />
                    </div>
                    <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: rc }}>{r}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
