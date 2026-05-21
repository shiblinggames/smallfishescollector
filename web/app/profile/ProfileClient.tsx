'use client'

import { useEffect, useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { updateUsername, updateShowcase, updateCharacterColor, updateAvatarColors, purchaseCharacterColor, purchaseAvatarSpecial } from '@/app/u/actions'
import { AVATAR_PALETTE, AVATAR_BORDER_EXTRAS, AVATAR_SPECIALS, DEFAULT_AVATAR_BG_COLOR, DEFAULT_AVATAR_BORDER_COLOR, NONE_VALUE } from '@/lib/avatarColors'
import { equipBadge, unequipBadge } from '@/app/achievements/badgeActions'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import CharacterAvatar from '@/components/CharacterAvatar'
import { getBoat, boatGlowClass } from '@/lib/boats'
import { getHat } from '@/lib/hats'
import { BADGES, BADGE_MAP, BADGE_SLOT_POSITIONS, type BadgeFrame } from '@/lib/badges'
import { getRod, rodGlowClass } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getHook, hookGlowClass } from '@/lib/hooks'
import { getShip } from '@/lib/ships'
import { getShipSkin } from '@/lib/shipSkins'
import { SPECIAL_ITEMS } from '@/lib/specialItems'

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
  expeditionLevel: number
  navigatorTitle: string
  uniqueSpecies: number
  shipTier: number
  shipName: string
  shipColor: string
  customShipName: string | null
  equippedShipSkin: string | null
  rodTier: number
  reelTier: number
  hookTier: number
  equippedSpecialId: string | null
  rarestFish: { id: number; name: string; bite_rarity: number; habitat?: string }[]
  ancientTrophies: { id: number; name: string }[]
  equippedBoat: string | null
  equippedHat: string | null
  characterColor: string
  unlockedColors: string[]
  doubloons: number
  gems: number
  equippedBadges: string[]
  unlockedBadges: string[]
  avatarBgColor: string | null
  avatarBorderColor: string | null
  unlockedAvatarSpecials: string[]
}

const AVATAR_COLORS = ['#0e7490', '#0d9488', '#7c3aed', '#b45309', '#0369a1', '#be185d']
function avatarColor(str: string) {
  let h = 0
  for (const c of str) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function fishImageUrl(name: string) {
  return `/fish/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`
}

const RARITY_COLOR: Record<number, string> = {
  1: '#94a3b8', 2: '#4ade80', 3: '#60a5fa', 4: '#c084fc', 5: '#f59e0b',
}
const RARITY_LABEL: Record<number, string> = {
  1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary',
}

const CARD_W = 140
function getOff(idx: number, active: number, total: number) {
  let d = idx - active
  if (d > total / 2) d -= total
  if (d < -total / 2) d += total
  return d
}
function cardTransform(off: number): { tx: number; tz: number; ry: number; scale: number; brightness: number; zIdx: number } {
  const abs = Math.abs(off)
  const sign = Math.sign(off)
  if (off === 0)  return { tx: 0,         tz: 50,  ry: 0,           scale: 1.00, brightness: 1.0,  zIdx: 10 }
  if (abs === 1)  return { tx: sign * 90,  tz: -15, ry: -sign * 22,  scale: 0.80, brightness: 0.55, zIdx: 5  }
  return            { tx: sign * 148, tz: -45, ry: -sign * 36,  scale: 0.60, brightness: 0.35, zIdx: 2  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.78rem', color: '#8a8782', marginBottom: 14 }}>
      {children}
    </p>
  )
}

function ShowcaseCarousel({ cards, onEdit }: { cards: PickerCard[]; onEdit: () => void }) {
  const [active, setActive] = useState(0)
  const total = cards.length
  const touchStartX = useRef<number | null>(null)
  function prev() { setActive(i => (i - 1 + total) % total) }
  function next() { setActive(i => (i + 1) % total) }

  return (
    <div>
      <div
        style={{ position: 'relative', height: 210, perspective: '800px', overflow: 'visible' }}
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (touchStartX.current === null || total <= 1) return
          const dx = e.changedTouches[0].clientX - touchStartX.current
          if (dx > 40) prev(); else if (dx < -40) next()
          touchStartX.current = null
        }}
      >
        {cards.map((card, idx) => {
          const off = getOff(idx, active, total)
          if (Math.abs(off) > 2) return null
          const { tx, tz, ry, scale, brightness, zIdx } = cardTransform(off)
          return (
            <div
              key={card.variantId}
              onClick={() => off !== 0 && setActive(idx)}
              style={{
                position: 'absolute', left: '50%', top: 0, marginLeft: -CARD_W / 2,
                transform: `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`,
                transition: 'transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.38s',
                filter: `brightness(${brightness})`,
                zIndex: zIdx,
                cursor: off !== 0 ? 'pointer' : 'default',
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
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f0ede8', minHeight: '1.2em' }}>
          {cards[active]?.name}
        </p>
        {total > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={prev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7a7775', fontSize: '1.2rem', lineHeight: 1, padding: '0 2px' }}>‹</button>
            <div style={{ display: 'flex', gap: 5 }}>
              {cards.map((_, i) => (
                <button key={i} onClick={() => setActive(i)} style={{
                  width: i === active ? 18 : 6, height: 6, borderRadius: 3,
                  background: i === active ? '#f0c040' : 'rgba(255,255,255,0.2)',
                  border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'width 0.22s, background 0.22s',
                }} />
              ))}
            </div>
            <button onClick={next} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7a7775', fontSize: '1.2rem', lineHeight: 1, padding: '0 2px' }}>›</button>
          </div>
        )}
        <button
          onClick={onEdit}
          style={{
            marginTop: 4,
            padding: '0.32rem 0.9rem', borderRadius: '2rem',
            background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.28)',
            cursor: 'pointer',
          }}
        >
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', color: '#f0c040', letterSpacing: '0.12em' }}>
            Edit Showcase
          </span>
        </button>
      </div>
    </div>
  )
}

export default function ProfileClient({
  email,
  username: initialUsername,
  usernameChanged: initialChanged,
  showcaseVariantIds: initialShowcase,
  pickerCards,
  isPremium,
  level,
  expeditionLevel,
  navigatorTitle,
  uniqueSpecies,
  shipTier,
  shipName,
  shipColor,
  customShipName,
  equippedShipSkin,
  rodTier,
  reelTier,
  hookTier,
  equippedSpecialId,
  rarestFish,
  ancientTrophies,
  equippedBoat,
  equippedHat,
  characterColor: initialCharacterColor,
  unlockedColors: initialUnlockedColors,
  doubloons: initialDoubloons,
  gems: initialGems,
  equippedBadges: initialEquippedBadges,
  unlockedBadges,
  avatarBgColor: initialAvatarBg,
  avatarBorderColor: initialAvatarBorder,
  unlockedAvatarSpecials: initialUnlockedSpecials,
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
  const [characterColor, setCharacterColor] = useState(initialCharacterColor)
  const [colorSaving, setColorSaving] = useState(false)
  const [unlockedColors, setUnlockedColors] = useState<string[]>(initialUnlockedColors)
  const [unlockedSpecials, setUnlockedSpecials] = useState<string[]>(initialUnlockedSpecials)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [gems, setGems] = useState(initialGems)
  const [purchasePrompt, setPurchasePrompt] = useState<
    | { kind: 'skin';    id: string; name: string; price: number; currency: 'doubloons' | 'gems' }
    | { kind: 'special'; id: string; name: string; price: number; currency: 'gems' }
    | null
  >(null)
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [equippedBadges, setEquippedBadges] = useState<string[]>(initialEquippedBadges)
  const [badgePickerOpen, setBadgePickerOpen] = useState(false)
  // Avatar colors — bg + border, saved per-user. null = use defaults.
  const [avatarBg, setAvatarBg] = useState<string | null>(initialAvatarBg)
  const [avatarBorder, setAvatarBorder] = useState<string | null>(initialAvatarBorder)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [avatarSaving, setAvatarSaving] = useState(false)
  // LOCAL-ONLY page-background preview (test). Not persisted, not gated, not
  // shown to other users — just lets us eyeball the fishing zone paintings as
  // a profile page backdrop before committing to a saved `profile_bg` column.
  type PreviewBg = { label: string; src?: string; scrim?: string }
  // Default darkening scrim for legibility. Abyss + Deep override it with a
  // lighter one — those paintings are dark / their colour lives in the sky,
  // so a heavy scrim crushed the texture and warm tones into the page bg.
  const DEFAULT_SCRIM = 'linear-gradient(to bottom, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.74) 100%)'
  // Every image is anchored to the top (objectPosition 'center top') so each
  // zone's sky/horizon shows rather than a centre crop landing on plain water.
  const [previewBg, setPreviewBg] = useState<PreviewBg | null>(null)
  const PREVIEW_BGS: PreviewBg[] = [
    { label: 'None' },
    { label: 'Shallows',    src: '/shallows.jpg' },
    { label: 'Open Waters', src: '/openwaters.jpg' },
    { label: 'Deep',        src: '/deep.jpg', scrim: 'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.48) 50%, rgba(0,0,0,0.72) 100%)' },
    { label: 'Abyss',       src: '/abyss.jpg', scrim: 'linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.24) 50%, rgba(0,0,0,0.46) 100%)' },
  ]
  // Scroll-linked pan: these zone paintings are very tall (~1:4), so instead
  // of a fixed crop we pan the cover image's vertical focal point from the top
  // (sky) to the bottom (deep water) as you scroll the page — revealing the
  // whole painting, and getting naturally darker since the art darkens with
  // depth. Driven by a direct ref write in a rAF-throttled scroll handler —
  // NOT React state — so this big component doesn't re-render every scroll tick.
  const bgImgRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!previewBg?.src) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = bgImgRef.current
        if (!el) return
        const max = document.documentElement.scrollHeight - window.innerHeight
        const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
        el.style.objectPosition = `center ${p * 100}%`
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [previewBg])
  // The hero avatar is fixed-px, so on a big desktop page it reads small
  // (and its proportional ring looks like a hairline). Bigger on >=md
  // where there's room — the Aurora ring scales with size automatically.
  // Defaults to the mobile size for SSR so there's no hydration mismatch.
  const [avatarSize, setAvatarSize] = useState(132)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const apply = () => setAvatarSize(mq.matches ? 176 : 132)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  // Transient message shown when a premium-locked swatch is tapped.
  // Stays up long enough to read comfortably — was 2000ms, felt too quick.
  const [avatarLockMsg, setAvatarLockMsg] = useState<string | null>(null)
  function flashLockMsg(msg: string) {
    setAvatarLockMsg(msg)
    setTimeout(() => setAvatarLockMsg(prev => (prev === msg ? null : prev)), 4000)
  }
  const [badgeSaving, setBadgeSaving] = useState(false)
  const [selectedBadgeSlot, setSelectedBadgeSlot] = useState<0 | 1 | 2 | null>(null)
  useEffect(() => { if (!badgePickerOpen) setSelectedBadgeSlot(null) }, [badgePickerOpen])

  const color = avatarColor(username || email)

  const rod = getRod(rodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const ship = getShip(shipTier)
  const shipSkinDef = equippedShipSkin ? getShipSkin(equippedShipSkin) : null
  const charSprites = getCharacterSprites(characterColor)
  const equippedSpecial = equippedSpecialId ? SPECIAL_ITEMS.find(s => s.id === equippedSpecialId) ?? null : null

  const showcaseCards = selectedShowcase
    .map(id => pickerCards.find(c => c.variantId === id))
    .filter((c): c is PickerCard => !!c)

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

  async function handleBadgeClick(badgeId: string) {
    if (badgeSaving || !unlockedBadges.includes(badgeId)) return
    const padded = [...equippedBadges]
    while (padded.length < 3) padded.push('')
    const currentSlot = padded.indexOf(badgeId)
    const targetSlot = selectedBadgeSlot
    setBadgeSaving(true)
    if (targetSlot !== null) {
      if (padded[targetSlot] === badgeId) {
        const next = [...padded]; next[targetSlot] = ''
        setEquippedBadges(next)
        await unequipBadge(targetSlot)
      } else {
        const next = padded.map((b, i) => {
          if (i === targetSlot) return badgeId
          if (b === badgeId) return ''
          return b
        })
        setEquippedBadges(next)
        await equipBadge(badgeId, targetSlot)
      }
      setSelectedBadgeSlot(null)
    } else if (currentSlot !== -1) {
      const next = [...padded]; next[currentSlot] = ''
      setEquippedBadges(next)
      await unequipBadge(currentSlot as 0 | 1 | 2)
    } else {
      const emptySlot = padded.findIndex(b => !b)
      const slot = (emptySlot === -1 ? 0 : emptySlot) as 0 | 1 | 2
      const next = [...padded]; next[slot] = badgeId
      setEquippedBadges(next)
      await equipBadge(badgeId, slot)
    }
    setBadgeSaving(false)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* LOCAL-ONLY preview background layer (test). Mirrors ClientBackground:
          fixed full-screen image + a darkening scrim for legibility. */}
      {previewBg?.src && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={bgImgRef} src={previewBg.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: previewBg.scrim ?? DEFAULT_SCRIM }} />
        </div>
      )}
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 1.25rem 3rem', position: 'relative', zIndex: 1 }}>

      {/* ── Page background preview switcher (TEST — local only, not saved.
            Gated to the dev account so live players never see it.) ── */}
      {username?.toLowerCase() === 'kingkong' && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        margin: '0.75rem 0 0.25rem',
        padding: '0.6rem 0.75rem',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px dashed rgba(255,255,255,0.16)',
      }}>
        <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.5)' }}>
          Page bg (test)
        </span>
        {PREVIEW_BGS.map(opt => {
          const isNone = !opt.src
          const isActive = isNone ? previewBg === null : previewBg?.label === opt.label
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => setPreviewBg(isNone ? null : opt)}
              title={opt.label}
              style={{
                position: 'relative',
                width: 38, height: 38, borderRadius: 8, overflow: 'hidden',
                padding: 0, cursor: 'pointer',
                border: isActive ? '2px solid #f0c040' : '1px solid rgba(255,255,255,0.18)',
                boxShadow: isActive ? '0 0 8px rgba(240,192,64,0.4)' : 'none',
                background: isNone
                  ? 'linear-gradient(45deg, rgba(255,255,255,0.14) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.14) 75%, transparent 75%, transparent)'
                  : undefined,
                backgroundSize: isNone ? '8px 8px' : undefined,
                appearance: 'none', WebkitAppearance: 'none',
              }}
            >
              {opt.src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.src} alt={opt.label} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
              )}
            </button>
          )
        })}
      </div>
      )}

      {/* ── Identity header ── */}
      <div className="flex flex-col items-center gap-3 pt-2 pb-7">
        {/* Avatar — equipped character + hat composite. Tap to open the
            color picker (bg + border). Small pencil badge + caption below
            make the affordance obvious to casual players. */}
        <button
          type="button"
          onClick={() => setAvatarPickerOpen(true)}
          aria-label="Customize avatar colors"
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            borderRadius: '50%',
            position: 'relative',
          }}
        >
          <CharacterAvatar
            characterColor={characterColor}
            equippedHat={equippedHat}
            size={avatarSize}
            bgColor={avatarBg ?? DEFAULT_AVATAR_BG_COLOR}
            ringColor={avatarBorder ?? DEFAULT_AVATAR_BORDER_COLOR}
          />
          {/* Pencil edit badge — like a profile-picture edit affordance */}
          <span style={{
            position: 'absolute', right: 2, bottom: 2,
            width: 34, height: 34, borderRadius: '50%',
            background: '#f0c040',
            border: '2.5px solid #0a1422',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(0,0,0,0.55)',
            pointerEvents: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a1422" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4z"/>
            </svg>
          </span>
        </button>
        <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.55)', marginTop: 0, letterSpacing: '0.06em' }}>
          Tap to customize colors
        </p>

        {/* Username + rename */}
        {showUsernameForm ? (
          <form onSubmit={handleSaveUsername} style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              <p className="font-karla font-300 text-red-400 text-center" style={{ fontSize: '0.72rem' }}>{usernameError}</p>
            )}
            <p className="font-karla font-300 text-center" style={{ fontSize: '0.65rem', color: '#6a6764' }}>
              3–20 chars · letters, numbers, underscores · can only be changed once
            </p>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              <button type="submit" disabled={pending} className="btn-gold" style={{ fontSize: '0.72rem', padding: '0.45rem 1.25rem' }}>
                {pending ? '…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setShowUsernameForm(false); setUsernameError('') }} className="btn-ghost" style={{ fontSize: '0.72rem', padding: '0.45rem 1.25rem' }}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8' }}>{username}</p>
            {!usernameChanged ? (
              <button
                onClick={() => setShowUsernameForm(true)}
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0.45rem 1rem', borderRadius: '2rem',
                  background: 'rgba(240,192,64,0.12)',
                  border: '1px solid rgba(240,192,64,0.4)',
                  color: '#f0c040', fontSize: '0.68rem', cursor: 'pointer',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4z"/>
                </svg>
                Change username
              </button>
            ) : (
              <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#6a6764' }}>
                Username can only be changed once
              </p>
            )}
          </div>
        )}

        {/* Badge pills */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {isPremium && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.28)' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.65rem', color: '#f0c040' }}>Member</span>
            </div>
          )}
          <Link
            href={`/u/${username}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0.35rem 0.75rem', borderRadius: '2rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              textDecoration: 'none',
            }}
          >
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.65rem', color: '#6a6764' }}>Public Profile ↗</span>
          </Link>
          <Link
            href="/leaderboard"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0.35rem 0.75rem', borderRadius: '2rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              textDecoration: 'none',
            }}
          >
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.65rem', color: '#6a6764' }}>Leaderboard ↗</span>
          </Link>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-8 md:gap-10 items-start">

        {/* ── LEFT: Fishing — character + catches ── */}
        <div className="flex flex-col" style={{ gap: 28 }}>

          {/* Character Loadout + color picker */}
          <div style={{
            background: 'radial-gradient(ellipse at 50% 90%, rgba(20,50,100,0.22) 0%, transparent 70%)',
            border: '1px solid rgba(80,120,200,0.18)',
            borderRadius: 20,
            overflow: 'hidden',
            paddingBottom: 14,
          }}>
            {/* Picker wrapper — character color moved to the Avatar Colors
                modal; only the badge picker lives here now. */}
            <div style={{ padding: '0.75rem 1rem 0' }}>
              {/* Badge picker */}
              <button
                disabled={badgeSaving}
                onClick={() => setBadgePickerOpen(o => !o)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}
              >
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {[0, 1, 2].map(slot => {
                    const badge = BADGE_MAP[equippedBadges[slot] ?? '']
                    return badge ? (
                      <img key={slot} src={badge.imageUrl} alt={badge.name} style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 4 }} />
                    ) : (
                      <div key={slot} style={{ width: 26, height: 26, borderRadius: 4, border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }} />
                    )
                  })}
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#d8d5d0', lineHeight: 1 }}>
                    {equippedBadges.filter(Boolean).length > 0
                      ? equippedBadges.filter(Boolean).map(id => BADGE_MAP[id]?.name).join(', ')
                      : 'None equipped'}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.56rem', color: '#5a5755', marginTop: 2 }}>Badges</p>
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#5a5755" strokeWidth="2.5" strokeLinecap="round"
                  style={{ transform: badgePickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>

              {badgePickerOpen && (
                <div style={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}>
                  <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#5a5755', lineHeight: 1.4, marginBottom: 8 }}>
                    {selectedBadgeSlot !== null
                      ? `Slot ${selectedBadgeSlot + 1} selected — pick a badge to equip there.`
                      : 'Pick a slot first, or tap a badge to fill the next empty slot.'}
                  </p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {[0, 1, 2].map(slot => {
                      const id = equippedBadges[slot]
                      const badge = id ? BADGE_MAP[id] : null
                      const isSelected = selectedBadgeSlot === slot
                      return (
                        <button
                          key={slot}
                          disabled={badgeSaving}
                          onClick={() => setSelectedBadgeSlot(isSelected ? null : (slot as 0 | 1 | 2))}
                          style={{
                            flex: 1, aspectRatio: '1',
                            background: isSelected ? 'rgba(240,192,64,0.12)' : 'rgba(255,255,255,0.04)',
                            border: `2px solid ${isSelected ? '#f0c040' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 10, cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                            boxShadow: isSelected ? '0 0 10px rgba(240,192,64,0.3)' : 'none',
                          }}
                        >
                          {badge ? (
                            <img src={badge.imageUrl} alt={badge.name} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                          ) : (
                            <span className="font-karla font-600" style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)' }}>Empty</span>
                          )}
                          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: isSelected ? '#f0c040' : 'rgba(255,255,255,0.4)' }}>Slot {slot + 1}</span>
                        </button>
                      )
                    })}
                  </div>
                  {unlockedBadges.length === 0 ? (
                    <p className="font-karla" style={{ fontSize: '0.68rem', color: '#4a4845' }}>Earn badges by completing achievements.</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {BADGES.map(b => {
                        const isUnlocked = unlockedBadges.includes(b.id)
                        const isEquipped = equippedBadges.includes(b.id)
                        return (
                          <button
                            key={b.id}
                            disabled={badgeSaving}
                            onClick={() => handleBadgeClick(b.id)}
                            title={b.name}
                            style={{
                              background: 'none', border: 'none', cursor: isUnlocked ? 'pointer' : 'default',
                              padding: 0, opacity: isUnlocked ? 1 : 0.35,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            }}
                          >
                            <div style={{
                              width: 44, height: 44, borderRadius: 8, overflow: 'hidden', position: 'relative',
                              border: isEquipped ? '2px solid #f0c040' : '2px solid rgba(255,255,255,0.1)',
                              boxShadow: isEquipped ? '0 0 10px rgba(240,192,64,0.35)' : 'none',
                            }}>
                              <img src={b.imageUrl} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                              {!isUnlocked && (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.52)' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                  </svg>
                                </div>
                              )}
                            </div>
                            <span className="font-karla font-600" style={{ fontSize: '0.52rem', color: isEquipped ? '#f0c040' : '#6a6764', textAlign: 'center', maxWidth: 44, lineHeight: 1.2 }}>
                              {b.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '0.75rem' }} />
                </div>
              )}

            </div>
            <div style={{
              position: 'relative', width: '100%', height: 160, marginTop: 8,
              filter: 'drop-shadow(0 8px 14px rgba(0,15,35,0.6))',
            }}>
              <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '72%', maxWidth: 260 }}>
                <img src={charSprites.rest} alt="" style={{ width: '100%', display: 'block' }} />
                {(() => {
                  const hd = getHat(equippedHat)
                  if (!hd) return null
                  const hp = hd.positions.rest
                  return (
                    <img src={hd.restImageUrl} alt="" style={{
                      position: 'absolute', top: `${hp.top}%`, left: `${hp.left}%`,
                      width: `${hp.width}%`,
                      transform: `rotate(${hp.rotate}deg)`,
                      transformOrigin: 'center center',
                      pointerEvents: 'none',
                    }} />
                  )
                })()}
                {(() => {
                  const bd = getBoat(equippedBoat)
                  if (!bd) return null
                  const bp = bd.positions.rest
                  return (
                    <div style={{
                      position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
                      width: `${bp.width}%`,
                      // Match the iOS rest-frame nudge applied in FishingGame
                      transform: `rotate(${bp.rotate}deg) translateX(-2px)`,
                      transformOrigin: 'center center',
                      pointerEvents: 'none',
                    }}>
                      <img src={bd.restImageUrl} alt="" className={boatGlowClass(bd)} style={{ width: '100%', display: 'block' }} />
                    </div>
                  )
                })()}
                {/* Rod — 3-pose rest sprite. Coords mirror CHAR_ROD_OVERLAY.rest
                    in FishingGame so the static profile silhouette matches what
                    the player sees in the actual fishing scene. maxWidth: 'none'
                    overrides Tailwind preflight which would otherwise cap the
                    rod at 100% of the avatar container. */}
                {rod.slug ? (
                  <img src={`/${rod.slug}_rest.png`} alt="" className={rodGlowClass(rod)} style={{
                    position: 'absolute', top: '37%', left: '-12%', width: '107.5%',
                    transformOrigin: 'center center',
                    pointerEvents: 'none',
                    maxWidth: 'none',
                    ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : {}),
                  } as React.CSSProperties} />
                ) : rod.imageUrl && (
                  <img src={rod.imageUrl} alt="" className={rodGlowClass(rod)} style={{
                    position: 'absolute', top: '33%', left: '12%', width: '51%',
                    transform: 'rotate(-1deg)', transformOrigin: 'bottom right',
                    pointerEvents: 'none',
                    ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : {}),
                  } as React.CSSProperties} />
                )}
                {/* Reel — mirrors CHAR_REEL_OVERLAY.rest from FishingGame. */}
                {reel.imageUrl && (
                  <img src={reel.imageUrl} alt="" style={{
                    position: 'absolute', top: '15%', left: '-10.3%', width: '222%',
                    transform: 'rotate(-18deg)', transformOrigin: 'center center',
                    pointerEvents: 'none',
                    maxWidth: 'none',
                  }} />
                )}
                {/* Hook — mirrors CHAR_HOOK_OVERLAY.rest from FishingGame
                    so the profile silhouette matches the live game. */}
                {hook.imageUrl && (
                  <img src={hook.imageUrl} alt="" className={hookGlowClass(hook)} style={{
                    position: 'absolute', top: '39.5%', left: '-10.5%', width: '204.5%',
                    transformOrigin: 'center center',
                    pointerEvents: 'none',
                    maxWidth: 'none',
                    ...(hook.glow ? { ['--rod-glow-color' as string]: hook.color } : {}),
                  } as React.CSSProperties} />
                )}
                {equippedBadges.map((badgeId, slot) => {
                  if (!badgeId) return null
                  const badge = BADGE_MAP[badgeId]
                  const bp = BADGE_SLOT_POSITIONS[slot]?.['rest' as BadgeFrame]
                  if (!badge || !bp) return null
                  return (
                    <img key={slot} src={badge.imageUrl} alt={badge.name} style={{
                      position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
                      width: `${bp.width}%`, transform: `rotate(${bp.rotate}deg)`,
                      transformOrigin: 'center center', pointerEvents: 'none',
                    }} />
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 0, padding: '8px 20px 0' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: rod.color + 'aa', marginBottom: 3 }}>Rod</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#d8d5d0', lineHeight: 1.2 }}>{rod.name}</p>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 8px', alignSelf: 'stretch' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: 'rgba(96,165,250,0.7)', marginBottom: 3 }}>Fishing Level</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#60a5fa', lineHeight: 1.2 }}>{level}</p>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 8px', alignSelf: 'stretch' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: hook.color + 'aa', marginBottom: 3 }}>Hook</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#d8d5d0', lineHeight: 1.2 }}>{hook.name}</p>
              </div>
            </div>
          </div>

          {/* Equipped Special */}
          {equippedSpecial && (
            <div style={{
              display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 8,
              padding: '0.4rem 0.75rem 0.4rem 0.5rem', borderRadius: 20,
              background: `${equippedSpecial.color}10`, border: `1px solid ${equippedSpecial.color}30`,
            }}>
              {equippedSpecial.image
                ? <img src={equippedSpecial.image} alt={equippedSpecial.name} style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 0 6px ${equippedSpecial.color}66)` }} />
                : <div style={{ width: 26, height: 26, borderRadius: 6, background: equippedSpecial.color + '22', flexShrink: 0 }} />
              }
              <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: equippedSpecial.color }}>{equippedSpecial.name}</span>
            </div>
          )}

          {/* Rarest Catches */}
          {ancientTrophies.length > 0 && (
            <div>
              <SectionLabel>Vault of the Ancients</SectionLabel>
              <div style={{
                position: 'relative',
                background: 'radial-gradient(ellipse at 50% 0%, rgba(60,10,18,0.92) 0%, rgba(8,4,6,0.98) 70%)',
                border: '1px solid rgba(225,29,72,0.4)',
                borderRadius: 16,
                padding: '1.1rem 0.95rem 1rem',
                boxShadow: 'inset 0 1px 0 rgba(253,230,138,0.08), inset 0 0 32px rgba(225,29,72,0.06), 0 0 28px rgba(225,29,72,0.12)',
                overflow: 'hidden',
              }}>
                {/* Faint vault crest watermark */}
                <div style={{
                  position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
                  width: 180, height: 180,
                  background: 'radial-gradient(circle, rgba(253,230,138,0.06) 0%, transparent 60%)',
                  pointerEvents: 'none',
                }} />

                {/* Ornamental divider with counter inset */}
                <div style={{ position: 'relative', textAlign: 'center', marginBottom: '0.95rem' }}>
                  <div style={{
                    position: 'absolute', left: 8, right: 8, top: '50%',
                    height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(253,230,138,0.45) 50%, transparent 100%)',
                  }} />
                  <span className="font-cinzel font-700 uppercase" style={{
                    position: 'relative', display: 'inline-block',
                    padding: '0 0.85rem',
                    background: 'rgba(8,4,6,1)',
                    fontSize: '0.56rem', letterSpacing: '0.32em',
                    color: '#fde68a',
                  }}>
                    {ancientTrophies.length} of 6 sealed
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, position: 'relative' }}>
                  {ancientTrophies.map(t => (
                    <div key={t.id} style={{
                      position: 'relative',
                      background: 'radial-gradient(ellipse at 50% 110%, rgba(225,29,72,0.22) 0%, rgba(20,6,10,0.7) 55%, rgba(8,4,6,0.95) 100%)',
                      border: '1px solid rgba(225,29,72,0.5)',
                      borderRadius: 10,
                      padding: '1rem 0.55rem 0.75rem',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      boxShadow: 'inset 0 1px 0 rgba(253,230,138,0.06)',
                    }}>
                      {/* Filigree corner brackets */}
                      {[
                        { top: 4, left: 4, borderTop: '1px solid rgba(253,230,138,0.55)', borderLeft: '1px solid rgba(253,230,138,0.55)' },
                        { top: 4, right: 4, borderTop: '1px solid rgba(253,230,138,0.55)', borderRight: '1px solid rgba(253,230,138,0.55)' },
                        { bottom: 4, left: 4, borderBottom: '1px solid rgba(253,230,138,0.55)', borderLeft: '1px solid rgba(253,230,138,0.55)' },
                        { bottom: 4, right: 4, borderBottom: '1px solid rgba(253,230,138,0.55)', borderRight: '1px solid rgba(253,230,138,0.55)' },
                      ].map((s, i) => (
                        <div key={i} style={{ position: 'absolute', width: 9, height: 9, ...s }} />
                      ))}

                      {/* Pedestal glow + fish */}
                      <div style={{ position: 'relative', width: 76, height: 76, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{
                          position: 'absolute', inset: 6,
                          borderRadius: '50%',
                          background: 'radial-gradient(circle at 50% 38%, rgba(253,230,138,0.22) 0%, rgba(225,29,72,0.16) 50%, transparent 78%)',
                          filter: 'blur(2px)',
                        }} />
                        <img
                          src={fishImageUrl(t.name)}
                          alt={t.name}
                          style={{
                            position: 'relative',
                            maxWidth: 68, maxHeight: 68, objectFit: 'contain',
                            filter: 'drop-shadow(0 3px 14px rgba(225,29,72,0.65))',
                          }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      </div>

                      <div style={{
                        width: 28, height: 1,
                        background: 'linear-gradient(90deg, transparent, rgba(253,230,138,0.55), transparent)',
                      }} />

                      <p className="font-cinzel font-700" style={{
                        fontSize: '0.74rem', color: '#fee2e2', lineHeight: 1.15,
                        textAlign: 'center', textShadow: '0 0 8px rgba(225,29,72,0.5)',
                      }}>
                        {t.name}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="font-karla font-300 italic" style={{
                  fontSize: '0.62rem', color: 'rgba(254,226,226,0.55)',
                  marginTop: 12, textAlign: 'center', letterSpacing: '0.04em',
                }}>
                  &ldquo;From before the depth knew time.&rdquo;
                </p>
              </div>
            </div>
          )}

          {rarestFish.length > 0 && (
            <div>
              <SectionLabel>Rarest Catches</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rarestFish.length}, 1fr)`, gap: 8 }}>
                {rarestFish.map(fish => {
                  const isAncient = fish.habitat === 'ancient_deep'
                  const c = isAncient ? '#a78bfa' : RARITY_COLOR[fish.bite_rarity]
                  const label = isAncient ? 'Ancient' : (RARITY_LABEL[fish.bite_rarity] ?? 'Unknown')
                  return (
                    <div key={fish.id} style={{
                      background: `${c}0a`, border: `1px solid ${c}38`,
                      borderRadius: 12, padding: '0.85rem 0.6rem',
                      textAlign: 'center', boxShadow: `0 0 18px ${c}18`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}>
                      <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img
                          src={fishImageUrl(fish.name)}
                          alt={fish.name}
                          style={{ maxWidth: 52, maxHeight: 52, objectFit: 'contain', filter: `drop-shadow(0 2px 8px ${c}55)` }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      </div>
                      <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#f0ede8', lineHeight: 1.2 }}>{fish.name}</p>
                      <span style={{
                        fontSize: '0.6rem', padding: '0.15rem 0.45rem', borderRadius: '2rem',
                        background: `${c}14`, border: `1px solid ${c}38`, color: c,
                        fontFamily: 'var(--font-karla)', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.1em',
                      }}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
              {uniqueSpecies > 0 && (
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.65rem', color: '#6a6764', marginTop: 10, textAlign: 'center' }}>
                  {uniqueSpecies.toLocaleString()} species caught
                </p>
              )}
            </div>
          )}

        </div>

        {/* ── RIGHT: Expedition — ship + showcase + customise ── */}
        <div className="flex flex-col" style={{ gap: 28 }}>

          {/* Ship Hero */}
          <div style={{
            background: `radial-gradient(ellipse at 50% 65%, ${ship.color}1c 0%, transparent 68%)`,
            border: `1px solid ${ship.color}20`,
            borderRadius: 20,
            padding: '24px 16px 16px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <img
              src={ship.imageUrl}
              alt={ship.name}
              style={{
                width: 200, height: 155, objectFit: 'contain',
                filter: shipSkinDef ? shipSkinDef.filter : `drop-shadow(0 4px 28px ${ship.color}60)`,
              }}
            />
            <div style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: ship.color, lineHeight: 1.2 }}>
                {customShipName ?? shipName}
              </p>
              {customShipName && (
                <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: ship.color + '70', marginTop: 5 }}>
                  {shipName}
                </p>
              )}
              {expeditionLevel > 0 && (
                <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: '#60a5fa', marginTop: 5 }}>
                  {navigatorTitle} · Lv {expeditionLevel}
                </p>
              )}
              {shipSkinDef && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '0.25rem 0.65rem', borderRadius: '2rem', background: shipSkinDef.color + '18', border: `1px solid ${shipSkinDef.color}40` }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill={shipSkinDef.color} stroke="none">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: shipSkinDef.color }}>
                    {shipSkinDef.name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Showcase */}
          <div>
            <SectionLabel>Showcase</SectionLabel>
            {showcaseCards.length > 0 ? (
              <ShowcaseCarousel cards={showcaseCards} onEdit={() => setModalOpen(true)} />
            ) : (
              <div style={{ textAlign: 'center', paddingTop: 8 }}>
                <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#3a3835', marginBottom: 12 }}>
                  Pin your best catches to your profile
                </p>
                <button
                  onClick={() => setModalOpen(true)}
                  style={{
                    padding: '0.4rem 1rem', borderRadius: '2rem',
                    background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.3)',
                    cursor: 'pointer',
                  }}
                >
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', color: '#f0c040', letterSpacing: '0.12em' }}>+ Add Cards</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Sign out ── */}
      <button
        onClick={signOut}
        style={{
          width: '100%', padding: '0.8rem', marginTop: 40,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span className="font-karla font-600 uppercase" style={{ fontSize: '0.72rem', color: '#6a6764', letterSpacing: '0.14em' }}>Sign Out</span>
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

            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.09)', flexShrink: 0 }}>
              <button onClick={handleSaveShowcase} disabled={pending} className="btn-gold w-full" style={{ opacity: pending ? 0.5 : 1 }}>
                {pending ? 'Saving…' : 'Save Showcase'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Avatar color picker ─────────────────────────────────────────────── */}
      {avatarPickerOpen && (
        <div
          onClick={() => setAvatarPickerOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // Asymmetric padding clears the fixed Nav (top, ~44 mobile /
            // ~60 desktop) and the fixed MobileTabBar (bottom, ~64 + safe
            // area). Without this the centered modal can position itself
            // behind the tab bar and the Save button is unreachable on
            // taller content. Mirrors the pattern used by LeaderboardModal
            // + RaidsSection NodeDetailSheet.
            padding: 'calc(env(safe-area-inset-top, 0px) + 56px) 1.25rem calc(env(safe-area-inset-bottom, 0px) + 76px)',
            cursor: 'pointer',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #0c1626 0%, #06101c 100%)',
              border: '1px solid rgba(96,165,250,0.18)',
              borderRadius: 18,
              width: '100%', maxWidth: 360,
              // Flex column with scrollable body + sticky footer: the body
              // takes the overflow, so the Reset/Save row is always pinned
              // at the bottom no matter how tall the content gets.
              maxHeight: '100%',
              display: 'flex', flexDirection: 'column',
              cursor: 'default',
              boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
              position: 'relative',
            }}
          >
            {/* Close (X) */}
            <button
              type="button"
              onClick={() => setAvatarPickerOpen(false)}
              aria-label="Close"
              style={{
                position: 'absolute', top: 10, right: 10, zIndex: 2,
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '50%',
                color: 'rgba(240,237,232,0.75)',
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>

            {/* Scrollable body */}
            <div style={{
              flex: 1, minHeight: 0,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              padding: '1.1rem 1rem 0.5rem',
            }}>
            {/* Live preview */}
            <div className="flex items-center justify-center" style={{ marginBottom: 14 }}>
              <CharacterAvatar
                characterColor={characterColor}
                equippedHat={equippedHat}
                size={92}
                bgColor={avatarBg ?? DEFAULT_AVATAR_BG_COLOR}
                ringColor={avatarBorder ?? DEFAULT_AVATAR_BORDER_COLOR}
              />
            </div>

            <p className="font-cinzel font-700 text-center" style={{ fontSize: '1.05rem', color: '#f0ede8', marginBottom: 4 }}>
              Avatar Colors
            </p>
            <p className="font-karla text-center" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.55)', marginBottom: 16 }}>
              These appear everywhere your avatar shows up.
            </p>

            {/* Character swatches — saves immediately on click (same as the
                old standalone picker), so the live preview above updates as
                soon as the player taps. Background/border still batch into
                the Save button below. */}
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', color: '#7a9bc4', letterSpacing: '0.14em', marginBottom: 6 }}>
              Character
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 14 }}>
              {CHARACTER_COLORS.map(c => {
                const sprites = getCharacterSprites(c.id)
                const isActive = characterColor === c.id
                const isUnlocked = unlockedColors.includes(c.id)
                return (
                  <button
                    key={`char-${c.id}`}
                    type="button"
                    disabled={colorSaving}
                    onClick={async () => {
                      if (!isUnlocked) {
                        if (c.price || c.gemPrice) {
                          setPurchaseError(null)
                          setPurchasePrompt({
                            kind: 'skin',
                            id: c.id,
                            name: c.name,
                            price: (c.gemPrice ?? c.price)!,
                            currency: c.gemPrice ? 'gems' : 'doubloons',
                          })
                        } else {
                          flashLockMsg(c.unlockHint ? `${c.name} — ${c.unlockHint}` : `${c.name} — locked`)
                        }
                        return
                      }
                      if (isActive) return
                      setColorSaving(true)
                      setCharacterColor(c.id)
                      await updateCharacterColor(c.id)
                      setColorSaving(false)
                    }}
                    aria-label={`Character ${c.name}${!isUnlocked ? ' (locked)' : ''}`}
                    title={isUnlocked ? c.name : `${c.name} — ${c.unlockHint ?? 'locked'}`}
                    style={{
                      width: '100%', aspectRatio: '1 / 1',
                      borderRadius: '50%', overflow: 'hidden',
                      backgroundImage: `url(${sprites.rest})`,
                      backgroundSize: '420% auto', backgroundPosition: '60% 68%',
                      backgroundRepeat: 'no-repeat',
                      border: isActive ? '2px solid #f0c040' : '1px solid rgba(255,255,255,0.18)',
                      boxShadow: isActive ? '0 0 10px rgba(240,192,64,0.35)' : 'none',
                      cursor: colorSaving ? 'default' : 'pointer',
                      padding: 0,
                      opacity: !isUnlocked ? 0.55 : 1,
                      position: 'relative',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                    }}
                  >
                    {!isUnlocked && <LockBadge />}
                  </button>
                )
              })}
            </div>

            {/* Background swatches */}
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', color: '#7a9bc4', letterSpacing: '0.14em', marginBottom: 6 }}>
              Background
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 14 }}>
              {AVATAR_PALETTE.map(c => {
                const isActive = (avatarBg ?? DEFAULT_AVATAR_BG_COLOR) === c.hex
                const isNone = c.hex === NONE_VALUE
                const locked = !!c.premiumOnly && !isPremium
                return (
                  <button
                    key={`bg-${c.id}`}
                    type="button"
                    onClick={() => {
                      if (locked) { flashLockMsg('Requires Premium membership'); return }
                      setAvatarBg(c.hex)
                    }}
                    aria-label={`Background ${c.label}${locked ? ' (premium)' : ''}`}
                    title={locked ? `${c.label} — premium only` : c.label}
                    style={{
                      width: '100%', aspectRatio: '1 / 1',
                      borderRadius: '50%',
                      // Use longhand backgroundColor + backgroundImage to avoid
                      // the shorthand quirk where `background: 'transparent'`
                      // wipes the bg-image on iOS.
                      backgroundColor: isNone ? 'transparent' : c.hex,
                      backgroundImage: isNone
                        ? 'linear-gradient(45deg, rgba(255,255,255,0.18) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.18) 75%, transparent 75%, transparent)'
                        : `radial-gradient(circle at 38% 35%, ${c.hex}ee 0%, ${c.hex}77 100%)`,
                      backgroundSize: isNone ? '8px 8px' : undefined,
                      border: isActive ? `2px solid #f0c040` : '1px solid rgba(255,255,255,0.18)',
                      boxShadow: isActive ? `0 0 10px rgba(240,192,64,0.35)` : 'none',
                      cursor: locked ? 'pointer' : 'pointer',
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
              {AVATAR_SPECIALS.filter(s => s.kind === 'bg').map(s => {
                const isActive = (avatarBg ?? DEFAULT_AVATAR_BG_COLOR) === s.hex
                const owned = unlockedSpecials.includes(s.id)
                return (
                  <button
                    key={`bg-${s.id}`}
                    type="button"
                    onClick={() => {
                      if (!owned) {
                        if (!isPremium) {
                          flashLockMsg(`${s.label} — Premium membership required`)
                          return
                        }
                        setPurchaseError(null)
                        setPurchasePrompt({ kind: 'special', id: s.id, name: s.label, price: s.gemPrice, currency: 'gems' })
                        return
                      }
                      setAvatarBg(s.hex)
                    }}
                    aria-label={`Background ${s.label}${!owned ? ` (${s.gemPrice} gems)` : ''}`}
                    title={owned ? s.label : `${s.label} — ${s.gemPrice} ◆`}
                    style={{
                      width: '100%', aspectRatio: '1 / 1',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      border: isActive ? `2px solid #f0c040` : '1px solid rgba(255,255,255,0.18)',
                      boxShadow: isActive ? `0 0 10px rgba(240,192,64,0.35)` : 'none',
                      cursor: 'pointer',
                      padding: 0,
                      opacity: !owned ? 0.7 : 1,
                      position: 'relative',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                    }}
                  >
                    <div className={s.cssClass} aria-hidden style={{ position: 'absolute', inset: 0 }} />
                    {!owned && <LockBadge />}
                  </button>
                )
              })}
            </div>

            {/* Border swatches */}
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', color: '#7a9bc4', letterSpacing: '0.14em', marginBottom: 6 }}>
              Border
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
              {[...AVATAR_PALETTE, ...AVATAR_BORDER_EXTRAS].map(c => {
                const isActive = (avatarBorder ?? DEFAULT_AVATAR_BORDER_COLOR) === c.hex
                const isNone = c.hex === NONE_VALUE
                const locked = !!c.premiumOnly && !isPremium
                return (
                  <button
                    key={`bd-${c.id}`}
                    type="button"
                    onClick={() => {
                      if (locked) { flashLockMsg('Requires Premium membership'); return }
                      setAvatarBorder(c.hex)
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
                      boxShadow: c.premiumOnly && !locked
                        ? `0 0 10px ${c.hex}55, inset 0 0 6px ${c.hex}44`
                        : undefined,
                      appearance: 'none',
                      WebkitAppearance: 'none',
                    }}
                  >
                    {locked && <LockBadge />}
                  </button>
                )
              })}
              {AVATAR_SPECIALS.filter(s => s.kind === 'border').map(s => {
                const isActive = (avatarBorder ?? DEFAULT_AVATAR_BORDER_COLOR) === s.hex
                const owned = unlockedSpecials.includes(s.id)
                return (
                  <button
                    key={`bd-${s.id}`}
                    type="button"
                    className={s.cssClass}
                    onClick={() => {
                      if (!owned) {
                        if (!isPremium) {
                          flashLockMsg(`${s.label} — Premium membership required`)
                          return
                        }
                        setPurchaseError(null)
                        setPurchasePrompt({ kind: 'special', id: s.id, name: s.label, price: s.gemPrice, currency: 'gems' })
                        return
                      }
                      setAvatarBorder(s.hex)
                    }}
                    aria-label={`Border ${s.label}${!owned ? ` (${s.gemPrice} gems)` : ''}`}
                    title={owned ? s.label : `${s.label} — ${s.gemPrice} ◆`}
                    style={{
                      width: '100%', aspectRatio: '1 / 1',
                      borderRadius: '50%',
                      border: 'none',
                      outline: isActive ? '2px solid #f0c040' : 'none',
                      outlineOffset: 2,
                      cursor: 'pointer',
                      padding: 0,
                      opacity: !owned ? 0.7 : 1,
                      position: 'relative',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                    }}
                  >
                    {/* Inset dark disc so the animated gradient reads as a
                        ring instead of a full-fill swatch, matching how the
                        avatar itself renders these specials. */}
                    <span aria-hidden style={{
                      position: 'absolute', inset: 3,
                      borderRadius: '50%',
                      background: 'rgba(6,12,20,0.92)',
                    }} />
                    {!owned && <LockBadge />}
                  </button>
                )
              })}
            </div>

            {/* Lock-tap toast + premium link */}
            <div style={{ minHeight: 24, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {avatarLockMsg ? (
                <p className="font-karla font-700" style={{
                  fontSize: '0.7rem', color: '#f0c040',
                  background: 'rgba(240,192,64,0.12)',
                  border: '1px solid rgba(240,192,64,0.35)',
                  borderRadius: 999, padding: '0.3rem 0.75rem',
                  letterSpacing: '0.04em',
                }}>
                  {avatarLockMsg}
                </p>
              ) : !isPremium ? (
                <a
                  href="https://shiblingshop.com/products/small-fishes-premium-membership"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-karla font-600"
                  style={{
                    fontSize: '0.7rem',
                    color: '#f0c040',
                    textDecoration: 'none',
                    letterSpacing: '0.03em',
                  }}
                >
                  ✦ Unlock more with Premium membership →
                </a>
              ) : null}
            </div>

            </div>

            {/* Sticky footer — Reset + Save always visible regardless of scroll */}
            <div style={{
              flexShrink: 0,
              display: 'flex', gap: 10,
              padding: '0.85rem 1rem calc(env(safe-area-inset-bottom, 0px) + 0.85rem)',
              borderTop: '1px solid rgba(96,165,250,0.18)',
              background: 'linear-gradient(180deg, rgba(6,16,28,0.85) 0%, rgba(6,16,28,1) 100%)',
              borderBottomLeftRadius: 18,
              borderBottomRightRadius: 18,
            }}>
              <button
                type="button"
                disabled={avatarSaving}
                onClick={async () => {
                  setAvatarSaving(true)
                  setAvatarBg(null)
                  setAvatarBorder(null)
                  await updateAvatarColors({ bgColor: null, borderColor: null })
                  setAvatarSaving(false)
                }}
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{
                  flex: 1, padding: '0.85rem 0',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: 'rgba(240,237,232,0.78)',
                  borderRadius: 12, fontSize: '0.8rem',
                  cursor: avatarSaving ? 'default' : 'pointer',
                }}
              >
                Reset
              </button>
              <button
                type="button"
                disabled={avatarSaving}
                onClick={async () => {
                  setAvatarSaving(true)
                  await updateAvatarColors({ bgColor: avatarBg, borderColor: avatarBorder })
                  setAvatarSaving(false)
                  setAvatarPickerOpen(false)
                }}
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{
                  flex: 2, padding: '0.85rem 0',
                  background: 'rgba(96,165,250,0.16)',
                  border: '1px solid rgba(96,165,250,0.55)',
                  color: '#cfe2ff',
                  borderRadius: 12, fontSize: '0.8rem',
                  cursor: avatarSaving ? 'default' : 'pointer',
                  opacity: avatarSaving ? 0.6 : 1,
                }}
              >
                {avatarSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {purchasePrompt && (
        <div
          onClick={() => { if (!purchasing) setPurchasePrompt(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.25rem',
            cursor: 'pointer',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #1a1408 0%, #0c0a06 100%)',
              border: '1px solid rgba(240,192,64,0.35)',
              borderRadius: 18,
              padding: '1.25rem 1.1rem 1rem',
              width: '100%', maxWidth: 320,
              boxShadow: '0 18px 60px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(240,192,64,0.08)',
              cursor: 'default',
            }}
          >
            <p className="font-cinzel font-700 text-center" style={{ fontSize: '1.05rem', color: '#f0c040', marginBottom: 6 }}>
              Buy {purchasePrompt.name} Skin
            </p>
            <p className="font-karla text-center" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.75)', lineHeight: 1.5, marginBottom: 14 }}>
              {purchasePrompt.price.toLocaleString()} {purchasePrompt.currency === 'gems' ? '◆' : '⟡'} — yours forever once bought.
            </p>
            <p className="font-karla text-center" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.55)', marginBottom: 14 }}>
              Your purse: {(purchasePrompt.currency === 'gems' ? gems : doubloons).toLocaleString()} {purchasePrompt.currency === 'gems' ? '◆' : '⟡'}
            </p>
            {purchaseError && (
              <p className="font-karla font-700 text-center" style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: 10 }}>
                {purchaseError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={purchasing}
                onClick={() => setPurchasePrompt(null)}
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{
                  flex: 1, padding: '0.7rem 0',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(240,237,232,0.65)',
                  borderRadius: 12, fontSize: '0.72rem',
                  cursor: purchasing ? 'default' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={purchasing}
                onClick={async () => {
                  setPurchasing(true)
                  setPurchaseError(null)
                  if (purchasePrompt.kind === 'skin') {
                    const result = await purchaseCharacterColor(purchasePrompt.id)
                    setPurchasing(false)
                    if ('error' in result) { setPurchaseError(result.error); return }
                    setUnlockedColors(result.unlockedColors)
                    setDoubloons(result.doubloons)
                    setGems(result.gems)
                    if (purchasePrompt.currency === 'gems') {
                      window.dispatchEvent(new CustomEvent('gems-changed', { detail: result.gems }))
                    } else {
                      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.doubloons }))
                    }
                  } else {
                    const result = await purchaseAvatarSpecial(purchasePrompt.id)
                    setPurchasing(false)
                    if ('error' in result) { setPurchaseError(result.error); return }
                    setUnlockedSpecials(result.unlockedSpecials)
                    setGems(result.gems)
                    window.dispatchEvent(new CustomEvent('gems-changed', { detail: result.gems }))
                  }
                  setPurchasePrompt(null)
                }}
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{
                  flex: 2, padding: '0.7rem 0',
                  background: 'rgba(96,165,250,0.16)',
                  border: '1px solid rgba(96,165,250,0.55)',
                  color: '#cfe2ff',
                  borderRadius: 12, fontSize: '0.72rem',
                  cursor: purchasing ? 'default' : 'pointer',
                  opacity: purchasing ? 0.65 : 1,
                }}
              >
                {purchasing ? 'Buying…' : `Buy for ${purchasePrompt.price.toLocaleString()} ${purchasePrompt.currency === 'gems' ? '◆' : '⟡'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}

function LockBadge() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{
        position: 'absolute', inset: 0, margin: 'auto',
        pointerEvents: 'none',
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))',
      }}>
      <rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    </svg>
  )
}
