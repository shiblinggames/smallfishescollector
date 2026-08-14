'use client'

import { useEffect, useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CrewPortrait } from '@/components/CrewShowcase'
import { RarestCatchesByZone, FeaturedCrew, RaidArsenal, GoldenMounts, SpecialTackle, type GoldenMount } from '@/components/ProfileShowcase'
import type { CrewMember } from '@/app/(app)/crew/actions'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { updateUsername, updateCharacterColor, updateAvatarColors, purchaseCharacterColor, purchaseAvatarSpecial, updateProfileBg } from '@/app/(app)/u/actions'
import { PROFILE_BACKGROUNDS, getProfileBackground } from '@/lib/profileBackgrounds'
import AncientBgEffect from '@/components/AncientBgEffect'
import { StatTile, CoinAmount } from '@/components/ProfileStats'
import type { CareerStats } from '@/lib/careerStats'
import { AVATAR_PALETTE, AVATAR_BORDER_EXTRAS, AVATAR_SPECIALS, DEFAULT_AVATAR_BG_COLOR, DEFAULT_AVATAR_BORDER_COLOR, NONE_VALUE } from '@/lib/avatarColors'
import { equipBadge, unequipBadge } from '@/app/(app)/achievements/badgeActions'
import { hapticTap } from '@/lib/haptics'
import BecomeCaptainButton from '@/components/BecomeCaptainButton'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import CharacterAvatar from '@/components/CharacterAvatar'
import { getBoat, boatGlowClass } from '@/lib/boats'
import { getHat } from '@/lib/hats'
import { getPet, getPetOverlay } from '@/lib/pets'
import { BADGES, BADGE_MAP, BADGE_SLOT_POSITIONS, type BadgeFrame } from '@/lib/badges'
import { getRod, rodGlowClass } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getHook, hookGlowClass } from '@/lib/hooks'
import { getShip } from '@/lib/ships'
import { getShipSkin } from '@/lib/shipSkins'
import { SPECIAL_ITEMS } from '@/lib/specialItems'
import PopupShell from '@/components/PopupShell'

interface Props {
  email: string
  username: string
  usernameChanged: boolean
  crewRoster: CrewMember[]
  isPremium: boolean
  level: number
  expeditionLevel: number
  career: CareerStats
  shipTier: number
  shipName: string
  shipColor: string
  customShipName: string | null
  equippedShipSkin: string | null
  rodTier: number
  reelTier: number
  hookTier: number
  equippedSpecialId: string | null
  /** Every fishing special owned, + whichever are seated (slot 1 and the
   *  Sunken Hand's second slot). Drives the Tackle rail. */
  ownedSpecialIds: string[]
  equippedSpecial2Id: string | null
  rarestFish: { id: number; name: string; bite_rarity: number; habitat?: string; sell_value?: number }[]
  prestigeLevels: Record<string, number>
  goldenMounts: GoldenMount[]
  raidItemIds: string[]
  ancientTrophies: { id: number; name: string }[]
  equippedBoat: string | null
  equippedHat: string | null
  equippedPet: string | null
  characterColor: string
  unlockedColors: string[]
  doubloons: number
  gems: number
  equippedBadges: string[]
  unlockedBadges: string[]
  avatarBgColor: string | null
  avatarBorderColor: string | null
  unlockedAvatarSpecials: string[]
  initialProfileBg: string | null
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

// ── Vault of the Ancients ────────────────────────────────────────────────────
// The trophy case for the 6 Ancient Deep giants. Once the first is landed, ALL six
// niches show: caught giants stand lit on their own signature-colored pedestal;
// the rest are sealed — a near-black silhouette behind a rune, so you can just make
// out the shape of what is still down there. Megalodon is the sixth niche, wearing
// the crimson accent and the VI numeral; land it and the whole vault awakens.
// (It had its own full-width apex plinth under the grid — one row too many.)
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI']
const ANCIENT_GIANTS: { id: number; name: string; epithet: string; accent: string }[] = [
  { id: 144, name: 'Plesiosaurus', epithet: 'The Long Neck',      accent: '#22d3ee' },
  { id: 145, name: 'Dunkleosteus', epithet: 'The Armored Jaw',    accent: '#f59e0b' },
  { id: 146, name: 'Mosasaurus',   epithet: 'The Sea Dragon',     accent: '#a855f7' },
  { id: 147, name: 'Basilosaurus', epithet: 'The First Leviathan', accent: '#60a5fa' },
  { id: 148, name: 'Shastasaurus', epithet: 'The Colossus',       accent: '#34d399' },
]
const MEGALODON_GIANT = { id: 143, name: 'Megalodon', epithet: 'The Apex', accent: '#f43f5e' }
// The wall is one list now: five lesser giants, then the apex, three per row.
const ALL_GIANTS = [...ANCIENT_GIANTS, MEGALODON_GIANT]

const VAULT_CSS = `
@keyframes vaultFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
@keyframes vaultShimmer { 0%{transform:translateX(-140%) skewX(-16deg)} 100%{transform:translateX(260%) skewX(-16deg)} }
@keyframes vaultMote { 0%{transform:translateY(0);opacity:0} 18%{opacity:var(--vo,.55)} 82%{opacity:calc(var(--vo,.55)*.55)} 100%{transform:translateY(-70px);opacity:0} }
@keyframes vaultPulse { 0%,100%{opacity:.4} 50%{opacity:.85} }
@keyframes vaultAwaken { 0%,100%{opacity:.35;transform:translate(-50%,-50%) scale(1)} 50%{opacity:.75;transform:translate(-50%,-50%) scale(1.06)} }
`
// [leftPct, sizePx, durS, delayS, opacity]
const VAULT_MOTES: [number, number, number, number, number][] = [
  [8, 3, 17, 0, 0.5], [22, 4, 22, -6, 0.6], [37, 2, 19, -11, 0.45], [52, 4, 25, -3, 0.62],
  [66, 3, 20, -14, 0.5], [80, 4, 23, -8, 0.58], [92, 2, 18, -2, 0.5],
]

const LockRune = ({ color }: { color: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /><circle cx="12" cy="15.5" r="1.3" />
  </svg>
)

function AncientNiche({ giant, index, caught }: {
  giant: { id: number; name: string; epithet: string; accent: string }; index: number; caught: boolean
}) {
  const a = giant.accent
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      borderRadius: '44px 44px 12px 12px', // arched reliquary niche
      padding: '0.95rem 0.5rem 0.7rem',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: caught
        ? `radial-gradient(ellipse at 50% 118%, ${a}33 0%, rgba(12,9,20,0.86) 56%, rgba(5,4,10,0.97) 100%)`
        : 'radial-gradient(ellipse at 50% 118%, rgba(74,68,104,0.14) 0%, rgba(8,7,14,0.94) 62%)',
      border: `1px solid ${caught ? a + '66' : 'rgba(120,112,150,0.18)'}`,
      borderTop: `1px solid ${caught ? a + 'bb' : 'rgba(150,142,180,0.3)'}`,
      boxShadow: caught ? `inset 0 1px 0 ${a}44, 0 0 22px ${a}26` : 'inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Index numeral — at the arch KEYSTONE (top-center), the one spot the arched
          corners never clip. Top-left sat inside the 44px corner curve and got cut
          off by overflow:hidden. */}
      <span className="font-cinzel font-700" style={{
        position: 'absolute', top: 7, left: '50%', transform: 'translateX(-50%)',
        fontSize: '0.52rem', letterSpacing: '0.14em', lineHeight: 1,
        color: caught ? a : 'rgba(150,142,180,0.4)',
      }}>{ROMAN[index]}</span>

      {/* shimmer sweep on caught niches */}
      {caught && (
        <span aria-hidden style={{
          position: 'absolute', top: 0, bottom: 0, width: '38%', left: 0,
          background: `linear-gradient(90deg, transparent, ${a}22, transparent)`,
          animation: 'vaultShimmer 5.5s ease-in-out infinite', pointerEvents: 'none',
        }} />
      )}

      {/* pedestal + specimen */}
      <div style={{ position: 'relative', width: 78, height: 72, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div aria-hidden style={{
          position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 62, height: 20, borderRadius: '50%',
          background: caught ? `radial-gradient(ellipse, ${a}55 0%, transparent 70%)` : 'radial-gradient(ellipse, rgba(120,112,150,0.18) 0%, transparent 70%)',
          filter: 'blur(2px)',
        }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fishImageUrl(giant.name)} alt={caught ? giant.name : 'Sealed specimen'} loading="lazy" decoding="async"
          style={caught
            ? { position: 'relative', maxWidth: 72, maxHeight: 66, objectFit: 'contain', filter: `drop-shadow(0 3px 14px ${a}88)`, animation: 'vaultFloat 4.2s ease-in-out infinite' }
            : { position: 'relative', maxWidth: 68, maxHeight: 62, objectFit: 'contain', filter: 'brightness(0) opacity(0.72)', animation: 'vaultPulse 3.6s ease-in-out infinite' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>

      <div aria-hidden style={{ width: 30, height: 1, background: `linear-gradient(90deg, transparent, ${caught ? a + '99' : 'rgba(150,142,180,0.3)'}, transparent)` }} />

      {caught ? (
        <>
          <p className="font-cinzel font-700" style={{ fontSize: '0.76rem', color: '#f6f1e8', lineHeight: 1.1, textAlign: 'center', textShadow: `0 0 9px ${a}66` }}>{giant.name}</p>
          <p className="font-karla font-600 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: a }}>{giant.epithet}</p>
        </>
      ) : (
        <>
          <div style={{ color: 'rgba(160,150,190,0.55)' }}><LockRune color="rgba(160,150,190,0.55)" /></div>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: 'rgba(150,142,180,0.5)' }}>Sealed</p>
        </>
      )}
    </div>
  )
}

function VaultOfAncients({ trophies }: { trophies: { id: number; name: string }[] }) {
  const caughtIds = new Set(trophies.map(t => t.id))
  const totalCaught = caughtIds.size
  const fiveSealed = ANCIENT_GIANTS.every(g => caughtIds.has(g.id))
  const megaCaught = caughtIds.has(MEGALODON_GIANT.id)
  const complete = megaCaught // Megalodon is always last, so this === all six

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: complete
        ? 'radial-gradient(ellipse at 50% 0%, rgba(50,20,60,0.94) 0%, rgba(8,5,12,0.98) 72%)'
        : 'radial-gradient(ellipse at 50% 0%, rgba(30,14,44,0.92) 0%, rgba(7,5,11,0.98) 72%)',
      border: `1px solid ${complete ? 'rgba(253,230,138,0.4)' : 'rgba(168,85,247,0.32)'}`,
      borderTop: `1px solid ${complete ? 'rgba(253,230,138,0.6)' : 'rgba(168,85,247,0.5)'}`,
      borderRadius: CARD_RADIUS,
      padding: '1.1rem 0.9rem 1rem',
      boxShadow: `inset 0 1px 0 rgba(253,230,138,0.08), inset 0 0 40px rgba(99,102,241,0.05), 0 0 30px ${complete ? 'rgba(253,230,138,0.14)' : 'rgba(124,58,237,0.14)'}`,
    }}>
      <style dangerouslySetInnerHTML={{ __html: VAULT_CSS }} />

      {/* Completion halo — used to live on the apex plinth; it belongs to the
          whole wall now that the wall is one grid. */}
      {complete && (
        <span aria-hidden style={{
          position: 'absolute', top: '50%', left: '50%', width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(253,230,138,0.14) 0%, transparent 62%)',
          animation: 'vaultAwaken 4.5s ease-in-out infinite', pointerEvents: 'none',
        }} />
      )}

      {/* drifting motes */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {VAULT_MOTES.map(([left, size, dur, delay, op], i) => (
          <span key={i} style={{
            position: 'absolute', bottom: '18%', left: `${left}%`, width: size, height: size, borderRadius: '50%',
            background: i % 2 ? 'rgba(103,232,249,0.7)' : 'rgba(196,181,253,0.7)',
            animation: `vaultMote ${dur}s ease-in-out ${delay}s infinite`, ['--vo' as string]: op,
          } as React.CSSProperties} />
        ))}
      </div>

      {/* header: counter inset on a fading rule */}
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: '1rem' }}>
        <div aria-hidden style={{ position: 'absolute', left: 6, right: 6, top: '50%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(253,230,138,0.4) 50%, transparent)' }} />
        <span className="font-cinzel font-700 uppercase" style={{
          position: 'relative', display: 'inline-block', padding: '0 0.9rem',
          background: complete ? 'rgba(18,8,16,1)' : 'rgba(11,7,14,1)',
          fontSize: '0.58rem', letterSpacing: '0.3em', color: '#fde68a',
        }}>
          {ROMAN[totalCaught]} of VI sealed
        </span>
      </div>

      {/* ALL SIX niches in one grid, three per row — two clean rows. Megalodon
          used to sit under them on its own full-width apex plinth; it is simply
          the sixth niche now, sharing row two with IV and V. Its crimson accent
          and the VI numeral are all the apex distinction the wall needs. */}
      <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 9 }}>
        {ALL_GIANTS.map((g, i) => (
          <div key={g.id} style={{ flex: '0 0 calc(33.333% - 6px)', minWidth: 92 }}>
            <AncientNiche giant={g} index={i + 1} caught={caughtIds.has(g.id)} />
          </div>
        ))}
      </div>

      {/* The payoff the apex plinth used to carry — kept, because finishing the
          wall deserves a line, and the grid alone says nothing. */}
      <p className="font-karla font-400 italic" style={{
        position: 'relative', textAlign: 'center', marginTop: 12,
        fontSize: '0.64rem', lineHeight: 1.4,
        color: complete ? '#fde68a' : 'rgba(254,205,211,0.68)',
      }}>
        {complete
          ? '“Every giant, sealed. The deep keeps nothing back from you now.”'
          : fiveSealed
            ? 'The other five are sealed. The black water will open for you now. Go and take it.'
            : 'Seal the other five giants, and the deep will surrender its oldest.'}
      </p>
    </div>
  )
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

// One shared radius so every section reads as the same designed surface
// instead of a stack of ad-hoc boxes (radii used to jump 12/14/16/20).
const CARD_RADIUS = 18

// Chart-rule section header (badges-page treatment, 2026-07 warmth pass):
// a Cinzel title sitting on a rule that fades out, with an optional line of
// ship's-voice flavor beneath — replaces the old stripe + uppercase sans.
function SectionLabel({ children, color = '#f0c040', flavor }: { children: React.ReactNode; color?: string; flavor?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {children}
        </p>
        <span aria-hidden style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}55, transparent)` }} />
      </div>
      {flavor && (
        <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(230,215,180,0.48)', fontStyle: 'italic', marginTop: 3 }}>{flavor}</p>
      )}
    </div>
  )
}

// Small level pill for the identity header — surfaces both core levels up
// top so the profile reads as an identity, not just an avatar.
function LevelChip({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 5,
      padding: '0.32rem 0.72rem', borderRadius: 999,
      background: `${color}14`, border: `1px solid ${color}3a`,
      fontSize: '0.56rem', color,
    }}>
      {label}
      <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f0ede8', letterSpacing: 0, lineHeight: 1 }}>{value}</span>
    </span>
  )
}

export default function ProfileClient({
  email,
  username: initialUsername,
  usernameChanged: initialChanged,
  crewRoster,
  isPremium,
  level,
  expeditionLevel,
  career,
  shipTier,
  shipName,
  customShipName,
  equippedShipSkin,
  rodTier,
  reelTier,
  hookTier,
  equippedSpecialId,
  ownedSpecialIds,
  equippedSpecial2Id,
  rarestFish,
  prestigeLevels,
  goldenMounts,
  raidItemIds,
  ancientTrophies,
  equippedBoat,
  equippedHat,
  equippedPet,
  characterColor: initialCharacterColor,
  unlockedColors: initialUnlockedColors,
  doubloons: initialDoubloons,
  gems: initialGems,
  equippedBadges: initialEquippedBadges,
  unlockedBadges,
  avatarBgColor: initialAvatarBg,
  avatarBorderColor: initialAvatarBorder,
  unlockedAvatarSpecials: initialUnlockedSpecials,
  initialProfileBg,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [username, setUsername] = useState(initialUsername)
  const [usernameChanged, setUsernameChanged] = useState(initialChanged)
  const [showUsernameForm, setShowUsernameForm] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')

  const [characterColor, setCharacterColor] = useState(initialCharacterColor)
  const [colorSaving, setColorSaving] = useState(false)
  const [skinDetail, setSkinDetail] = useState<string | null>(null) // tapped skin id → detail modal
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
  // Avatar bg + border save on click now (no Save button). Pass the changed
  // value plus the current other one so a single-field tap persists both.
  function saveAvatarBg(hex: string) {
    setAvatarBg(hex)
    void updateAvatarColors({ bgColor: hex, borderColor: avatarBorder })
  }
  function saveAvatarBorder(hex: string) {
    setAvatarBorder(hex)
    void updateAvatarColors({ bgColor: avatarBg, borderColor: hex })
  }
  // Which group the "Profile Look" modal is showing — splits the old long
  // scroll into tabs: character / avatar (bg+border) / page background.
  const [lookTab, setLookTab] = useState<'character' | 'avatar' | 'page'>('character')
  // Main profile page tab — Fishing (angler + catches) vs Navigation (ship +
  // expedition). Shared identity header sits above both.
  const [profileTab, setProfileTab] = useState<'fishing' | 'navigation'>('fishing')
  // LOCAL-ONLY page-background preview (test). Not persisted, not gated, not
  // shown to other users — just lets us eyeball the fishing zone paintings as
  // a profile page backdrop before committing to a saved `profile_bg` column.
  // Page background — zone painting chosen in the avatar modal, persisted to
  // profiles.profile_bg. null = plain page. Unlocks by fishing level.
  const [profileBg, setProfileBg] = useState<string | null>(initialProfileBg)
  const [profileBgSaving, setProfileBgSaving] = useState(false)
  const activeBg = getProfileBackground(profileBg)
  // Scroll-linked pan: these zone paintings are very tall (~1:4), so instead
  // of a fixed crop we pan the cover image's vertical focal point from the top
  // (sky) to the bottom (deep water) as you scroll the page — revealing the
  // whole painting, and getting naturally darker since the art darkens with
  // depth. Driven by a direct ref write in a rAF-throttled scroll handler —
  // NOT React state — so this big component doesn't re-render every scroll tick.
  const bgImgRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!activeBg) return
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
  }, [activeBg])

  // Pick a page background (saves immediately, like the character swatches).
  // Locked zones flash the unlock hint; null clears the background.
  async function selectProfileBg(id: string | null) {
    if (id === profileBg) return
    if (id !== null) {
      const def = getProfileBackground(id)
      if (def && level < def.minLevel) { flashLockMsg(`${def.label} — unlocks at Level ${def.minLevel}`); return }
    }
    setProfileBg(id)
    setProfileBgSaving(true)
    const res = await updateProfileBg(id)
    setProfileBgSaving(false)
    if (res?.error) { setProfileBg(profileBg); flashLockMsg(res.error) }
  }
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

  // Showcase honors the player's explicit pick first; if they haven't
  // featured anyone yet, fall back to whoever's actually on the voyage
  // track (the public-facing roster, sorted captain → crew). Means the
  // section is informative on day one instead of just begging the player
  // to configure it.
  // THE RAID CREW, not a curated pick. This section used to be a manual
  // showcase (showcase_crew_ids) that fell back to the voyage track — so it
  // showed whoever you last chose to brag about, or whoever happened to be out
  // earning doubloons, neither of which is the crew you actually fight with.
  // It now mirrors the raid party straight off raid_slot, in seat order, so it
  // is always current and there is nothing to configure.
  const showcaseCrew = crewRoster
    .filter(c => c.raidSlot != null)
    .sort((a, b) => (a.raidSlot as number) - (b.raidSlot as number))

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

  async function handleBadgeClick(badgeId: string) {
    if (badgeSaving || !unlockedBadges.includes(badgeId)) return
    hapticTap()
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
      {/* Page background — saved zone painting, shown for everyone. Mirrors
          ClientBackground: fixed full-screen image + a per-zone darkening
          scrim. The image's focal point pans with scroll (see effect above). */}
      {activeBg && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={bgImgRef} src={activeBg.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: activeBg.scrim }} />
          {activeBg.id === 'ancient_deep' && <AncientBgEffect />}
        </div>
      )}
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 1.25rem 3rem', position: 'relative', zIndex: 1 }}>

      {/* ── Identity header — banner ── */}
      <div className="flex flex-col items-center" style={{ marginTop: 6, marginBottom: 20, padding: '1.7rem 1.2rem 1.5rem', borderRadius: 24, position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'linear-gradient(180deg, rgba(16,22,34,0.72), rgba(8,12,20,0.42))' }}>
        {/* Dual-tone glow — fishing blue + nav violet. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 65% 55% at 28% -12%, rgba(96,165,250,0.18), transparent 62%), radial-gradient(ellipse 65% 55% at 72% -12%, rgba(192,132,252,0.15), transparent 62%)' }} />
        <div className="flex flex-col items-center" style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        {/* Avatar — equipped character + hat composite. Tap to open the
            Profile Look picker. The pencil badge carries the affordance. */}
        <button
          type="button"
          onClick={() => setAvatarPickerOpen(true)}
          aria-label="Customize avatar"
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            borderRadius: '50%',
            position: 'relative',
            marginBottom: 14,
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
            <p className="font-karla font-300 text-center" style={{ fontSize: '0.65rem', color: '#bbb5ad' }}>
              3–20 chars · letters, numbers, underscores
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
          <>
            {/* Name + Captain badge */}
            <div className="flex items-center justify-center gap-2 flex-wrap" style={{ marginBottom: 11 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f0ede8', lineHeight: 1 }}>{username}</p>
              {isPremium && (
                <span title="Captain" className="flex items-center gap-1 rounded-full" style={{ padding: '0.2rem 0.55rem', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.35)' }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: '#f0c040' }}>Captain</span>
                </span>
              )}
            </div>

            {/* Level chips — both core levels surfaced up top */}
            <div className="flex items-center justify-center gap-2 flex-wrap" style={{ marginBottom: 13 }}>
              <LevelChip color="#60a5fa" label="Fishing Lv" value={level} />
              <LevelChip color="#c084fc" label="Nav Lv" value={expeditionLevel} />
            </div>

            {/* Action pills — rename (if available) + the social links, one row */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {!usernameChanged && (
                <button
                  onClick={() => setShowUsernameForm(true)}
                  className="font-karla font-700 uppercase tracking-[0.1em]"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '0.4rem 0.85rem', borderRadius: 999,
                    background: 'rgba(240,192,64,0.12)',
                    border: '1px solid rgba(240,192,64,0.4)',
                    color: '#f0c040', fontSize: '0.62rem', cursor: 'pointer',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4z"/>
                  </svg>
                  Rename
                </button>
              )}
              <Link
                href="/social"
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '0.4rem 0.85rem', borderRadius: 999,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  textDecoration: 'none', fontSize: '0.62rem', color: '#bbb5ad',
                }}
              >
                Friends ↗
              </Link>
              <Link
                href="/leaderboard"
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '0.4rem 0.85rem', borderRadius: 999,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  textDecoration: 'none', fontSize: '0.62rem', color: '#bbb5ad',
                }}
              >
                Leaderboard ↗
              </Link>
            </div>
          </>
        )}
        </div>
      </div>

      {/* ── Fishing / Navigation tabs (shared) — pill segmented control ── */}
      <div style={{ display: 'flex', gap: 5, padding: 5, margin: '0 auto 22px', maxWidth: 540, width: '100%', background: 'rgba(8,14,24,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999 }}>
        {([['fishing', 'Fishing'], ['navigation', 'Navigation']] as const).map(([id, label]) => {
          const on = profileTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setProfileTab(id)}
              className="font-karla font-700 uppercase tracking-[0.12em]"
              style={{
                flex: 1, padding: '0.62rem 0', borderRadius: 999,
                fontSize: '0.7rem', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
                border: on ? '1px solid rgba(96,165,250,0.55)' : '1px solid transparent',
                background: on ? 'linear-gradient(180deg, rgba(96,165,250,0.24), rgba(96,165,250,0.12))' : 'transparent',
                color: on ? '#dbe9ff' : 'rgba(240,237,232,0.5)',
                boxShadow: on ? '0 2px 10px rgba(96,165,250,0.18)' : 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Fishing tab ── */}
      {profileTab === 'fishing' && (
        <div className="flex flex-col mx-auto w-full" style={{ gap: 24, maxWidth: 540 }}>

          {/* Headline career stats */}
          <div>
            <SectionLabel color="#60a5fa" flavor="What the logbook keeps on you, cast for cast.">Career</SectionLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              <StatTile label="Lines Cast" value={career.fishingCasts.toLocaleString()} color="#60a5fa" />
              <StatTile label="Perfects" value={career.perfects.toLocaleString()} color="#fde68a" />
              <StatTile label="Fish Sold" value={<CoinAmount amount={career.fishSold} />} />
              {career.prestigeTotal > 0 && <StatTile label="Prestige" value={career.prestigeTotal} color="#f0c040" />}
            </div>
          </div>

          {/* Character Loadout + badge picker */}
          <div>
          <SectionLabel color="#60a5fa">Angler &amp; Loadout</SectionLabel>
          <div style={{
            background: 'radial-gradient(ellipse at 50% 90%, rgba(20,50,100,0.22) 0%, transparent 70%)',
            border: '1px solid rgba(80,120,200,0.2)',
            borderRadius: CARD_RADIUS,
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
                      <img key={slot} src={badge.imageUrl} alt={badge.name} loading="lazy" decoding="async" onError={e => { e.currentTarget.style.visibility = 'hidden' }} style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 4 }} />
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
                  <p className="font-karla" style={{ fontSize: '0.56rem', color: '#b4aea6', marginTop: 2 }}>Badges</p>
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#5a5755" strokeWidth="2.5" strokeLinecap="round"
                  style={{ transform: badgePickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>

              {badgePickerOpen && (
                <div style={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}>
                  <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#b4aea6', lineHeight: 1.4, marginBottom: 8 }}>
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
                            <img src={badge.imageUrl} alt={badge.name} loading="lazy" decoding="async" onError={e => { e.currentTarget.style.visibility = 'hidden' }} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                          ) : (
                            <span className="font-karla font-600" style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.55)' }}>Empty</span>
                          )}
                          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: isSelected ? '#f0c040' : 'rgba(255,255,255,0.4)' }}>Slot {slot + 1}</span>
                        </button>
                      )
                    })}
                  </div>
                  {unlockedBadges.length === 0 ? (
                    <p className="font-karla" style={{ fontSize: '0.68rem', color: '#aaa49c' }}>Earn badges by completing achievements.</p>
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
                              <img src={b.imageUrl} alt={b.name} loading="lazy" decoding="async" onError={e => { e.currentTarget.style.visibility = 'hidden' }} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
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
                <img src={charSprites.rest} alt="" loading="lazy" decoding="async" style={{ width: '100%', display: 'block' }} />
                {(() => {
                  const hd = getHat(equippedHat)
                  if (!hd) return null
                  const hp = hd.positions.rest
                  return (
                    <img src={hd.restImageUrl} alt="" loading="lazy" decoding="async" style={{
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
                      <img src={bd.restImageUrl} alt="" loading="lazy" decoding="async" className={boatGlowClass(bd)} style={{ width: '100%', display: 'block' }} />
                    </div>
                  )
                })()}
                {/* Rod — 3-pose rest sprite. Coords mirror CHAR_ROD_OVERLAY.rest
                    in FishingGame so the static profile silhouette matches what
                    the player sees in the actual fishing scene. maxWidth: 'none'
                    overrides Tailwind preflight which would otherwise cap the
                    rod at 100% of the avatar container. */}
                {rod.slug ? (
                  <img src={`/${rod.slug}_rest.png`} alt="" loading="lazy" decoding="async" className={rodGlowClass(rod)} style={{
                    position: 'absolute', top: '37%', left: '-12%', width: '107.5%',
                    transformOrigin: 'center center',
                    pointerEvents: 'none',
                    maxWidth: 'none',
                    ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : {}),
                  } as React.CSSProperties} />
                ) : rod.imageUrl && (
                  <img src={rod.imageUrl} alt="" loading="lazy" decoding="async" className={rodGlowClass(rod)} style={{
                    position: 'absolute', top: '33%', left: '12%', width: '51%',
                    transform: 'rotate(-1deg)', transformOrigin: 'bottom right',
                    pointerEvents: 'none',
                    ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : {}),
                  } as React.CSSProperties} />
                )}
                {/* Reel — mirrors CHAR_REEL_OVERLAY.rest from FishingGame. */}
                {reel.imageUrl && (
                  <img src={reel.imageUrl} alt="" loading="lazy" decoding="async" style={{
                    position: 'absolute', top: '15%', left: '-10.3%', width: '222%',
                    transform: 'rotate(-18deg)', transformOrigin: 'center center',
                    pointerEvents: 'none',
                    maxWidth: 'none',
                  }} />
                )}
                {/* Hook — mirrors CHAR_HOOK_OVERLAY.rest from FishingGame
                    so the profile silhouette matches the live game. */}
                {hook.imageUrl && (
                  <img src={hook.imageUrl} alt="" loading="lazy" decoding="async" className={hookGlowClass(hook)} style={{
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
                    <img key={slot} src={badge.imageUrl} alt={badge.name} loading="lazy" decoding="async" style={{
                      position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
                      width: `${bp.width}%`, transform: `rotate(${bp.rotate}deg)`,
                      transformOrigin: 'center center', pointerEvents: 'none',
                    }} />
                  )
                })}
                {/* Pet — last so it sits in the foreground above every
                    other equipment layer. Mirrors PET_OVERLAY.rest from
                    FishingGame so the profile silhouette matches the
                    live fishing render. */}
                {(() => {
                  const pet = getPet(equippedPet)
                  if (!pet) return null
                  const pp = getPetOverlay(pet.species, 'rest')
                  return (
                    <img src={pet.restImageUrl} alt="" loading="lazy" decoding="async" style={{
                      position: 'absolute', top: `${pp.top}%`, left: `${pp.left}%`,
                      width: `${pp.width}%`,
                      transform: `rotate(${pp.rotate}deg)`,
                      transformOrigin: 'center center',
                      pointerEvents: 'none',
                      filter: `drop-shadow(0 0 6px ${pet.accentColor}55)`,
                    }} />
                  )
                })()}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 0, padding: '8px 20px 0' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: rod.color + 'aa', marginBottom: 3 }}>Rod</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#d8d5d0', lineHeight: 1.2 }}>{rod.name}</p>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 8px', alignSelf: 'stretch' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: 'rgba(96,165,250,0.95)', marginBottom: 3 }}>Fishing Level</p>
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
              display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12,
              padding: '0.4rem 0.75rem 0.4rem 0.5rem', borderRadius: 999,
              background: `${equippedSpecial.color}10`, border: `1px solid ${equippedSpecial.color}30`,
            }}>
              {equippedSpecial.image
                ? <img src={equippedSpecial.image} alt={equippedSpecial.name} loading="lazy" decoding="async" style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 0 6px ${equippedSpecial.color}66)` }} />
                : <div style={{ width: 26, height: 26, borderRadius: 6, background: equippedSpecial.color + '22', flexShrink: 0 }} />
              }
              <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: equippedSpecial.color }}>{equippedSpecial.name}</span>
            </div>
          )}
          </div>

          {/* Tackle — the fishing-side twin of the Arsenal, same rail. */}
          {ownedSpecialIds.length > 0 && (
            <div>
              <SectionLabel color="#60a5fa" flavor="The odd gear you have talked out of the sea.">Tackle</SectionLabel>
              <SpecialTackle items={ownedSpecialIds} equippedIds={[equippedSpecialId, equippedSpecial2Id]} />
            </div>
          )}

          {/* Vault of the Ancients */}
          {ancientTrophies.length > 0 && (
            <div>
              <SectionLabel>Vault of the Ancients</SectionLabel>
              <VaultOfAncients trophies={ancientTrophies} />
            </div>
          )}

          {rarestFish.length > 0 && (
            <div>
              <SectionLabel flavor="Your three rarest trophies from every water you've fished.">Rarest Catches</SectionLabel>
              <RarestCatchesByZone fish={rarestFish} prestige={prestigeLevels} />
            </div>
          )}

          {/* Golden Mounts — the gilded trophy wall */}
          {goldenMounts.length > 0 && (
            <div>
              <SectionLabel color="#fbcc4a" flavor="One-in-a-thousand perfect catches, mounted for good.">Golden Catch</SectionLabel>
              <GoldenMounts fish={goldenMounts} />
            </div>
          )}

        </div>
      )}

      {/* ── Navigation tab ── */}
      {profileTab === 'navigation' && (
        <div className="flex flex-col mx-auto w-full" style={{ gap: 24, maxWidth: 540 }}>

          {/* Headline career stats */}
          <div>
            <SectionLabel color="#c084fc" flavor="Broadsides answered, holds hauled home.">Career</SectionLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              <StatTile label="Raids Won" value={career.raidsCompleted.toLocaleString()} color="#f87171" />
              <StatTile label="Voyage Loot" value={<CoinAmount amount={career.voyageLoot} baseColor="#f0c040" />} />
              <StatTile label="Biggest Hit" value={career.highestRaidDamage.toLocaleString()} color="#fb923c" />
            </div>
          </div>

          {/* Ship Hero */}
          <div>
          <SectionLabel color="#c084fc">Your Ship</SectionLabel>
          <div style={{
            background: `radial-gradient(ellipse at 50% 65%, ${ship.color}1c 0%, transparent 68%)`,
            border: `1px solid ${ship.color}33`,
            borderRadius: CARD_RADIUS,
            padding: '14px 16px 16px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <img
              src={shipSkinDef?.imageByTier?.[shipTier] ?? ship.imageUrl}
              alt={ship.name}
              loading="lazy"
              decoding="async"
              style={{
                width: 210, height: 'auto', maxHeight: 150, objectFit: 'contain',
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
                  Nav Lv {expeditionLevel}
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
          </div>

          {/* The raid party, in seat order. No editor: this mirrors whoever is
              assigned to raids, so it is changed in the Crew Hall, not here. */}
          <div>
            <SectionLabel color="#c084fc">Raid Crew</SectionLabel>
            <FeaturedCrew crew={showcaseCrew} emptyHint="No raid crew assigned yet. Set your party in the Crew Hall." />
          </div>

          {/* Arsenal — collected raid + forge items */}
          {raidItemIds.length > 0 && (
            <div>
              <SectionLabel color="#f0c040">Arsenal</SectionLabel>
              <RaidArsenal items={raidItemIds} />
            </div>
          )}

        </div>
      )}

      {/* ── Settings ── */}
      <div style={{ maxWidth: 540, margin: '32px auto 0' }}>
        <SectionLabel>Settings</SectionLabel>
        <LetOtherAudioPlayToggle />
      </div>

      {/* ── Sign out — compact, centered pill (was a full-width bar) ── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
        <button
          onClick={signOut}
          className="font-karla font-600 uppercase tracking-[0.14em]"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '0.55rem 1.3rem',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 999, cursor: 'pointer',
            fontSize: '0.7rem', color: '#bbb5ad',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign Out
        </button>
      </div>

      {/* ── Showcase picker modal ── */}

      {/* ── Profile Look picker ── */}
      <PopupShell open={avatarPickerOpen} onClose={() => setAvatarPickerOpen(false)} zIndex={90} backdropColor="rgba(2,5,10,0.82)">
          <div
            onClick={e => e.stopPropagation()}
            style={{
              margin: 'auto',
              background: 'linear-gradient(180deg, #0c1626 0%, #06101c 100%)',
              border: '1px solid rgba(96,165,250,0.2)',
              borderRadius: CARD_RADIUS,
              width: '100%', maxWidth: 360,
              // Fixed height (capped to the available space) so the modal does
              // NOT resize when switching tabs — only the scrollable body's
              // content changes. Flex column: body takes the overflow + scrolls,
              // the footer stays pinned. PopupShell already insets for the Nav +
              // tab bar, so 100% here is the safe available height.
              height: 'min(600px, 100%)',
              maxHeight: '100%',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
              position: 'relative',
            }}
          >
            {/* Close (X) */}
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }}>
              <ModalCloseButton onClick={() => setAvatarPickerOpen(false)} />
            </div>

            {/* Scrollable body */}
            <div style={{
              flex: 1, minHeight: 0,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              padding: '1.1rem 1rem 1.3rem',
            }}>
            {/* Live preview */}
            <div className="flex flex-col items-center justify-center" style={{ marginBottom: 14 }}>
              <CharacterAvatar
                characterColor={characterColor}
                equippedHat={equippedHat}
                size={92}
                bgColor={avatarBg ?? DEFAULT_AVATAR_BG_COLOR}
                ringColor={avatarBorder ?? DEFAULT_AVATAR_BORDER_COLOR}
              />
              {lookTab === 'avatar' && (
                <span className="font-karla" style={{ marginTop: 7, fontSize: '0.56rem', letterSpacing: '0.06em', color: 'rgba(240,237,232,0.42)' }}>
                  Tap a swatch to try it on
                </span>
              )}
            </div>

            <p className="font-cinzel font-700 text-center" style={{ fontSize: '1.05rem', color: '#f0ede8', marginBottom: 12 }}>
              Profile Look
            </p>

            {/* Tab bar — splits the three groups so the modal isn't one long
                scroll: Character / Avatar (bg + border) / Page background. */}
            <div style={{ display: 'flex', gap: 4, padding: 4, marginBottom: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
              {([['character', 'Character'], ['avatar', 'Avatar'], ['page', 'Page']] as const).map(([id, label]) => {
                const on = lookTab === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLookTab(id)}
                    className="font-karla font-700 uppercase tracking-[0.08em]"
                    style={{
                      flex: 1, padding: '0.5rem 0', borderRadius: 9,
                      fontSize: '0.62rem',
                      cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
                      border: on ? '1px solid rgba(96,165,250,0.55)' : '1px solid transparent',
                      background: on ? 'rgba(96,165,250,0.16)' : 'transparent',
                      color: on ? '#cfe2ff' : 'rgba(240,237,232,0.55)',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {lookTab === 'character' && (<>
            {/* Character swatches — saves immediately on click (same as the
                old standalone picker), so the live preview above updates as
                soon as the player taps. Background/border still batch into
                the Save button below. */}
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', color: '#7a9bc4', letterSpacing: '0.14em', marginBottom: 6 }}>
              Character
            </p>
            {/* Grouped: free starters · earned through play · bought with currency. */}
            {([
              { label: 'Starter', items: CHARACTER_COLORS.filter(c => c.free) },
              { label: 'Earnable', items: CHARACTER_COLORS.filter(c => !c.free && !(c.price || c.gemPrice)) },
              { label: 'Purchasable', items: CHARACTER_COLORS.filter(c => !!(c.price || c.gemPrice)) },
            ] as const).map(group => group.items.length === 0 ? null : (
              <div key={`char-grp-${group.label}`} style={{ marginBottom: 12 }}>
                <p className="font-karla font-600 uppercase" style={{ fontSize: '0.56rem', color: '#8a8272', letterSpacing: '0.12em', marginBottom: 5 }}>
                  {group.label}
                </p>
                <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                  {group.items.map(c => {
                    const sprites = getCharacterSprites(c.id)
                    const isActive = characterColor === c.id
                    const isUnlocked = unlockedColors.includes(c.id)
                    return (
                      <button
                        key={`char-${c.id}`}
                        type="button"
                        onClick={() => setSkinDetail(c.id)}
                        aria-label={`Character ${c.name}${!isUnlocked ? ' (locked)' : ''}`}
                        style={{ flex: '0 0 auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, appearance: 'none', WebkitAppearance: 'none' }}
                      >
                        <div style={{ position: 'relative', width: 76, height: 76 }}>
                          <div style={{
                            width: 76, height: 76, borderRadius: '50%', overflow: 'hidden',
                            backgroundImage: `url(${sprites.rest})`,
                            backgroundSize: '420% auto', backgroundPosition: '60% 68%', backgroundRepeat: 'no-repeat',
                            border: isActive ? '2.5px solid #f0c040' : '1px solid rgba(255,255,255,0.18)',
                            boxShadow: isActive ? '0 0 12px rgba(240,192,64,0.4)' : 'none',
                            opacity: isUnlocked ? 1 : 0.5,
                          }} />
                          {!isUnlocked && (
                            <div style={{ position: 'absolute', right: 0, bottom: 2, width: 22, height: 22, borderRadius: '50%', background: 'rgba(12,14,18,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.4" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                            </div>
                          )}
                          {isActive && (
                            <div style={{ position: 'absolute', right: 0, bottom: 2, width: 22, height: 22, borderRadius: '50%', background: '#f0c040', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1a1206" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          )}
                        </div>
                        <p className="font-karla font-600" style={{ fontSize: '0.56rem', color: isActive ? '#f0c040' : '#8a877e', maxWidth: 84, textAlign: 'center', whiteSpace: 'nowrap' }}>{c.name}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            </>)}

            {lookTab === 'avatar' && (<>
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
                      if (locked) { flashLockMsg('Captain-only color'); return }
                      saveAvatarBg(c.hex)
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
                          flashLockMsg(`${s.label} — Captain-only`)
                          return
                        }
                        setPurchaseError(null)
                        setPurchasePrompt({ kind: 'special', id: s.id, name: s.label, price: s.gemPrice, currency: 'gems' })
                        return
                      }
                      saveAvatarBg(s.hex)
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
                      if (locked) { flashLockMsg('Captain-only color'); return }
                      saveAvatarBorder(c.hex)
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
                          flashLockMsg(`${s.label} — Captain-only`)
                          return
                        }
                        setPurchaseError(null)
                        setPurchasePrompt({ kind: 'special', id: s.id, name: s.label, price: s.gemPrice, currency: 'gems' })
                        return
                      }
                      saveAvatarBorder(s.hex)
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
            </>)}

            {lookTab === 'page' && (<>
            {/* Page Background — full-page zone painting, unlocks by fishing
                level. Saves immediately on tap (like the character swatches). */}
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', color: '#7a9bc4', letterSpacing: '0.14em', marginBottom: 6 }}>
              Page Background
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {/* None */}
              <button
                type="button"
                disabled={profileBgSaving}
                onClick={() => selectProfileBg(null)}
                aria-label="No page background"
                title="None"
                style={{
                  position: 'relative', width: '100%', aspectRatio: '16 / 10',
                  borderRadius: 10, overflow: 'hidden', padding: 0,
                  cursor: profileBgSaving ? 'default' : 'pointer',
                  border: profileBg === null ? '2px solid #f0c040' : '1px solid rgba(255,255,255,0.18)',
                  background: 'linear-gradient(45deg, rgba(255,255,255,0.12) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.12) 75%, transparent 75%, transparent)',
                  backgroundSize: '8px 8px',
                  appearance: 'none', WebkitAppearance: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.56rem', color: 'rgba(240,237,232,0.7)' }}>None</span>
              </button>
              {PROFILE_BACKGROUNDS.map(bg => {
                const isActive = profileBg === bg.id
                const locked = level < bg.minLevel
                return (
                  <button
                    key={bg.id}
                    type="button"
                    disabled={profileBgSaving}
                    onClick={() => selectProfileBg(bg.id)}
                    aria-label={`Background ${bg.label}${locked ? ` (unlocks at level ${bg.minLevel})` : ''}`}
                    title={locked ? `${bg.label} — unlocks at Level ${bg.minLevel}` : bg.label}
                    style={{
                      position: 'relative', width: '100%', aspectRatio: '16 / 10',
                      borderRadius: 10, overflow: 'hidden', padding: 0,
                      cursor: profileBgSaving ? 'default' : 'pointer',
                      border: isActive ? '2px solid #f0c040' : '1px solid rgba(255,255,255,0.18)',
                      appearance: 'none', WebkitAppearance: 'none',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={bg.src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block',
                        filter: locked ? 'grayscale(0.6) brightness(0.45)' : undefined,
                      }}
                    />
                    {/* Label strip */}
                    <span style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0,
                      padding: '0.45rem 0.35rem 0.2rem',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
                      textAlign: 'left',
                    }}>
                      <span className="font-karla font-700" style={{ fontSize: '0.54rem', color: '#f0ede8', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{bg.label}</span>
                    </span>
                    {locked && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.9)' }}>Lv {bg.minLevel}</span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            </>)}

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
                <BecomeCaptainButton label="Unlock more as a Captain" />
              ) : null}
            </div>

            </div>
          </div>
      </PopupShell>

      {/* ── Purchase confirmation ── */}
      {/* Skin detail — tap a thumbnail to equip, buy, or see how it unlocks. */}
      <PopupShell open={!!skinDetail} onClose={() => setSkinDetail(null)} zIndex={115} anyKey backdropColor="rgba(2,5,10,0.8)">
        {skinDetail && (() => {
          const c = CHARACTER_COLORS.find(x => x.id === skinDetail)
          if (!c) return null
          const sprites = getCharacterSprites(c.id)
          const owned = unlockedColors.includes(c.id)
          const equipped = characterColor === c.id
          const purchasable = !owned && !!(c.price || c.gemPrice)
          const price = c.gemPrice ?? c.price
          const glyph = c.gemPrice ? '◆' : '⟡'
          const ACCENT = '#60a5fa'
          return (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                margin: 'auto', width: '100%', maxWidth: 300, textAlign: 'center',
                padding: '1.5rem 1.4rem', borderRadius: 20,
                background: 'linear-gradient(160deg, rgba(12,18,28,0.99) 0%, rgba(6,10,16,0.99) 100%)',
                border: `1px solid ${ACCENT}55`, borderTop: `3px solid ${ACCENT}`,
                boxShadow: `0 20px 70px rgba(0,0,0,0.6), 0 0 40px ${ACCENT}18`,
              }}
            >
              <div style={{ width: 120, height: 120, borderRadius: '50%', margin: '0 auto 0.9rem', backgroundImage: `url(${sprites.rest})`, backgroundSize: '420% auto', backgroundPosition: '60% 68%', backgroundRepeat: 'no-repeat', border: `2px solid ${ACCENT}66`, boxShadow: `0 0 26px ${ACCENT}33` }} />
              <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: ACCENT, lineHeight: 1.1, marginBottom: '1rem' }}>{c.name}</p>
              {equipped ? (
                <div className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.72rem', color: '#4ade80', padding: '0.7rem', borderRadius: 12, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.35)' }}>✓ Equipped</div>
              ) : owned ? (
                <button onClick={async () => { setColorSaving(true); setCharacterColor(c.id); setSkinDetail(null); await updateCharacterColor(c.id); setColorSaving(false) }} className="font-cinzel font-700" style={{ width: '100%', padding: '0.72rem', borderRadius: 12, fontSize: '0.9rem', cursor: 'pointer', background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.55)', color: '#cfe2ff' }}>Equip</button>
              ) : purchasable ? (
                <button onClick={() => { setSkinDetail(null); setPurchaseError(null); setPurchasePrompt({ kind: 'skin', id: c.id, name: c.name, price: price!, currency: c.gemPrice ? 'gems' : 'doubloons' }) }} className="font-cinzel font-700" style={{ width: '100%', padding: '0.72rem', borderRadius: 12, fontSize: '0.9rem', cursor: 'pointer', background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.55)', color: '#cfe2ff' }}>Buy for {price!.toLocaleString()} {glyph}</button>
              ) : (
                <div style={{ padding: '0.8rem', borderRadius: 12, background: 'rgba(196,169,106,0.08)', border: '1px solid rgba(196,169,106,0.28)' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: 'rgba(196,169,106,0.75)', marginBottom: '0.4rem' }}>How to unlock</p>
                  <p className="font-karla font-600" style={{ fontSize: '0.82rem', color: '#e0d2ad', lineHeight: 1.4 }}>{c.unlockHint ?? 'Locked'}</p>
                </div>
              )}
              <p className="font-karla font-400" style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.22)', marginTop: '0.9rem' }}>Tap anywhere to close</p>
            </div>
          )
        })()}
      </PopupShell>

      <PopupShell open={!!purchasePrompt} onClose={() => { if (!purchasing) setPurchasePrompt(null) }} zIndex={120} backdropColor="rgba(2,5,10,0.8)">
        {purchasePrompt && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              margin: 'auto',
              background: 'linear-gradient(180deg, #1a1408 0%, #0c0a06 100%)',
              border: '1px solid rgba(240,192,64,0.35)',
              borderRadius: CARD_RADIUS,
              padding: '1.25rem 1.1rem 1rem',
              width: '100%', maxWidth: 320,
              boxShadow: '0 18px 60px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(240,192,64,0.08)',
            }}
          >
            {(() => {
              const sp = purchasePrompt.kind === 'special' ? AVATAR_SPECIALS.find(s => s.id === purchasePrompt.id) : null
              const title = sp ? `Buy ${purchasePrompt.name} ${sp.kind === 'bg' ? 'Background' : 'Border'}` : `Buy ${purchasePrompt.name} Skin`
              return (
                <>
                  <p className="font-cinzel font-700 text-center" style={{ fontSize: '1.05rem', color: '#f0c040', marginBottom: sp ? 12 : 6 }}>
                    {title}
                  </p>
                  {/* See it on your own avatar before spending — the whole point of
                      the preview. Applies the pending bg/border, keeps everything
                      else as it's saved. */}
                  {sp && (
                    <div className="flex flex-col items-center" style={{ marginBottom: 14 }}>
                      <CharacterAvatar
                        characterColor={characterColor}
                        equippedHat={equippedHat}
                        size={100}
                        bgColor={sp.kind === 'bg' ? sp.hex : (avatarBg ?? DEFAULT_AVATAR_BG_COLOR)}
                        ringColor={sp.kind === 'border' ? sp.hex : (avatarBorder ?? DEFAULT_AVATAR_BORDER_COLOR)}
                      />
                      <span className="font-karla" style={{ marginTop: 8, fontSize: '0.56rem', letterSpacing: '0.06em', color: 'rgba(240,237,232,0.5)' }}>
                        Here&apos;s how it looks on you
                      </span>
                    </div>
                  )}
                </>
              )
            })()}
            <p className="font-karla text-center" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.75)', lineHeight: 1.5, marginBottom: 14 }}>
              {purchasePrompt.price.toLocaleString()} {purchasePrompt.currency === 'gems' ? '◆' : '⟡'} — yours forever once bought.
            </p>
            <p className="font-karla text-center" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.85)', marginBottom: 14 }}>
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
                    // Wear it right away — you just previewed it, so land on it
                    // applied instead of making them hunt the swatch again.
                    const boughtSp = AVATAR_SPECIALS.find(s => s.id === purchasePrompt.id)
                    if (boughtSp) { boughtSp.kind === 'bg' ? saveAvatarBg(boughtSp.hex) : saveAvatarBorder(boughtSp.hex) }
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
        )}
      </PopupShell>
    </div>
    </>
  )
}

// One consistent round close button for every profile modal.
function ModalCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      style={{
        flexShrink: 0, width: 32, height: 32, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '50%',
        color: 'rgba(240,237,232,0.78)',
        cursor: 'pointer',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
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

// Audio session preference — lets the player keep Spotify / Apple Music
// playing while Small Fishes is open, at the cost of all in-game audio
// (the `<audio>`-element session keepers in fishingMusic + tideRunAudio
// are what hold iOS's playback session and steal it from other apps).
// Read-on-mount so the toggle reflects the persisted choice; the setter
// releases any active session immediately on flip so the player doesn't
// have to leave the page to hear their other music start.
function LetOtherAudioPlayToggle() {
  const [allow, setAllow] = useState(false)

  useEffect(() => {
    // Lazy-load the audio-session module client-side so this component
    // (rendered inside a server-rendered tree) doesn't pull lib code at
    // build time. The module reads from localStorage on first call.
    import('@/lib/audioSession').then(m => setAllow(m.getLetOtherAudioPlay()))
  }, [])

  function toggle() {
    const next = !allow
    setAllow(next)
    import('@/lib/audioSession').then(m => m.setLetOtherAudioPlay(next))
    if (next) {
      // Active release — stop any in-flight session keepers so Spotify
      // can take over the audio focus without the player leaving the page.
      import('@/lib/fishingMusic').then(m => m.fadeOutFishingMusic(0)).catch(() => {})
      import('@/lib/tideRunAudio').then(m => m.teardownTideRunAudio()).catch(() => {})
    }
  }

  return (
    <div style={{
      maxWidth: 540, margin: '0 auto',
      padding: '0.95rem 1.1rem',
      background: 'rgba(8,13,22,0.5)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 18,
    }}>
      <button
        type="button" onClick={toggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          textAlign: 'left', color: 'inherit',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#e8e3d8' }}>
            Let other apps play music
          </p>
          <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8a8680', lineHeight: 1.4, marginTop: 3 }}>
            Silences in-game music and sound effects so Spotify, Apple Music, or podcasts can keep playing.
          </p>
        </div>
        <span aria-hidden style={{
          flexShrink: 0,
          width: 38, height: 22, borderRadius: 999,
          background: allow ? 'rgba(96,165,250,0.7)' : 'rgba(255,255,255,0.12)',
          border: `1px solid ${allow ? 'rgba(96,165,250,0.9)' : 'rgba(255,255,255,0.2)'}`,
          position: 'relative',
          transition: 'background 0.15s, border-color 0.15s',
        }}>
          <span style={{
            position: 'absolute', top: 2, left: allow ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: '#f0ede8',
            transition: 'left 0.15s',
          }} />
        </span>
      </button>
    </div>
  )
}
