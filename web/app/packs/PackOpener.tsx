'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { rarityFromVariant } from '@/lib/variants'
import FishCard from '@/components/FishCard'
import PrizeModal from '@/components/PrizeModal'
import { openPack as openPackAction, buyPacksWithDoubloons } from './actions'
import type { DrawnCard, BorderStyle, ArtEffect } from '@/lib/types'
import type { OpenPackResponse } from './actions'
import AchievementToast from '@/components/AchievementToast'

function cardBackBorderStyle(borderStyle: BorderStyle, artEffect: ArtEffect): React.CSSProperties {
  if (artEffect === 'ghost')  return { borderColor: 'rgba(200,210,220,0.45)' }
  if (artEffect === 'shadow') return { borderColor: 'rgba(168,85,247,0.45)' }
  switch (borderStyle) {
    case 'pearl':       return { borderColor: 'rgba(232,213,175,0.45)' }
    case 'void':        return { borderColor: 'rgba(168,85,247,0.45)' }
    case 'kraken':      return { borderColor: 'rgba(0,204,153,0.45)' }
    case 'davy-jones':  return { borderColor: 'rgba(30,106,144,0.45)' }
    case 'golden-age':  return { borderColor: 'rgba(232,184,48,0.45)' }
    case 'storm':       return { borderColor: 'rgba(74,136,200,0.45)' }
    case 'wanted':      return { borderColor: 'rgba(170,64,16,0.45)' }
    case 'god':         return {
      borderColor: 'transparent',
      backgroundImage: 'linear-gradient(#000 0 0), conic-gradient(#ffffff, #fff8d0, #ffe899, #fff4c0, #ffffff)',
      backgroundOrigin: 'padding-box, border-box',
      backgroundClip: 'padding-box, border-box',
    }
    case 'prismatic':   return {
      borderColor: 'transparent',
      backgroundImage: 'linear-gradient(#000 0 0), linear-gradient(90deg,#ff0080,#ff8c00,#ffe600,#00ff88,#00cfff,#8a5cf7)',
      backgroundOrigin: 'padding-box, border-box',
      backgroundClip: 'padding-box, border-box',
    }
    default:            return {}
  }
}

interface Props {
  packsAvailable: number
  doubloons: number
}

export default function PackOpener({ packsAvailable: initialPacks, doubloons: initialDoubloons }: Props) {
  const router = useRouter()
  const packButtonRef = useRef<HTMLButtonElement>(null)
  const [packs, setPacks] = useState(initialPacks)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [phase, setPhase] = useState<'idle' | 'reveal' | 'done'>('idle')
  const [cards, setCards] = useState<DrawnCard[]>([])
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [glowClasses, setGlowClasses] = useState<string[]>([])
  const [flash, setFlash] = useState<{ type: string; key: number } | null>(null)
  const [prize, setPrize] = useState<{ cardName: string; variantName: string; prizeCode: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [buyingWithDoubloons, setBuyingWithDoubloons] = useState(false)
  const [newVariantIds, setNewVariantIds] = useState<Set<number>>(new Set())
  const [isGodPack, setIsGodPack] = useState(false)
  const [rankUp, setRankUp] = useState<{ rank: string; bonus: number } | null>(null)
  const [shockwaveCards, setShockwaveCards] = useState<Set<number>>(new Set())
  const [mythicFeatured, setMythicFeatured] = useState<number | null>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const [swapped, setSwapped] = useState(false)
  const [achievementKeys, setAchievementKeys] = useState<string[]>([])
  const pendingAchievements = useRef<string[]>([])

  useEffect(() => {
    if (localStorage.getItem('packOpenSide') === 'left') setSwapped(true)
  }, [])

  function toggleSwap() {
    setSwapped(prev => {
      const next = !prev
      localStorage.setItem('packOpenSide', next ? 'left' : 'right')
      return next
    })
  }

  function getInner(i: number) {
    return cardRefs.current[i]?.querySelector('.flip-card-inner') as HTMLElement | null
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>, i: number) {
    if (flipped[i]) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const rotX = (0.5 - y) * 14
    const rotY = (x - 0.5) * 14
    const inner = getInner(i)
    if (inner) {
      inner.style.transition = 'transform 0.08s ease-out'
      inner.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-6px) scale(1.03)`
    }
  }

  function handleMouseLeave(e: React.MouseEvent<HTMLDivElement>, i: number) {
    if (flipped[i]) return
    const inner = getInner(i)
    if (inner) {
      inner.style.transition = 'transform 0.4s ease-out'
      inner.style.transform = ''
    }
  }

  function resetTilt(i: number) {
    const inner = getInner(i)
    if (inner) {
      inner.style.transition = ''
      inner.style.transform = ''
    }
  }

  async function openPack() {
    if (packs <= 0 || loading) return
    if (packButtonRef.current) {
      packButtonRef.current.style.transform = ''
      packButtonRef.current.style.filter = ''
    }
    setLoading(true)
    setFlipped(new Array(cards.length || 5).fill(false))
    setGlowClasses(new Array(cards.length || 5).fill(''))
    setPrize(null)
    setShockwaveCards(new Set())
    setMythicFeatured(null)

    const result: OpenPackResponse = await openPackAction()

    if (result.error || !result.drawn) {
      setLoading(false)
      if (result.error === 'Unauthorized') router.push('/login')
      return
    }

    setNewVariantIds(new Set(result.newVariantIds ?? []))
    setIsGodPack(result.isGodPack ?? false)
    setRankUp(result.rankUp ?? null)
    pendingAchievements.current = result.newAchievements ?? []
    for (const completion of result.bountyCompletions ?? []) {
      window.dispatchEvent(new CustomEvent('bounty-completed', { detail: { tier: completion.tier } }))
    }
    setCards(result.drawn)
    setFlipped(new Array(5).fill(false))
    setGlowClasses(new Array(5).fill(''))
    setFlash(result.isGodPack ? { type: 'godpack', key: Date.now() } : null)
    setPacks(result.packsRemaining ?? packs - 1)
    setPhase('reveal')
    setLoading(false)
    router.refresh()
  }

  const PRIZE_VARIANTS = new Set(['Davy Jones', 'Golden Age', 'Kraken', 'Wanted', 'Maelstrom', 'GOD'])

  function isPrizeCard(card: DrawnCard) {
    return (card.name === 'Catfish' || card.name === 'Doby Mick') && PRIZE_VARIANTS.has(card.variantName)
  }

  function generatePrizeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    return `WIN-${rand}`
  }

  async function checkPrize(card: DrawnCard) {
    if (!isPrizeCard(card)) return
    const code = generatePrizeCode()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('prize_claims').insert({
      user_id: user.id,
      prize_code: code,
      card_variant_id: card.variantId,
      card_name: card.name,
      variant_name: card.variantName,
    })
    if (!error) setTimeout(() => setPrize({ cardName: card.name, variantName: card.variantName, prizeCode: code }), 2500)
  }

  // To add reveal effects for a new rarity, add one entry here.
  const RARITY_EFFECTS: Record<string, { glow: string; flash: string }> = {
    Epic:      { glow: 'reveal-glow-epic',      flash: 'epic'      },
    Legendary: { glow: 'reveal-glow-legendary', flash: 'legendary' },
    Mythic:    { glow: 'reveal-glow-mythic',    flash: 'mythic'    },
    Divine:    { glow: 'reveal-glow-divine',    flash: 'divine'    },
  }

  function glowClassFor(rarity: string) {
    return RARITY_EFFECTS[rarity]?.glow ?? ''
  }

  function triggerFlash(rarity: string) {
    const fx = RARITY_EFFECTS[rarity]
    if (fx) setFlash({ type: fx.flash, key: Date.now() })
  }

  function flipCard(i: number) {
    if (flipped[i] || loading) return
    resetTilt(i)
    const rarity = rarityFromVariant(cards[i].variantName, cards[i].dropWeight)
    setGlowClasses((prev) => { const n = [...prev]; n[i] = glowClassFor(rarity); return n })
    triggerFlash(rarity)
    checkPrize(cards[i])
    if (rarity === 'Mythic' || rarity === 'Divine') {
      setMythicFeatured(i)
      setShockwaveCards((prev) => new Set([...prev, i]))
      setTimeout(() => setMythicFeatured(null), rarity === 'Divine' ? 3500 : 2500)
      setTimeout(() => setShockwaveCards((prev) => { const n = new Set(prev); n.delete(i); return n }), rarity === 'Divine' ? 2500 : 1600)
    }
    setFlipped((prev) => {
      const n = [...prev]
      n[i] = true
      if (n.every(Boolean)) setTimeout(() => {
        setPhase('done')
        if (pendingAchievements.current.length) {
          setAchievementKeys(pendingAchievements.current)
          pendingAchievements.current = []
        }
      }, 700)
      return n
    })
  }

  function flipAll() {
    cards.forEach((_, i) => resetTilt(i))
    const rarities = cards.map((c) => rarityFromVariant(c.variantName, c.dropWeight))
    const priority = ['Divine', 'Mythic', 'Legendary', 'Epic']
    const top = priority.find((r) => rarities.includes(r))
    if (top) triggerFlash(top)
    setGlowClasses(rarities.map(glowClassFor))
    setFlipped(new Array(cards.length).fill(true))
    cards.forEach((card) => checkPrize(card))
    setTimeout(() => {
      setPhase('done')
      if (pendingAchievements.current.length) {
        setAchievementKeys(pendingAchievements.current)
        pendingAchievements.current = []
      }
    }, 700)
  }

  function reset() {
    setPhase('idle')
    setCards([])
    setFlipped([])
    setGlowClasses([])
    setFlash(null)
    setPrize(null)
    setIsGodPack(false)
    setRankUp(null)
    setNewVariantIds(new Set())
    setShockwaveCards(new Set())
    setMythicFeatured(null)
    pendingAchievements.current = []
    router.refresh()
  }

  async function handleBuyWithDoubloons(count: 1 | 10) {
    if (buyingWithDoubloons) return
    setBuyingWithDoubloons(true)
    const result = await buyPacksWithDoubloons(count)
    if (!('error' in result)) {
      setPacks(result.packsAvailable)
      setDoubloons(result.doubloons)
    }
    setBuyingWithDoubloons(false)
  }

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          {/* Booster pack */}
          <div className="relative" style={{ marginTop: packs > 1 ? 16 : 0 }}>
            {packs > 2 && !loading && (
              <img src="/booster.png" alt="" aria-hidden className="absolute inset-0 w-full h-auto" style={{ transform: 'translateY(14px) translateX(8px) rotate(2.5deg)', opacity: 0.5, pointerEvents: 'none' }} />
            )}
            {packs > 1 && !loading && (
              <img src="/booster.png" alt="" aria-hidden className="absolute inset-0 w-full h-auto" style={{ transform: 'translateY(7px) translateX(4px) rotate(1.2deg)', opacity: 0.7, pointerEvents: 'none' }} />
            )}
            <button
              ref={packButtonRef}
              onClick={packs > 0 ? openPack : undefined}
              disabled={loading || packs === 0}
              className="relative block select-none"
              style={{
                width: 'min(80vw, 480px)',
                cursor: packs > 0 && !loading ? 'pointer' : 'default',
                background: 'none',
                border: 'none',
                padding: 0,
                transition: 'transform 0.15s ease, filter 0.15s ease',
                filter: packs === 0 ? 'grayscale(0.5) opacity(0.5)' : undefined,
              }}
              onPointerEnter={e => {
                if (e.pointerType === 'touch' || packs === 0 || loading) return
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.03)'
                e.currentTarget.style.filter = 'drop-shadow(0 20px 40px rgba(0,0,0,0.6)) drop-shadow(0 0 20px rgba(30,100,220,0.25))'
              }}
              onPointerLeave={e => {
                if (e.pointerType === 'touch') return
                e.currentTarget.style.transform = ''
                e.currentTarget.style.filter = packs === 0 ? 'grayscale(0.5) opacity(0.5)' : ''
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/booster.png" alt="Booster Pack" style={{ width: '100%', height: 'auto', display: 'block', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s ease' }} />
              {packs > 0 && !loading && (
                <div style={{
                  position: 'absolute', bottom: '12%', left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '2rem', padding: '0.4rem 1rem',
                  pointerEvents: 'none',
                  animation: 'pack-pulse 2s ease-in-out infinite',
                }}>
                  <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.72rem', color: '#f0ede8', whiteSpace: 'nowrap' }}>
                    Tap to open
                  </p>
                </div>
              )}
            </button>
          </div>

          {packs > 0 ? (
            <p className="font-karla font-600 text-[#a0a09a]" style={{ fontSize: '0.78rem' }}>
              {packs} pack{packs !== 1 ? 's' : ''} available
            </p>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="font-karla font-300 text-[#a0a09a] text-sm">No packs available.</p>
              <a href="/tavern" className="btn-ghost">Go to the Tavern</a>
              <a href="/redeem" className="text-[#f0c040] hover:text-[#ffd966] text-xs font-karla font-600 uppercase tracking-[0.12em] transition-colors">
                Redeem a Code
              </a>
            </div>
          )}
        </div>

        {/* Doubloon balance + buy buttons */}
        <div className="flex flex-col items-center gap-2">
          <p className="font-karla font-600 text-[#f0c040] text-sm tracking-wide">{doubloons.toLocaleString()} ⟡</p>
          <div className="flex gap-2">
            <button
              onClick={() => doubloons >= 250 && handleBuyWithDoubloons(1)}
              disabled={buyingWithDoubloons}
              className="btn-ghost text-xs transition-opacity"
              style={{ opacity: doubloons >= 250 ? 1 : 0.35, cursor: doubloons >= 250 ? 'pointer' : 'default' }}
            >
              {buyingWithDoubloons ? '…' : 'Buy 1 · 250 ⟡'}
            </button>
            <button
              onClick={() => doubloons >= 2000 && handleBuyWithDoubloons(10)}
              disabled={buyingWithDoubloons}
              className="btn-ghost text-xs transition-opacity"
              style={{ opacity: doubloons >= 2000 ? 1 : 0.35, cursor: doubloons >= 2000 ? 'pointer' : 'default' }}
            >
              Buy 10 · 2,000 ⟡
            </button>
          </div>
        </div>


      </div>
    )
  }

  const someUnflipped = flipped.some(f => !f)

  function renderFlipInner(card: DrawnCard, i: number) {
    return (
      <>
        <div className="flip-card-inner w-full h-full">
          <div className="flip-card-front w-full h-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cardback.png" alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flip-card-back w-full h-full bg-black flex items-center justify-center p-3" style={cardBackBorderStyle(card.borderStyle, card.artEffect)}>
            <FishCard name={card.name} filename={card.filename} borderStyle={card.borderStyle} artEffect={card.artEffect} variantName={card.variantName} dropWeight={card.dropWeight} />
          </div>
        </div>
        {shockwaveCards.has(i) && (() => {
          const r = rarityFromVariant(card.variantName, card.dropWeight)
          return r === 'Divine' ? (
            <>
              <div className="shockwave-ring shockwave-divine-1" />
              <div className="shockwave-ring shockwave-divine-2" />
              <div className="shockwave-ring shockwave-divine-3" />
              <div className="shockwave-ring shockwave-divine-4" />
            </>
          ) : (
            <>
              <div className="shockwave-ring" />
              <div className="shockwave-ring shockwave-ring-2" />
              <div className="shockwave-ring shockwave-ring-3" />
            </>
          )
        })()}
      </>
    )
  }

  function renderCard(card: DrawnCard, i: number) {
    return (
      <div key={i} className="flex flex-col items-center gap-2">
        <div
          ref={(el) => { cardRefs.current[i] = el }}
          className={`flip-card pack-card-size select-none ${flipped[i] ? 'flipped' : loading ? '' : 'cursor-pointer'} ${glowClasses[i] ?? ''}`}
          style={{ opacity: mythicFeatured !== null && mythicFeatured !== i ? 0.2 : 1, transition: 'opacity 0.3s ease' }}
          onClick={() => flipCard(i)}
          onMouseMove={(e) => handleMouseMove(e, i)}
          onMouseLeave={(e) => handleMouseLeave(e, i)}
        >
          {renderFlipInner(card, i)}
        </div>
        {flipped[i] && newVariantIds.has(card.variantId) && <p className="new-badge">New</p>}
      </div>
    )
  }

  function renderOpenAllButton() {
    const isDone = phase === 'done'
    const outOfPacks = isDone && packs === 0
    const show = someUnflipped || (isDone && packs > 0) || outOfPacks
    return (
      <div className="flex-1 flex items-center justify-center" style={{ height: 248 }}>
        {show && (
          <button
            onClick={outOfPacks ? reset : isDone ? openPack : flipAll}
            disabled={isDone && loading && !outOfPacks}
            className="w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center select-none touch-manipulation"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)',
              backdropFilter: 'blur(12px)',
              transition: 'transform 0.1s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.1s ease, background 0.1s ease',
            }}
            onPointerDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.91)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.18)'
              e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)'
            }}
            onPointerUp={(e) => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)'
            }}
            onPointerLeave={(e) => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)'
            }}
          >
            <span className="font-karla font-900 uppercase text-[#f0ede8] text-center leading-snug" style={{ fontSize: '0.68rem', letterSpacing: '0.10em' }}>
              {outOfPacks ? <>Buy<br/>More</> : isDone ? <>Open<br/>Another</> : <>Open<br/>All</>}
            </span>
          </button>
        )}
      </div>
    )
  }

  function renderPackCount() {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-1" style={{ height: 248 }}>
        <span className="font-cinzel font-700 text-[#f0ede8] leading-none" style={{ fontSize: '1.6rem' }}>{packs}</span>
        <span className="font-karla font-600 uppercase text-[#a0a09a] text-center leading-tight" style={{ fontSize: '0.6rem', letterSpacing: '0.10em' }}>packs<br/>left</span>
        <button
          onClick={toggleSwap}
          className="mt-3 touch-manipulation rounded-full flex items-center justify-center"
          style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.12)', color: '#f0ede8', transition: 'background 0.07s ease, transform 0.07s ease' }}
          onPointerDown={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'scale(0.90)' }}
          onPointerUp={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.13)'; e.currentTarget.style.transform = '' }}
          onPointerLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.13)'; e.currentTarget.style.transform = '' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 16H17M17 16L14 13M17 16L14 19"/>
            <path d="M17 8H7M7 8L10 5M7 8L10 11"/>
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-10 pb-20 sm:pb-0">
      <AchievementToast keys={achievementKeys} onDone={() => setAchievementKeys([])} />
      {flash && <div key={flash.key} className={`reveal-flash reveal-flash-${flash.type}`} />}
      {prize && (
        <PrizeModal
          cardName={prize.cardName}
          variantName={prize.variantName}
          prizeCode={prize.prizeCode}
          onClose={() => setPrize(null)}
        />
      )}
      {isGodPack && (
        <div className="text-center godpack-title">
          <p className="font-cinzel font-700 tracking-[0.35em] uppercase"
             style={{ fontSize: 'clamp(1.1rem, 3vw, 1.6rem)', color: '#fff8e8', textShadow: '0 0 24px rgba(255,220,120,0.9), 0 0 60px rgba(255,200,60,0.5), 0 0 100px rgba(255,180,0,0.3)' }}>
            God Pack
          </p>
        </div>
      )}
      {rankUp && (() => {
        const RANK_COLORS: Record<string, string> = {
          'Officer': '#4ade80',
          'Second Mate': '#60a5fa',
          'Quartermaster': '#a78bfa',
          'Captain': '#f0c040',
        }
        const c = RANK_COLORS[rankUp.rank] ?? '#f0ede8'
        const rgb = c === '#4ade80' ? '74,222,128' : c === '#60a5fa' ? '96,165,250' : c === '#a78bfa' ? '167,139,250' : '240,192,64'
        return (
          <div className="w-full max-w-xs mx-auto px-6">
            <div style={{
              background: `linear-gradient(135deg, rgba(${rgb},0.12), rgba(${rgb},0.05))`,
              border: `1px solid rgba(${rgb},0.5)`,
              borderRadius: 14,
              padding: '1.125rem 1.25rem',
              boxShadow: `0 0 40px rgba(${rgb},0.2), 0 0 80px rgba(${rgb},0.08)`,
              textAlign: 'center',
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.25em]" style={{ fontSize: '0.58rem', color: c, marginBottom: 6, opacity: 0.8 }}>
                ✦ Rank Up ✦
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', lineHeight: 1.1, marginBottom: 6, color: c, textShadow: `0 0 24px rgba(${rgb},0.6)` }}>
                {rankUp.rank}
              </p>
              <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1.05rem', textShadow: '0 0 16px rgba(240,192,64,0.4)' }}>
                +{rankUp.bonus.toLocaleString()} ⟡
              </p>
            </div>
          </div>
        )
      })()}
      {/* Mobile: 2×2 grid + flanked 5th card */}
      <div className="sm:hidden flex flex-col items-center gap-2 w-full">
        <div className="grid grid-cols-2 gap-2">
          {cards.slice(0, 4).map((card, i) => renderCard(card, i))}
        </div>
        {cards[4] && (
          <div className="flex items-center gap-2 w-full">
            {swapped ? renderOpenAllButton() : renderPackCount()}
            {renderCard(cards[4], 4)}
            {swapped ? renderPackCount() : renderOpenAllButton()}
          </div>
        )}
      </div>

      {/* Desktop: flex-wrap all cards */}
      <div className="hidden sm:flex flex-wrap justify-center gap-x-4 gap-y-8">
        {cards.map((card, i) => renderCard(card, i))}
      </div>


      {/* Desktop: in flow */}
      {phase !== 'done' && flipped.some((f) => !f) ? (
        <div className="hidden sm:block"><button onClick={flipAll} className="btn-ghost">Open All</button></div>
      ) : phase === 'done' ? (
        <div className="hidden sm:flex flex-col items-center gap-4">
          <div className="flex gap-4 flex-wrap justify-center">
            {packs > 0 && (
              <button onClick={openPack} disabled={loading} className="btn-ghost">
                {loading ? 'Fishing…' : `Open Another · ${packs} Left`}
              </button>
            )}
          </div>
          {!loading && packs === 0 && (
            <button onClick={reset} className="btn-ghost">Buy More Packs</button>
          )}
        </div>
      ) : null}
    </div>
  )
}
