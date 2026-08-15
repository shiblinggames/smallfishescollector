'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { type ShowcaseCrew } from '@/components/CrewShowcase'
import { addCrewMember, removeCrewMember } from '@/app/(app)/social/actions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel } from '@/lib/expeditionLevel'
import { getHook, hookGlowClass } from '@/lib/hooks'
import { getRod, rodGlowClass } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getShip } from '@/lib/ships'
import { getShipSkin } from '@/lib/shipSkins'
import { ROUTE_CONFIGS } from '@/lib/voyageRoutes'
import { getCharacterSprites } from '@/lib/characters'
import { getBoat, boatGlowClass } from '@/lib/boats'
import { getHat } from '@/lib/hats'
import { getPet, getPetOverlay } from '@/lib/pets'
import { SPECIAL_ITEMS, effectiveSpecialDef, type SpecialItemId } from '@/lib/specialItems'
import { BADGE_MAP, BADGE_SLOT_POSITIONS, type BadgeFrame } from '@/lib/badges'
import CharacterAvatar from '@/components/CharacterAvatar'
import { DEFAULT_AVATAR_BG_COLOR, DEFAULT_AVATAR_BORDER_COLOR } from '@/lib/avatarColors'
import { getProfileBackground } from '@/lib/profileBackgrounds'
import AncientBgEffect from '@/components/AncientBgEffect'
import { StatTile, CoinAmount } from '@/components/ProfileStats'
import { RarestCatchesByZone, FeaturedCrew, RaidArsenal, GoldenMounts, SpecialTackle, type GoldenMount } from '@/components/ProfileShowcase'
import type { CareerStats } from '@/lib/careerStats'

export interface VoyageEntry {
  id: number
  route: string
  status: 'revealed'
  total_doubloons: number
  total_gems: number
  crew_lost: number[]
  created_at: string
  captains_log: string | null
}

interface Stats {
  uniqueSpecies: number
  fishingXP: number
  expeditionXP: number
  highestPerfectStreak: number
}

interface Gear {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  shipTier: number
  shipName: string | null
  equippedShipSkin?: string | null
}

interface Props {
  username: string
  showcaseCrew: ShowcaseCrew[]
  stats: Stats
  gear: Gear
  rarestFish: { id: number; name: string; bite_rarity: number; habitat?: string; sell_value?: number }[]
  prestigeLevels: Record<string, number>
  goldenMounts: GoldenMount[]
  equippedBoat?: string | null
  equippedHat?: string | null
  equippedPet?: string | null
  raidItemIds?: string[]
  equippedShipSkin?: string | null
  voyages?: VoyageEntry[]
  isPremium?: boolean
  isOwnProfile?: boolean
  isInCrew?: boolean
  characterColor?: string
  equippedSpecialId?: string | null
  ownedSpecialIds?: string[]
  equippedSpecial2Id?: string | null
  equippedBadges?: string[]
  /** Saved portrait colors — match the avatar on /profile. */
  avatarBg?: string | null
  avatarBorder?: string | null
  /** Saved page background (zone id) — matches /profile. */
  profileBg?: string | null
  career: CareerStats
}

// Kept in sync with /profile (ProfileClient): one card radius, the gold-bar
// SectionLabel, and the identity LevelChip so the public page reads identically.
const CARD_RADIUS = 18

// Chart-rule section header (badges-page treatment, 2026-07 warmth pass):
// a Cinzel title on a fading rule + optional ship's-voice flavor line.
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

export default function ProfileClient({ username, showcaseCrew, voyages, stats, gear, rarestFish, prestigeLevels, goldenMounts, raidItemIds = [], equippedShipSkin, isPremium, isOwnProfile, isInCrew: initialIsInCrew, characterColor = 'default', equippedSpecialId, ownedSpecialIds = [], equippedSpecial2Id = null, equippedBadges = [], equippedBoat = null, equippedHat = null, equippedPet = null, avatarBg = null, avatarBorder = null, profileBg = null, career }: Props) {
  const [inCrew, setInCrew] = useState(initialIsInCrew ?? false)
  const [crewPending, startCrewTransition] = useTransition()
  const [expandedVoyage, setExpandedVoyage] = useState<number | null>(null)
  const [showAllVoyages, setShowAllVoyages] = useState(false)
  const [profileTab, setProfileTab] = useState<'fishing' | 'navigation'>('fishing')

  const fishingLevel = getLevelFromXP(stats.fishingXP)
  const expLevel = getExpeditionLevel(stats.expeditionXP)

  const rod  = getRod(gear.rodTier)
  const reel = getReel(gear.reelTier)
  const hook = getHook(gear.hookTier)
  const ship = getShip(gear.shipTier)
  const shipSkin = equippedShipSkin ? getShipSkin(equippedShipSkin) : null
  const charSprites = getCharacterSprites(characterColor)
  const equippedSpecial = effectiveSpecialDef(equippedSpecialId, ownedSpecialIds as SpecialItemId[]) ?? null

  // Page background — the profile owner's saved zone painting (read-only here).
  // Same render as /profile: fixed image + scrim, focal point pans with scroll
  // via a rAF-throttled ref write (no per-scroll React re-render).
  const activeBg = getProfileBackground(profileBg)
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

  // Briefly true right after a successful add, so the button can flash a clear
  // "Added" confirmation before settling into its steady "Friends" state — the
  // tap otherwise gave no feedback that it landed.
  const [justAdded, setJustAdded] = useState(false)
  const justAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function toggleCrew() {
    if (crewPending) return
    // Optimistic: flip immediately so the tap feels instant, then reconcile with
    // the server and roll back if it actually failed.
    const wasIn = inCrew
    if (navigator.vibrate) navigator.vibrate(wasIn ? 12 : [0, 18, 40, 22])
    setInCrew(!wasIn)
    if (!wasIn) {
      setJustAdded(true)
      if (justAddedTimer.current) clearTimeout(justAddedTimer.current)
      justAddedTimer.current = setTimeout(() => setJustAdded(false), 1600)
    } else {
      setJustAdded(false)
    }
    startCrewTransition(async () => {
      const res = wasIn ? await removeCrewMember(username) : await addCrewMember(username)
      if (res?.error) {
        // Roll back the optimistic flip on failure.
        setInCrew(wasIn)
        setJustAdded(false)
      }
    })
  }
  useEffect(() => () => { if (justAddedTimer.current) clearTimeout(justAddedTimer.current) }, [])

  const visibleVoyages = showAllVoyages ? (voyages ?? []) : (voyages ?? []).slice(0, 1)
  const hiddenCount = (voyages?.length ?? 0) - 1

  return (
    <>
      {/* Page background — owner's saved zone painting, shown to visitors too.
          Mirrors ClientBackground: fixed full-screen image + scrim. */}
      {activeBg && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={bgImgRef} src={activeBg.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: activeBg.scrim }} />
          {activeBg.id === 'ancient_deep' && <AncientBgEffect />}
        </div>
      )}
    <div className="flex flex-col max-w-4xl mx-auto px-5" style={{ gap: 0, paddingBottom: 48, position: 'relative', zIndex: 1 }}>

      {/* ── Header — identity banner ── */}
      <div className="flex flex-col items-center" style={{ marginTop: 6, marginBottom: 20, padding: '1.7rem 1.2rem 1.5rem', borderRadius: 24, position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'linear-gradient(180deg, rgba(16,22,34,0.72), rgba(8,12,20,0.42))' }}>
        {/* Dual-tone glow — fishing blue + nav violet, the two disciplines. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 65% 55% at 28% -12%, rgba(96,165,250,0.18), transparent 62%), radial-gradient(ellipse 65% 55% at 72% -12%, rgba(192,132,252,0.15), transparent 62%)' }} />
        <div className="flex flex-col items-center" style={{ position: 'relative', zIndex: 1, width: '100%' }}>
          {/* Portrait — same composite (character + hat + bg + border) used on
              /profile and in the desktop Nav avatar. */}
          <CharacterAvatar
            characterColor={characterColor}
            equippedHat={equippedHat}
            size={132}
            bgColor={avatarBg ?? DEFAULT_AVATAR_BG_COLOR}
            ringColor={avatarBorder ?? DEFAULT_AVATAR_BORDER_COLOR}
          />

          <div className="flex items-center justify-center gap-2 flex-wrap" style={{ marginTop: 14, marginBottom: 11 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.7rem', color: '#f5f2ec', lineHeight: 1 }}>{username}</p>
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
          <div className="flex items-center justify-center gap-2 flex-wrap" style={{ marginBottom: isOwnProfile ? 0 : 13 }}>
            <LevelChip color="#60a5fa" label="Fishing Lv" value={fishingLevel} />
            <LevelChip color="#c084fc" label="Nav Lv" value={expLevel} />
          </div>

          {!isOwnProfile && (
            <button
              type="button"
              onClick={toggleCrew}
              aria-pressed={inCrew}
              className="tap flex items-center justify-center gap-1.5 rounded-full font-karla font-700 uppercase tracking-[0.1em]"
              style={{
                padding: '0.62rem 1.3rem', fontSize: '0.66rem', minWidth: 150, lineHeight: 1,
                cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
                touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                transition: 'background 0.18s, border-color 0.18s, color 0.18s',
                background: justAdded ? 'rgba(74,222,128,0.22)' : inCrew ? 'rgba(74,222,128,0.1)' : 'rgba(96,165,250,0.14)',
                border: `1px solid ${justAdded ? 'rgba(74,222,128,0.6)' : inCrew ? 'rgba(74,222,128,0.3)' : 'rgba(96,165,250,0.45)'}`,
                color: inCrew ? '#4ade80' : '#9cc4ff',
                boxShadow: justAdded ? '0 0 16px rgba(74,222,128,0.35)' : 'none',
              }}
            >
              {inCrew ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" /></svg>
                  {justAdded ? 'Added' : 'Friends'}
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}><path d="M12 5v14M5 12h14" /></svg>
                  Add Friend
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Fishing / Navigation tabs — pill segmented control ── */}
      <div style={{ display: 'flex', gap: 5, padding: 5, margin: '0 auto 22px', maxWidth: 540, width: '100%', background: 'rgba(8,14,24,0.6)', border: '1px solid rgba(196,169,106,0.2)', borderRadius: 999 }}>
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
            <SectionLabel color="#60a5fa" flavor="What the logbook keeps on this captain, cast for cast.">Career</SectionLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              <StatTile label="Lines Cast" value={career.fishingCasts.toLocaleString()} color="#60a5fa" />
              <StatTile label="Perfects" value={career.perfects.toLocaleString()} color="#fde68a" />
              <StatTile label="Fish Sold" value={<CoinAmount amount={career.fishSold} />} />
              {career.prestigeTotal > 0 && <StatTile label="Prestige" value={career.prestigeTotal} color="#f0c040" />}
            </div>
          </div>

          {/* Character Loadout */}
          <div>
          <SectionLabel color="#60a5fa">Angler &amp; Loadout</SectionLabel>
          <div style={{
            background: 'radial-gradient(ellipse at 50% 90%, rgba(20,50,100,0.22) 0%, transparent 70%)',
            border: '1px solid rgba(80,120,200,0.2)',
            borderRadius: CARD_RADIUS,
            overflow: 'hidden',
            paddingBottom: 14,
          }}>
            <div style={{
              position: 'relative',
              width: '100%',
              height: 160, marginTop: 8,
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
                    in FishingGame so the static silhouette matches the live game. */}
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
                {/* Reel — mirrors CHAR_REEL_OVERLAY.rest. */}
                {reel.imageUrl && (
                  <img src={reel.imageUrl} alt="" loading="lazy" decoding="async" style={{
                    position: 'absolute', top: '15%', left: '-10.3%', width: '222%',
                    transform: 'rotate(-18deg)', transformOrigin: 'center center',
                    pointerEvents: 'none',
                    maxWidth: 'none',
                  }} />
                )}
                {/* Hook — mirrors CHAR_HOOK_OVERLAY.rest from FishingGame. */}
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
                {/* Pet — last so it sits foreground over everything,
                    matching the FishingGame stack order. */}
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
                <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#60a5fa', lineHeight: 1.2 }}>{fishingLevel}</p>
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
              <SectionLabel color="#60a5fa" flavor="The odd gear they have talked out of the sea.">Tackle</SectionLabel>
              <SpecialTackle items={ownedSpecialIds} equippedIds={[equippedSpecialId ?? null, equippedSpecial2Id]} />
            </div>
          )}

          {/* Rarest Catches — top 3 per zone, a trophy room by depth */}
          {rarestFish.length > 0 && (
            <div>
              <SectionLabel flavor="The three rarest trophies from every water they've fished.">Rarest Catches</SectionLabel>
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
              src={shipSkin?.imageByTier?.[gear.shipTier] ?? ship.imageUrl}
              alt={ship.name}
              loading="lazy"
              decoding="async"
              style={{
                width: 210, height: 'auto', maxHeight: 150,
                objectFit: 'contain',
                filter: shipSkin
                  ? shipSkin.filter
                  : `drop-shadow(0 4px 28px ${ship.color}60)`,
              }}
            />
            <div style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: ship.color, lineHeight: 1.2 }}>
                {gear.shipName ?? ship.name}
              </p>
              <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: ship.color + '70', marginTop: 5 }}>
                {ship.name}
              </p>
              {expLevel > 0 && (
                <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: '#60a5fa', marginTop: 5 }}>
                  Nav Lv {expLevel}
                </p>
              )}
              {shipSkin && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '0.25rem 0.65rem', borderRadius: '2rem', background: shipSkin.color + '18', border: `1px solid ${shipSkin.color}40` }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill={shipSkin.color} stroke="none">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: shipSkin.color }}>
                    {shipSkin.name}
                  </span>
                </div>
              )}
            </div>
          </div>
          </div>

          {/* The player's raid party, in seat order. */}
          {showcaseCrew.length > 0 && (
            <div>
              <SectionLabel color="#c084fc">Raid Crew</SectionLabel>
              <FeaturedCrew crew={showcaseCrew} />
            </div>
          )}

          {/* Arsenal — collected raid + forge items */}
          {raidItemIds.length > 0 && (
            <div>
              <SectionLabel color="#f0c040">Arsenal</SectionLabel>
              <RaidArsenal items={raidItemIds} />
            </div>
          )}

          {/* Voyages */}
          {voyages && voyages.length > 0 && (
            <div>
              <SectionLabel color="#c084fc">Voyages</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleVoyages.map(v => {
                  const routeConfig = ROUTE_CONFIGS[v.route as keyof typeof ROUTE_CONFIGS]
                  const crewLostCount = (v.crew_lost ?? []).length
                  const date = new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  const preview = v.captains_log
                    ? (v.captains_log.split(/(?<=[.!?])\s/)[0] ?? v.captains_log)
                    : null
                  const isExpanded = expandedVoyage === v.id

                  return (
                    <div
                      key={v.id}
                      style={{
                        background: 'linear-gradient(180deg, rgba(34,26,12,0.6), rgba(18,13,7,0.72))',
                        border: '1px solid rgba(196,169,106,0.2)',
                        borderRadius: 12, overflow: 'hidden',
                      }}
                    >
                      <button
                        onClick={() => setExpandedVoyage(isExpanded ? null : v.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '0.95rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#f0ede8' }}>
                              {routeConfig?.name ?? v.route}
                            </p>
                            {crewLostCount > 0 && (
                              <span style={{
                                fontSize: '0.6rem', padding: '0.15rem 0.45rem', borderRadius: '2rem',
                                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
                                color: '#f87171', fontFamily: 'var(--font-karla)', fontWeight: 700,
                                textTransform: 'uppercase' as const, letterSpacing: '0.1em',
                              }}>
                                {crewLostCount} lost
                              </span>
                            )}
                          </div>
                          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#c4bfb7', marginTop: 4 }}>
                            {date}
                            {v.total_doubloons > 0 ? ` · +${v.total_doubloons.toLocaleString()} ⟡` : ''}
                            {v.total_gems > 0 ? ` · +${v.total_gems} gems` : ''}
                          </p>
                          {preview && !isExpanded && (
                            <p className="font-karla" style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'rgba(255,255,255,0.6)', marginTop: 5, lineHeight: 1.55 }}>
                              {preview}
                            </p>
                          )}
                        </div>
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2.5" strokeLinecap="round"
                          style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                        >
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>

                      {isExpanded && v.captains_log && (
                        <div style={{ padding: '0 1rem 1rem', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.62rem', color: 'rgba(214,162,74,0.92)', marginBottom: '0.5rem', paddingTop: '0.75rem' }}>
                            Captain&apos;s Log
                          </p>
                          <p className="font-karla" style={{ fontSize: '0.75rem', lineHeight: 1.75, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>
                            {v.captains_log}
                          </p>
                        </div>
                      )}

                      {isExpanded && !v.captains_log && (
                        <div style={{ padding: '0.5rem 1rem 1rem', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                          <p className="font-karla" style={{ fontSize: '0.7rem', fontStyle: 'italic', color: '#bbb5ad' }}>This voyage's log went unwritten. Some crossings a captain keeps to himself.</p>
                        </div>
                      )}
                    </div>
                  )
                })}

                {hiddenCount > 0 && (
                  <button
                    onClick={() => setShowAllVoyages(v => !v)}
                    style={{
                      background: 'none', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10,
                      padding: '0.7rem', cursor: 'pointer', width: '100%',
                      color: '#c4bfb7', fontFamily: 'var(--font-karla)', fontWeight: 700,
                      fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em',
                    }}
                  >
                    {showAllVoyages ? 'Show less' : `Show ${hiddenCount} more voyage${hiddenCount !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      )}

    </div>
    </>
  )
}
