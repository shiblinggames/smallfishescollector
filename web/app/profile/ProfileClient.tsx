'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { updateUsername, updateShowcase } from '@/app/u/actions'

type PickerCard = {
  variantId: number
  variantName: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  dropWeight: number
  name: string
  filename: string
}

interface Props {
  email: string
  username: string
  usernameChanged: boolean
  showcaseVariantIds: number[]
  pickerCards: PickerCard[]
  isPremium: boolean
  level: number
  uniqueSpecies: number
  shipName: string
  shipColor: string
}

const AVATAR_COLORS = ['#0e7490', '#0d9488', '#7c3aed', '#b45309', '#0369a1', '#be185d']

function avatarColor(str: string) {
  let h = 0
  for (const c of str) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function ProfileClient({
  email,
  username: initialUsername,
  usernameChanged: initialChanged,
  showcaseVariantIds: initialShowcase,
  pickerCards,
  isPremium,
  level,
  uniqueSpecies,
  shipName,
  shipColor,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [username, setUsername] = useState(initialUsername)
  const [usernameChanged, setUsernameChanged] = useState(initialChanged)
  const [showUsernameForm, setShowUsernameForm] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')

  const [selectedShowcase, setSelectedShowcase] = useState<number[]>(initialShowcase)
  const [modalOpen, setModalOpen] = useState(false)

  const color = avatarColor(username || email)
  const initial = (username || email).slice(0, 1).toUpperCase()

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

  function toggleCard(id: number) {
    setSelectedShowcase(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const showcaseCards = selectedShowcase
    .map(id => pickerCards.find(c => c.variantId === id))
    .filter((c): c is PickerCard => !!c)

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 1.25rem 3rem' }}>

      {/* ── Identity card ── */}
      <div style={{
        background: 'rgba(4,10,20,0.85)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 20,
        padding: '2rem 1.5rem 1.5rem',
        marginBottom: '0.75rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', gap: 10,
        position: 'relative',
      }}>
        {/* Ocean depth glow behind avatar */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 180, height: 120, borderRadius: '50%',
          background: `radial-gradient(ellipse, ${color}22 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        {/* Avatar circle */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: `radial-gradient(circle at 38% 35%, ${color}ee 0%, ${color}77 100%)`,
          border: `2px solid ${color}55`,
          boxShadow: `0 0 32px ${color}33, inset 0 1px 0 rgba(255,255,255,0.15)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', zIndex: 1,
        }}>
          <span className="font-cinzel font-700" style={{ fontSize: '2rem', color: '#f0ede8', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            {initial}
          </span>
        </div>

        {/* Name + edit */}
        {showUsernameForm ? (
          <form onSubmit={handleSaveUsername} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', zIndex: 1 }}>
            <input
              type="text"
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              placeholder="new username"
              className="sg-input font-karla font-600 tracking-[0.08em] text-sm text-center"
              maxLength={20}
              autoFocus
              spellCheck={false}
            />
            {usernameError && (
              <p className="font-karla font-300 text-red-400 text-center" style={{ fontSize: '0.68rem' }}>{usernameError}</p>
            )}
            <p className="font-karla font-300 text-center" style={{ fontSize: '0.56rem', color: '#4a4845' }}>
              3–20 chars · letters, numbers, underscores · can only be changed once
            </p>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              <button type="submit" disabled={pending} className="btn-ghost" style={{ fontSize: '0.62rem', padding: '0.35rem 1.1rem' }}>
                {pending ? '…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setShowUsernameForm(false); setUsernameError('') }} className="btn-ghost" style={{ fontSize: '0.62rem', padding: '0.35rem 1.1rem' }}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8' }}>{username}</p>
            {!usernameChanged && (
              <button
                onClick={() => setShowUsernameForm(true)}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 7, padding: '0.22rem 0.55rem', cursor: 'pointer',
                }}
              >
                <span className="font-karla font-600 uppercase" style={{ fontSize: '0.52rem', color: '#6a6764', letterSpacing: '0.12em' }}>Rename</span>
              </button>
            )}
          </div>
        )}

        {/* Email */}
        <p className="font-karla font-400" style={{ fontSize: '0.65rem', color: '#4a4845', position: 'relative', zIndex: 1 }}>{email}</p>

        {/* Badges row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          {isPremium && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0.22rem 0.7rem', borderRadius: '2rem',
              background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.3)',
            }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', color: '#f0c040', letterSpacing: '0.12em' }}>Member</span>
            </div>
          )}
          <Link
            href={`/u/${username}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0.22rem 0.7rem', borderRadius: '2rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              textDecoration: 'none',
            }}
          >
            <span className="font-karla font-600 uppercase" style={{ fontSize: '0.52rem', color: '#6a6764', letterSpacing: '0.1em' }}>Public Profile ↗</span>
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: '0.75rem' }}>
        {[
          { value: String(level), label: 'Fishing Level', color: '#60a5fa' },
          { value: String(uniqueSpecies), label: 'Species Found', color: '#34d399' },
          { value: shipName, label: 'Vessel', color: shipColor },
        ].map(({ value, label, color: c }) => (
          <div key={label} style={{
            background: 'rgba(4,10,20,0.85)',
            border: `1px solid ${c}22`,
            borderRadius: 14, padding: '0.9rem 0.5rem',
            textAlign: 'center',
          }}>
            <p className="font-cinzel font-700" style={{
              fontSize: value.length > 7 ? '0.78rem' : '1.25rem',
              color: c, lineHeight: 1.15,
            }}>
              {value}
            </p>
            <p className="font-karla font-600 uppercase" style={{ fontSize: '0.48rem', color: '#3a3835', letterSpacing: '0.12em', marginTop: 5 }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* ── Showcase ── */}
      <div style={{
        background: 'rgba(4,10,20,0.85)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 16, padding: '1.1rem 1.25rem',
        marginBottom: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
          <div>
            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f0ede8' }}>Showcase</p>
            <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#4a4845', marginTop: 2 }}>
              {showcaseCards.length > 0 ? `${showcaseCards.length} / 5 fish on your public profile` : 'Pin your best catches to your profile'}
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              padding: '0.4rem 0.9rem', borderRadius: '2rem',
              background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.3)',
              cursor: 'pointer',
            }}
          >
            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', color: '#f0c040', letterSpacing: '0.12em' }}>
              {showcaseCards.length > 0 ? 'Edit' : '+ Add'}
            </span>
          </button>
        </div>

        {showcaseCards.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {showcaseCards.map(card => (
              <div key={card.variantId} style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
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
          <p className="font-karla font-600 text-center" style={{ fontSize: '0.7rem', color: '#3a3835', padding: '0.5rem 0' }}>
            No fish selected
          </p>
        )}
      </div>

      {/* ── Quick links ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '0.75rem' }}>
        {[
          { href: '/achievements', label: 'Achievements', icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4V4h16v5h-2"/><path d="M6 4v5a6 6 0 0 0 12 0V4"/>
              <line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/>
            </svg>
          )},
          { href: '/social', label: 'Crew & Friends', icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/>
            </svg>
          )},
          { href: '/leaderboard', label: 'Leaderboard', icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="14" width="5" height="7" rx="1"/>
              <rect x="9.5" y="9" width="5" height="12" rx="1"/>
              <rect x="17" y="4" width="5" height="17" rx="1"/>
            </svg>
          )},
        ].map(({ href, label, icon }) => (
          <Link key={href} href={href} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            background: 'rgba(4,10,20,0.85)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12, textDecoration: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#4a4845' }}>{icon}</span>
              <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{label}</span>
            </div>
            <span style={{ color: '#3a3835', fontSize: '0.9rem' }}>›</span>
          </Link>
        ))}
      </div>

      {/* ── Sign out ── */}
      <button
        onClick={signOut}
        style={{
          width: '100%', padding: '0.8rem',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span className="font-karla font-600 uppercase" style={{ fontSize: '0.65rem', color: '#4a4845', letterSpacing: '0.14em' }}>Sign Out</span>
      </button>

      {/* ── Showcase picker modal ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full sm:max-w-lg relative flex flex-col"
            style={{
              background: '#060c14',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '18px 18px 0 0',
              maxHeight: '85vh',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ padding: '1.25rem 1.25rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0ede8' }}>Pick Showcase</p>
                <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#4a4845', marginTop: 2 }}>
                  {selectedShowcase.length} / 5 selected
                  {selectedShowcase.length > 0 && (
                    <button onClick={() => setSelectedShowcase([])} style={{ marginLeft: 8, color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.62rem', fontFamily: 'inherit' }}>
                      Clear all
                    </button>
                  )}
                </p>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ color: '#4a4845', fontSize: '1.2rem', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {/* Card grid */}
            <div style={{ overflowY: 'auto', padding: '1rem 1.25rem', flex: 1 }}>
              {pickerCards.length === 0 ? (
                <p className="font-karla font-300 text-center" style={{ fontSize: '0.72rem', color: '#4a4845', padding: '2rem 0' }}>
                  Open some packs first!
                </p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
                  {pickerCards.map(card => {
                    const idx = selectedShowcase.indexOf(card.variantId)
                    const isSelected = idx !== -1
                    const disabled = !isSelected && selectedShowcase.length >= 5
                    return (
                      <div key={card.variantId} style={{ position: 'relative', opacity: disabled ? 0.25 : 1 }}>
                        <div
                          style={isSelected ? { outline: '2px solid #f0c040', outlineOffset: 5, borderRadius: 4, cursor: 'pointer' } : { cursor: disabled ? 'default' : 'pointer' }}
                          onClick={() => !disabled && toggleCard(card.variantId)}
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
                          <div style={{ position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderRadius: '50%', background: '#f0c040', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: '#000' }}>{idx + 1}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.09)', flexShrink: 0 }}>
              <button onClick={handleSaveShowcase} disabled={pending} className="btn-ghost w-full" style={{ opacity: pending ? 0.5 : 1 }}>
                {pending ? 'Saving…' : 'Save Showcase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
