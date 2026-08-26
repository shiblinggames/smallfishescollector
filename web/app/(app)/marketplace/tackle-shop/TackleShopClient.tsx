'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HOOKS, hookGlowClass } from '@/lib/hooks'
import { RODS, rodGlowClass, isCaptainRod, rodSpeedPct, COMPLETIONIST_TIER, ROD_SELL_RATE } from '@/lib/rods'
import { openMembership } from '@/components/MembershipModal'
import { REELS } from '@/lib/reels'
import { LINES } from '@/lib/lines'
import { BAITS } from '@/lib/bait'
import { motion } from 'framer-motion'
import { buyHook } from '@/app/(app)/hooks/actions'
import { buyBait, purchaseRod, sellRod, equipRod, buyReel, claimCompletionistRod } from './actions'
import { getLevelFromXP, getXPProgress, MAX_LEVEL } from '@/lib/fishingLevel'
import { fishingGearLevelReq } from '@/lib/gearGating'
import ShopHeader from '@/components/ShopHeader'
import ShopStatusPill from '@/components/ShopStatusPill'
import { vibrate, hapticTap, hapticCommit } from '@/lib/haptics'
import { playChestSfx } from '@/lib/fishingMusic'



type BaitInventoryItem = { bait_type: string; quantity: number }
type Section = 'bait' | 'hook' | 'rod' | 'reel' | 'line' | null

// ── ROD FILTERS ──────────────────────────────────────────────────────────────
// The rod wall is long, so let players narrow it by ownership and by the ONE
// mechanic they're hunting for ("show me the faster-bite rods", "which have rare
// bias"). Predicates mirror the effect-chip logic below, so a chip only appears
// when at least one rod actually carries it.
type RodDef = (typeof RODS)[number]
const ROD_MECHANICS: { key: string; label: string; match: (r: RodDef) => boolean }[] = [
  { key: 'speed',    label: 'Faster bites', match: r => rodSpeedPct(r) > 0 },
  { key: 'rare',     label: 'Rare bias',    match: r => r.rarityBonus > 0 },
  { key: 'double',   label: 'Double catch', match: r => r.doubleCatchChance > 0 },
  { key: 'zone',     label: 'Catch zone',   match: r => r.catchZoneBonus > 0 },
  { key: 'retry',    label: 'Miss retry',   match: r => r.retryOnMissChance > 0 },
  { key: 'snag',     label: 'Snag immune',  match: r => !!r.snagImmune },
  { key: 'jackpot',  label: 'Jackpot',      match: r => (r.jackpotChance ?? 0) > 0 },
  { key: 'crate',    label: 'Crate odds',   match: r => (r.crateChanceMult ?? 1) > 1 },
  { key: 'perfxp',   label: 'Perfect XP',   match: r => (r.perfectXpMult ?? 1) > 1 },
  { key: 'instant',  label: 'Instant bite', match: r => (r.instantBiteChance ?? 0) > 0 },
  { key: 'wormhole', label: 'Wormhole',     match: r => !!r.wormhole },
]

// ── THE SHOP AS A COLLECTION ─────────────────────────────────────────────────
// Modelled on the Forge. The tackle shop used to be a wall of five tiles that told
// you nothing until you drilled in: you had to open Rods to learn whether you could
// afford a rod, open Reels to learn the same about reels, and so on. The one question
// a shop should answer instantly — "what can I buy right now" — took five taps.
//
// So every category now carries a STATE, computed once, exactly like a forge recipe:
// what you own, what is ready to buy, what is locked behind a level, what you are
// saving for. The landing surfaces the ready buys in a shelf up top and colours each
// category tile by where it stands, so the whole shop reads in one glance.

type GearState = 'ready' | 'locked' | 'saving' | 'maxed' | 'earned'

interface CategorySummary {
  key: Exclude<Section, null>
  label: string
  color: string
  imageUrl?: string
  /** How many rungs of this ladder you hold, over the total. */
  owned: number
  total: number
  /** The next thing to acquire, if any, and whether you can. */
  next: { name: string; cost: number; levelReq: number } | null
  state: GearState
  /** For the Ready shelf and the tile pip. */
  detail: string
}


export default function TackleShopClient({
  hookTier: initialHookTier,
  equippedRod: initialEquippedRod,
  ownedRods: initialOwnedRods,
  reelTier: initialReelTier,
  lineTier,
  doubloons: initialDoubloons,
  baitInventory: initialBait,
  fishingXP,
  isPremium,
  uniqueSpeciesCaught,
  totalSpecies,
}: {
  hookTier: number
  equippedRod: number
  ownedRods: number[]
  reelTier: number
  lineTier: number
  doubloons: number
  baitInventory: BaitInventoryItem[]
  fishingXP: number
  isPremium: boolean
  uniqueSpeciesCaught: number
  totalSpecies: number
}) {
  const router = useRouter()
  const [section, setSection] = useState<Section>(null)

  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as Section
    if (hash && ['bait', 'hook', 'rod', 'reel', 'line'].includes(hash)) setSection(hash)
  }, [])
  const [hookTier, setHookTier] = useState(initialHookTier)
  const [equippedRod, setEquippedRod] = useState(initialEquippedRod)
  const [ownedRods, setOwnedRods] = useState<number[]>(initialOwnedRods)
  const [reelTier, setReelTier] = useState(initialReelTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [baitInventory, setBaitInventory] = useState<BaitInventoryItem[]>(initialBait)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [buyingBait, setBuyingBait] = useState<string | null>(null)
  const [buyingRod, setBuyingRod] = useState<number | null>(null)
  const [equippingRod, setEquippingRod] = useState<number | null>(null)
  const [isClaiming, setIsClaiming] = useState(false)
  const [showCompModal, setShowCompModal] = useState(false)
  const [showClaimReveal, setShowClaimReveal] = useState(false)
  // Rod list filters (ownership + a single mechanic).
  const [rodOwnership, setRodOwnership] = useState<'all' | 'owned' | 'unowned'>('all')
  const [rodMechanic, setRodMechanic] = useState<string | null>(null)

  const baitMap = Object.fromEntries(baitInventory.map(b => [b.bait_type, b.quantity]))
  const totalBait = Object.values(baitMap).reduce((a, b) => a + b, 0)
  const shopBaits = BAITS
  // Fishing-level gate on buying gear (rod / reel / hook). Server-enforced too.
  const fishingLevel = getLevelFromXP(fishingXP)
  // ── FISHING LEVEL, ON SCREEN ────────────────────────────────────────────────
  // Every gate in this shop is a fishing-level gate, and the locked buttons only
  // ever showed the REQUIREMENT ("Fishing Lv 30"). Your own level lived back on the
  // fishing screen, so working out whether a rod was one level away or thirty meant
  // leaving the shop. This pill rides the header on the landing AND on every
  // purchase section, and carries the bar to the next level so "how close am I" is
  // answered in the same glance.
  const fishingProgress = getXPProgress(fishingXP)
  const levelBadge = (
    <div style={{
      flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3,
      padding: '0.3rem 0.6rem 0.35rem', borderRadius: 10,
      background: 'rgba(94,234,212,0.08)', border: '1px solid rgba(94,234,212,0.3)',
    }}>
      <span className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: '#7fd4c4', lineHeight: 1 }}>
        Fishing
      </span>
      <span className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: '#5eead4', lineHeight: 1 }}>
        Lv {fishingLevel}
      </span>
      {fishingLevel < MAX_LEVEL && (
        <div aria-hidden title={`${Math.round(fishingProgress.progress * 100)}% to Lv ${fishingLevel + 1}`}
          style={{ width: 44, height: 3, borderRadius: 999, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(2, Math.min(100, fishingProgress.progress * 100))}%`, height: '100%', background: '#5eead4' }} />
        </div>
      )}
    </div>
  )

  function broadcastDoubloons(amount: number) {
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: amount }))
  }

  // Handler-level haptics so every buy/equip surface in the shop speaks the
  // same language: tap tick on the press, commit bump when the purchase lands.
  function handleBuyHook() {
    setError(null)
    hapticTap()
    startTransition(async () => {
      const result = await buyHook()
      if ('error' in result) { setError(result.error) }
      else { hapticCommit(); setHookTier(result.hookTier); setDoubloons(result.doubloons); broadcastDoubloons(result.doubloons) }
    })
  }

  function handlePurchaseRod(rodTier: number) {
    setError(null)
    hapticTap()
    setBuyingRod(rodTier)
    startTransition(async () => {
      const result = await purchaseRod(rodTier)
      setBuyingRod(null)
      if ('error' in result) { setError(result.error) }
      else {
        hapticCommit()
        setOwnedRods(result.ownedRods)
        setDoubloons(result.doubloons)
        broadcastDoubloons(result.doubloons)
        setEquippedRod(rodTier)
      }
    })
  }

  /**
   * SELL A ROD BACK.
   *
   * The action has existed for a long time and the only door to it was the
   * fishing page's gear sheet — so a shop with a wall of rods in it could take
   * your money and not give it back, which is not a shop. Two taps: the card
   * asks first, because this deletes a rod and refunds a fraction.
   *
   * The server allows selling the EQUIPPED rod and auto-equips the free Bamboo
   * when it does, returning the tier it landed on. Mirrored here rather than
   * assumed, or the card keeps a highlight on a rod that is gone.
   */
  const [sellConfirm, setSellConfirm] = useState<number | null>(null)
  const [sellingRod, setSellingRod] = useState<number | null>(null)

  function handleSellRod(rodTier: number) {
    setError(null)
    hapticTap()
    setSellConfirm(null)
    setSellingRod(rodTier)
    startTransition(async () => {
      const result = await sellRod(rodTier)
      setSellingRod(null)
      if ('error' in result) { setError(result.error); return }
      hapticCommit()
      setOwnedRods(result.ownedRods)
      setEquippedRod(result.rodTier)
      setDoubloons(result.doubloons)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.doubloons }))
    })
  }

  function handleEquipRod(rodTier: number) {
    setError(null)
    hapticTap()
    setEquippingRod(rodTier)
    startTransition(async () => {
      const result = await equipRod(rodTier)
      setEquippingRod(null)
      if ('error' in result) { setError(result.error) }
      else { hapticCommit(); setEquippedRod(result.rodTier) }
    })
  }

  function handleBuyReel() {
    setError(null)
    hapticTap()
    startTransition(async () => {
      const result = await buyReel()
      if ('error' in result) { setError(result.error) }
      else { hapticCommit(); setReelTier(result.reelTier); setDoubloons(result.doubloons); broadcastDoubloons(result.doubloons) }
    })
  }

  function handleClaimCompletionistRod() {
    setError(null)
    setIsClaiming(true)
    startTransition(async () => {
      const result = await claimCompletionistRod()
      setIsClaiming(false)
      if ('error' in result) { setError(result.error) }
      else {
        setOwnedRods(result.ownedRods)
        setShowCompModal(false)
        setShowClaimReveal(true)
        vibrate([0, 55, 70, 45, 90, 60])
        try { playChestSfx(true) } catch {}
      }
    })
  }

  function handleBuyBait(baitType: string, qty: number) {
    setError(null)
    hapticTap()
    setBuyingBait(`${baitType}-${qty}`)
    startTransition(async () => {
      const result = await buyBait(baitType, qty)
      setBuyingBait(null)
      if ('error' in result) { setError(result.error) }
      else {
        hapticCommit()
        setDoubloons(result.doubloons)
        broadcastDoubloons(result.doubloons)
        setBaitInventory(prev => {
          const existing = prev.find(b => b.bait_type === baitType)
          if (existing) return prev.map(b => b.bait_type === baitType ? { ...b, quantity: result.newQty } : b)
          return [...prev, { bait_type: baitType, quantity: result.newQty }]
        })
      }
    })
  }

  const CATEGORIES: { key: Exclude<Section, null>; label: string; desc: string; color: string; imageUrl?: string }[] = [
    { key: 'bait',  label: 'Bait',  color: '#34d399', desc: 'Consumables used per cast.',           imageUrl: '/worms.png' },
    { key: 'hook',  label: 'Hooks', color: '#f0c040', desc: 'Widens the catch zone on the dial.',  imageUrl: '/hook_steel_thumb.png' },
    { key: 'rod',   label: 'Rods',  color: '#b8956a', desc: 'Every rod has a unique ability.',       imageUrl: '/rod_driftwood_thumb.png' },
    { key: 'reel',  label: 'Reels', color: '#60a5fa', desc: 'Slows the needle for easier timing.',   imageUrl: '/reel_basic_thumb.png' },
    { key: 'line',  label: 'Line',  color: '#4ade80', desc: 'Shrinks snag zones. Earned by species.',  imageUrl: '/monofilament.png' },
  ]

  // ── STATE PER CATEGORY — computed once, the way a forge recipe is ─────────
  // A LADDER category (reel/hook) has one next rung: tier+1. RODS are a collection,
  // so the next buy is the cheapest rod you do not own yet. LINE is earned by species,
  // never bought. BAIT is consumable and always "ready" while any is for sale.
  const gearReq = (item: { minLevel?: number; cost: number }) => fishingGearLevelReq(item)
  function ladderSummary(
    key: 'reel' | 'hook', label: string, color: string, imageUrl: string,
    list: { tier: number; name: string; cost: number; minLevel?: number }[], tier: number,
  ): CategorySummary {
    const owned = tier + 1
    const next = list[tier + 1] ?? null
    if (!next) return { key, label, color, imageUrl, owned, total: list.length, next: null, state: 'maxed', detail: 'Fully upgraded' }
    const req = gearReq(next)
    const levelOk = fishingLevel >= req
    const canAfford = doubloons >= next.cost
    const state: GearState = !levelOk ? 'locked' : canAfford ? 'ready' : 'saving'
    const detail = !levelOk ? `Fishing Lv ${req} · ${req - fishingLevel} to go`
      : canAfford ? `${next.name} · ${next.cost.toLocaleString()} ⟡`
      : `${(next.cost - doubloons).toLocaleString()} ⟡ short`
    return { key, label, color, imageUrl, owned, total: list.length, next: { name: next.name, cost: next.cost, levelReq: req }, state, detail }
  }

  // The free Bamboo starter is never written to rod_inventory, so a player who's
  // bought any rod has an ownedRods without tier 0 — which made Bamboo read as the
  // cheapest "unowned" rod (a 0⟡ "ready to buy"). Treat any zero-cost, non-earned
  // rod as always owned, matching the grid's owned rule (line ~744).
  const ownedRodSet = new Set(ownedRods)
  for (const r of RODS) if (r.cost === 0 && !r.earnedOnly && !r.traderOnly) ownedRodSet.add(r.tier)

  const summaries: CategorySummary[] = [
    // RODS — a collection. Next buy = cheapest unowned, non-captain-locked rod.
    (() => {
      const buyable = RODS
        // traderOnly excluded: this line tells you what to save for, and
        // pointing at something the shop refuses to sell is worse than silence.
        .filter(r => !ownedRodSet.has(r.tier) && !isCaptainRod(r)
          && !r.traderOnly && r.tier !== COMPLETIONIST_TIER)
        .sort((a, b) => a.cost - b.cost)
      const next = buyable.find(r => fishingLevel >= gearReq(r) && doubloons >= r.cost)
        ?? buyable.find(r => fishingLevel >= gearReq(r))
        ?? buyable[0] ?? null
      const total = RODS.filter(r => r.tier !== COMPLETIONIST_TIER).length
      const owned = RODS.filter(r => r.tier !== COMPLETIONIST_TIER && ownedRodSet.has(r.tier)).length
      if (!next) return { key: 'rod' as const, label: 'Rods', color: '#b8956a', imageUrl: '/rod_driftwood_thumb.png', owned, total, next: null, state: 'maxed' as GearState, detail: 'Every rod owned' }
      const req = gearReq(next), levelOk = fishingLevel >= req, canAfford = doubloons >= next.cost
      const state: GearState = !levelOk ? 'locked' : canAfford ? 'ready' : 'saving'
      const detail = !levelOk ? `Fishing Lv ${req} · ${req - fishingLevel} to go`
        : canAfford ? `${next.name} · ${next.cost.toLocaleString()} ⟡`
        : `${(next.cost - doubloons).toLocaleString()} ⟡ short`
      return { key: 'rod' as const, label: 'Rods', color: '#b8956a', imageUrl: '/rod_driftwood_thumb.png', owned, total, next: { name: next.name, cost: next.cost, levelReq: req }, state, detail }
    })(),
    ladderSummary('reel', 'Reels', '#60a5fa', '/reel_basic_thumb.png', REELS, reelTier),
    ladderSummary('hook', 'Hooks', '#f0c040', '/hook_steel_thumb.png', HOOKS, hookTier),
    // LINE — earned by discovering species, never bought.
    (() => {
      const owned = lineTier + 1
      const maxed = lineTier >= LINES.length - 1
      const remaining = Math.max(0, totalSpecies - uniqueSpeciesCaught)
      return {
        key: 'line' as const, label: 'Line', color: '#4ade80', imageUrl: '/monofilament.png',
        owned, total: LINES.length, next: null, state: (maxed ? 'maxed' : 'earned') as GearState,
        detail: maxed ? 'Finest line unlocked' : `${uniqueSpeciesCaught}/${totalSpecies} species discovered`,
      }
    })(),
    // BAIT — consumable, always available.
    {
      key: 'bait', label: 'Bait', color: '#34d399', imageUrl: '/worms.png',
      owned: Object.keys(baitMap).filter(k => (baitMap[k] ?? 0) > 0).length, total: shopBaits.length,
      next: null, state: 'ready', detail: totalBait > 0 ? `${totalBait} in your tin` : 'Stock your tin',
    },
  ]
  const readyBuys = summaries.filter(s => s.state === 'ready' && s.key !== 'bait')
  const gearOwned = summaries.reduce((a, s) => a + s.owned, 0)
  const gearTotal = summaries.reduce((a, s) => a + s.total, 0)

  const STATE_PIP: Record<GearState, { label: string; color: string }> = {
    ready:  { label: 'Ready to buy', color: '#f0c040' },
    saving: { label: 'Saving up',    color: '#9a958c' },
    locked: { label: 'Level locked', color: '#60a5fa' },
    maxed:  { label: 'Maxed',        color: '#c9a7ff' },
    earned: { label: 'Earned by play', color: '#4ade80' },
  }

  // ── Landing — the Forge shape ────────────────────────────────────────────
  // A collection pulse, a shelf of what you can buy RIGHT NOW, and a state-coloured
  // board. The old landing was five identical tiles that answered nothing until you
  // opened them; this answers "what can I afford" before you touch anything.
  if (section === null) {
    return (
      <div className="px-4 sm:px-6 max-w-lg sm:max-w-2xl mx-auto pb-16">
        <ShopHeader title="Tackle Shop" backLabel="Back" onBack={() => router.back()} badge={levelBadge} />

        {/* ── THE PULSE: how kitted-out you are, at a glance ─────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.72rem', color: '#b9b2a6' }}>
            Gear <span style={{ color: '#ffce8a' }}>{gearOwned}</span> / {gearTotal}
          </span>
          <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.72rem', color: '#e0b45a' }}>
            {doubloons.toLocaleString()} ⟡
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(18,20,27,0.92)', overflow: 'hidden', marginBottom: '1.2rem' }}>
          <motion.div initial={false} animate={{ width: `${Math.round((gearOwned / Math.max(1, gearTotal)) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #d8a24a, #f0c877)' }} />
        </div>

        {/* ── READY TO BUY: the one question a shop should answer instantly ── */}
        {readyBuys.length > 0 && (
          <div style={{ marginBottom: '1.3rem' }}>
            <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', color: '#f0c040', marginBottom: 9 }}>
              Ready to Buy
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {readyBuys.map(s => (
                <motion.button key={s.key} type="button"
                  onClick={() => { vibrate([0, 14]); setSection(s.key); setError(null) }}
                  whileTap={{ scale: 0.985 }} className="tap"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                    padding: '0.7rem 0.8rem', borderRadius: 14, cursor: 'pointer',
                    background: 'linear-gradient(180deg, rgba(240,192,64,0.15), rgba(240,192,64,0.05))',
                    border: '1px solid rgba(240,192,64,0.55)', boxShadow: '0 0 20px rgba(240,192,64,0.16)',
                  }}>
                  {/* No plate behind it either: the art carries itself here
                      the same way it does on the tiles below. */}
                  <span style={{ position: 'relative', flexShrink: 0, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.imageUrl} alt="" loading="lazy" decoding="async" style={{ maxWidth: 34, maxHeight: 34, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' }} />
                    )}
                    <motion.span aria-hidden animate={{ opacity: [0.15, 0.5, 0.15] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ position: 'absolute', inset: -1, borderRadius: 11, border: '1px solid #f0c040', pointerEvents: 'none' }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="font-cinzel font-700 truncate" style={{ display: 'block', fontSize: '1.02rem', color: '#f7edd4' }}>{s.next?.name ?? s.label}</span>
                    <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ display: 'block', fontSize: '0.6rem', color: '#c8bfa8', marginTop: 2 }}>{s.label}</span>
                  </span>
                  <span className="font-cinzel font-700" style={{ flexShrink: 0, fontSize: '0.92rem', color: '#f0c040', whiteSpace: 'nowrap' }}>
                    {(s.next?.cost ?? 0).toLocaleString()} ⟡
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* ── THE BOARD: every category, coloured by where it stands ─────── */}
        <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', color: '#b9b2a6', marginBottom: 9 }}>
          All Tackle
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {summaries.map(s => {
            const pip = STATE_PIP[s.state]
            // The Forge's cleanliness comes from styling by STATE, not by category.
            // Colouring every tile by its category turned the board into a rainbow;
            // now the chrome is uniform and neutral, the READY ones lift in gold, and
            // the art alone carries which category it is. Calm grid, one loud signal.
            const ready = s.state === 'ready'
            return (
              <motion.button key={s.key} type="button"
                onClick={() => { vibrate([0, 12]); setSection(s.key); setError(null) }}
                whileTap={{ scale: 0.96 }} className="tap"
                style={{
                  position: 'relative',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '0.9rem 0.5rem 0.75rem', borderRadius: 14, cursor: 'pointer', minWidth: 0,
                  overflow: 'hidden',
                  // OPAQUE, and no art of its own.
                  //
                  // This asked for /tackle-rod-bg.jpg, /tackle-reel-bg.jpg and
                  // three more that were NEVER ADDED to public. All five 404'd,
                  // so every tile fell back to the scrim alone: a gradient
                  // opening at 26% over a painted shop. That is why they could
                  // not be read. The item art on the tile already says which
                  // category it is; a backdrop underneath was only ever going
                  // to compete with it.
                  // Ready is said by the edge and the dot, not by tinting the
                  // whole card amber.
                  background: 'linear-gradient(180deg, rgba(22,25,32,0.97) 0%, rgba(12,14,19,0.98) 100%)',
                  border: `1px solid ${ready ? 'rgba(240,192,64,0.65)' : 'rgba(255,255,255,0.12)'}`,
                  borderTop: `1px solid ${ready ? 'rgba(240,192,64,0.85)' : 'rgba(255,255,255,0.18)'}`,
                  boxShadow: '0 3px 14px rgba(0,0,0,0.5)',
                }}>
                {/* Art sits DIRECTLY on the tile, like the Forge. The old nested black
                    disc-in-a-faint-square was the muddy double layer. */}
                {/* The tackle IS the tile. It was 52px of art in a card twice
                    that tall, with the rest given to a label the picture was
                    already saying. No coloured pool behind it: that was the
                    glow this page had too much of. */}
                <div style={{ position: 'relative', height: 84, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageUrl} alt={s.label} loading="lazy" decoding="async"
                      style={{ position: 'relative', maxWidth: 82, maxHeight: 84, objectFit: 'contain', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.7))' }} />
                  )}
                </div>
                {ready && (
                  <motion.span aria-hidden animate={{ opacity: [0.2, 0.6, 0.2] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ position: 'absolute', top: 7, right: 8, width: 6, height: 6, borderRadius: 999, background: '#f0c040', boxShadow: '0 0 8px #f0c040', pointerEvents: 'none' }} />
                )}
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0ede8', lineHeight: 1.1, textShadow: '0 2px 6px rgba(0,0,0,0.85)' }}>{s.label}</p>
                {/* One clean status line, centred, coloured by state — the forge tell. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
                  <span aria-hidden style={{ flexShrink: 0, width: 5, height: 5, borderRadius: 999, background: pip.color }} />
                  <span className="font-karla font-700 truncate" style={{ fontSize: '0.6rem', color: pip.color }}>{s.detail}</span>
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Section shell ──────────────────────────────────────────────────────
  const sectionColor = CATEGORIES.find(c => c.key === section)?.color ?? '#f0ede8'
  const sectionLabel = CATEGORIES.find(c => c.key === section)?.label ?? ''

  return (
    <div className="px-4 sm:px-6 max-w-4xl mx-auto">
      <ShopHeader
        title={sectionLabel}
        backLabel="Tackle Shop"
        onBack={() => { setSection(null); setError(null) }}
        accent={sectionColor}
        badge={levelBadge}
      />

      {error && <p className="font-karla font-300 text-red-400 text-xs text-center mb-3">{error}</p>}

      {/* ── Bait ── */}
      {section === 'bait' && (
        <div id="bait" className="mb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.55rem' }}>
          {shopBaits.map(bait => {
            const owned        = baitMap[bait.type] ?? 0
            const hasFasterBite = bait.waitMult < 1.0
            const hasCatchBonus = bait.catchZoneBonus > 0
            const noDrawbacks   = bait.waitMult <= 1.0 && hasCatchBonus && !hasFasterBite

            return (
              <div key={bait.type} style={{
                ...tileSurface(bait.color, { owned: owned > 0 }),
                padding: '0.8rem 0.8rem 0.75rem',
                display: 'flex', flexDirection: 'column', gap: '0.55rem',
              }}>
                <Sheen />

                {/* Icon + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', position: 'relative' }}>
                  {/* 28px of bait inside a 42px bordered pool of its own colour:
                      the picture-in-a-picture-frame every other row on this page
                      already lost. Bait is never locked, so it is never dimmed. */}
                  <div style={{ width: 48, height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {bait.imageUrl
                      ? <img src={bait.imageUrl} alt={bait.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.65))' }} />
                      : <div style={{ width: 12, height: 12, borderRadius: 4, background: bait.color }} />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f4ecd8', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bait.name}
                    </p>
                    {owned > 0 && (
                      <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ display: 'inline-block', marginTop: 3, fontSize: '0.5rem', color: '#bdb5a6', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '0.1rem 0.4rem' }}>×{owned} in hold</span>
                    )}
                  </div>
                </div>

                {/* Effect chips */}
                <div style={{ display: 'flex', gap: '0.28rem', flexWrap: 'wrap', position: 'relative' }}>
                  {hasFasterBite && (
                    <span className="font-karla font-600" style={{
                      fontSize: '0.6rem', color: '#d6d0c4',
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 20, padding: '0.15rem 0.45rem',
                    }}>{Math.round((1 - bait.waitMult) * 100)}% faster</span>
                  )}
                  {hasCatchBonus && (
                    <span className="font-karla font-600" style={{
                      fontSize: '0.6rem', color: '#d6d0c4',
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 20, padding: '0.15rem 0.45rem',
                    }}>+{bait.catchZoneBonus}° zone</span>
                  )}
                  {noDrawbacks && (
                    <span className="font-karla font-600" style={{
                      fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)',
                      background: 'rgba(16,18,24,0.9)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 20, padding: '0.15rem 0.45rem',
                    }}>no penalty</span>
                  )}
                  {bait.type === 'worm' && (
                    <span className="font-karla font-600" style={{
                      fontSize: '0.6rem', color: '#4ade80',
                      background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)',
                      borderRadius: 20, padding: '0.15rem 0.45rem',
                    }}>20 free/day</span>
                  )}
                </div>

                {/* Deliberately-vague hint on the premium lures — nudges that
                    they draw the Ancient Deep's oldest prizes, without spelling
                    it out. */}
                {bait.hint && (
                  <p className="font-karla font-400 italic" style={{ fontSize: '0.6rem', color: '#8a857c', lineHeight: 1.35, position: 'relative' }}>{bait.hint}</p>
                )}

                {/* Buy buttons or earned badge */}
                {bait.shopCost > 0 ? (
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto', position: 'relative' }}>
                    {([10, 25] as const).map(buyQty => {
                      const cost       = bait.shopCost * buyQty
                      const canAfford  = doubloons >= cost
                      const isBuying   = buyingBait === `${bait.type}-${buyQty}` && isPending
                      return (
                        <motion.button
                          key={buyQty}
                          onClick={() => { if (canAfford && !isPending) handleBuyBait(bait.type, buyQty) }}
                          disabled={!canAfford || isPending}
                          whileTap={canAfford && !isPending ? { scale: 0.95 } : undefined}
                          transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                          style={{
                            flex: 1,
                            borderRadius: 9, padding: '0.45rem 0.25rem',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                            // "You can buy this" should look the same on every
                            // card. Painted in each bait's own hue, it was eight
                            // different colours all saying the one thing.
                            background: canAfford ? 'linear-gradient(180deg, rgba(240,220,174,0.16) 0%, rgba(240,220,174,0.06) 100%)' : 'rgba(12,14,19,0.92)',
                            border: `1px solid ${canAfford ? 'rgba(240,220,174,0.42)' : 'rgba(255,255,255,0.08)'}`,
                            color: canAfford ? '#f4ecd8' : '#4a4845',
                            cursor: canAfford && !isPending ? 'pointer' : 'default',
                            opacity: isBuying ? 0.5 : 1,
                            boxShadow: canAfford ? `inset 0 1px 0 rgba(255,255,255,0.08)` : 'none',
                          }}
                        >
                          <span className="font-karla font-700" style={{ fontSize: '0.76rem', lineHeight: 1 }}>
                            {isBuying ? '…' : `×${buyQty}`}
                          </span>
                          <span className="font-karla font-600" style={{ fontSize: '0.54rem', color: canAfford ? 'rgba(244,236,216,0.6)' : '#f0c040', lineHeight: 1 }}>
                            {cost.toLocaleString()} ⟡
                          </span>
                        </motion.button>
                      )
                    })}
                  </div>
                ) : (
                  <Link href="/expeditions" style={{ textDecoration: 'none', display: 'block', marginTop: 'auto', padding: '0.45rem 0.5rem', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.13)', textAlign: 'center', position: 'relative' }}>
                    <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#c3bcae' }}>
                      {bait.acquisition.includes('fathoms') ? 'Voyages, or buy with Fathoms in the Locker →' : 'Earned from voyages →'}
                    </span>
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Hooks ── */}
      {section === 'hook' && (
        <>
          {/* The 220px hook portrait that used to sit here is gone.
              Hooks were the only category with one, it showed whichever row you
              had last tapped, and every row already draws that same art at 64px
              from the same file. So it was a duplicate, upscaled from a _thumb
              (blurred), wrapped in a glowing tinted panel, taking the top of the
              page before you could see a single price. */}
          <div className="flex flex-col gap-2.5 mb-4">
            {HOOKS.map(hook => {
              const owned = hook.tier <= hookTier
              const isActive = hook.tier === hookTier
              const locked = hook.tier > hookTier + 1
              const c = hook.color
              const isNext = hook.tier === hookTier + 1
              const hookReq = fishingGearLevelReq(hook)
              const hookLevelMet = fishingLevel >= hookReq
              const canAffordHook = isNext && doubloons >= hook.cost
              const hookReady = canAffordHook && hookLevelMet
              const clickable = isNext && hookReady && !isPending

              return (
                <motion.div
                  key={hook.tier}
                  onClick={() => { if (clickable) handleBuyHook() }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  style={{
                    ...tileSurface(c, { owned, active: isActive, ready: isNext && hookReady, locked }),
                    padding: '0.85rem 0.9rem',
                    opacity: isPending && isNext ? 0.6 : 1,
                    cursor: 'pointer',
                  }}
                >
                  <Sheen />
                  <div className="flex items-center gap-3 sm:gap-4" style={{ position: 'relative' }}>
                    <HookIcon tier={hook.tier} color={c} owned={owned} isActive={isActive} imageUrl={hook.imageUrl ? hook.imageUrl.replace(/\.png$/, '_thumb.png') : undefined} glowClass={hookGlowClass(hook)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="font-cinzel font-700 text-sm sm:text-base" style={{ color: owned ? '#f4ecd8' : '#7a756c' }}>
                          {hook.name}
                        </p>
                        {isActive && <ShopStatusPill kind="active" />}
                        {owned && !isActive && <ShopStatusPill kind="owned" />}
                        {locked && <ShopStatusPill kind="locked" />}
                      </div>
                      <p className="font-karla font-300 text-sm" style={{ color: owned ? '#9a958c' : '#6a655d' }}>{hook.description}</p>

                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {hook.tier > 0 && (
                          <span className="font-karla font-600"
                            style={{
                              fontSize: '0.62rem',
                              color: owned ? `${c}cc` : '#5a564e',
                              background: owned ? `${c}16` : 'rgba(16,18,24,0.9)',
                              border: `1px solid ${owned ? `${c}38` : 'rgba(255,255,255,0.1)'}`,
                              padding: '0.12rem 0.5rem', borderRadius: '2rem',
                            }}>
                            +{hook.tier * 3}° catch zone
                          </span>
                        )}
                        {isNext && (
                          <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
                            fontSize: '0.56rem',
                            color: hookReady ? c : '#f0c040',
                            background: hookReady ? `${c}1c` : 'rgba(240,192,64,0.1)',
                            border: `1px solid ${hookReady ? `${c}55` : 'rgba(240,192,64,0.32)'}`,
                            padding: '0.14rem 0.5rem', borderRadius: 999,
                          }}>
                            {isPending ? 'Upgrading…' : !hookLevelMet ? `Fishing Lv ${hookReq} · ${hookReq - fishingLevel} to go` : canAffordHook ? 'Tap to upgrade' : `${(hook.cost - doubloons).toLocaleString()} ⟡ short`}
                          </span>
                        )}
                      </div>
                    </div>

                    {!owned && (
                      <p className="font-cinzel font-700 shrink-0 text-base sm:text-lg" style={{ color: hookReady ? c : '#f0c040', whiteSpace: 'nowrap' }}>
                        {hook.cost.toLocaleString()} ⟡
                      </p>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
          {hookTier >= HOOKS.length - 1 && (
            <p className="font-karla font-300 text-[#a0a09a] text-sm text-center mb-4">
              You have the best hook in the sea.
            </p>
          )}
        </>
      )}

      {/* ── Rods ── */}
      {section === 'rod' && (() => {
        const compRod = RODS.find(r => r.tier === 14)!
        const compOwned = ownedRods.includes(14)
        const compActive = equippedRod === 14
        const playerLevel = getLevelFromXP(fishingXP)
        const isLevelOk = playerLevel >= 100
        const isSpeciesOk = totalSpecies > 0 && uniqueSpeciesCaught >= totalSpecies
        const eligible = isLevelOk && isSpeciesOk && !compOwned
        const c = compRod.color

        // The browsable rod ladder (Completionist is its own capstone card below),
        // narrowed by the active ownership + mechanic filters.
        // traderOnly rods are not stocked ashore — they change hands only out
        // on the chart. Hidden rather than greyed out: a locked row invites
        // "how do I unlock it", and the answer is not something this screen can
        // tell you.
        const baseRods = [...RODS].filter(r => !r.earnedOnly && !r.traderOnly).sort((a, b) => a.cost - b.cost)
        const ownedCount = baseRods.filter(r => ownedRodSet.has(r.tier)).length
        const availableMechanics = ROD_MECHANICS.filter(m => baseRods.some(m.match))
        const activeMech = ROD_MECHANICS.find(m => m.key === rodMechanic) ?? null
        const visibleRods = baseRods.filter(r => {
          if (rodOwnership === 'owned' && !ownedRodSet.has(r.tier)) return false
          if (rodOwnership === 'unowned' && ownedRodSet.has(r.tier)) return false
          if (activeMech && !activeMech.match(r)) return false
          return true
        })

        return (
          <>
            {/* Completionist Rod modal */}
            {showCompModal && (
              <div onClick={() => setShowCompModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
                <div onClick={e => e.stopPropagation()} style={{ background: '#0f0f0e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 480, padding: '1.5rem' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>{compRod.name}</p>
                      <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.48rem', color: c, background: `${c}20`, border: `1px solid ${c}40`, padding: '0.1rem 0.5rem', borderRadius: '2rem' }}>Mastery Rod</span>
                    </div>
                    <button onClick={() => setShowCompModal(false)} style={{ color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  {(compRod.slug || compRod.imageUrl) && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '1rem', display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={compRod.slug ? `/${compRod.slug}_thumb.png` : compRod.imageUrl} alt={compRod.name} loading="lazy" decoding="async" style={{ height: 140, objectFit: 'contain' }} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {['Always double catch', '50% miss retry', 'Snag immune', '+50% rare bias', '+16° catch zone', 'Perfect +5°', 'Fastest bites'].map(label => (
                      <span key={label} className="font-karla font-600" style={{ fontSize: '0.6rem', color: `${c}dd`, background: `${c}18`, border: `1px solid ${c}35`, padding: '0.15rem 0.5rem', borderRadius: '2rem' }}>{label}</span>
                    ))}
                  </div>
                  <p className="font-karla font-300 mb-4" style={{ fontSize: '0.78rem', color: '#8a8884', lineHeight: 1.5 }}>{compRod.description}</p>
                  {!compActive && (
                    <button onClick={() => { handleEquipRod(14); setShowCompModal(false) }} disabled={isPending} className="font-karla font-700 w-full"
                      style={{ fontSize: '0.75rem', padding: '0.5rem', borderRadius: 9, background: `${c}22`, border: `1px solid ${c}60`, color: c, cursor: isPending ? 'default' : 'pointer' }}>
                      Equip
                    </button>
                  )}
                  {compActive && <p className="font-karla font-600 text-center" style={{ fontSize: '0.72rem', color: `${c}88` }}>Currently equipped</p>}
                </div>
              </div>
            )}

            {/* Rod list — single column so each rod gets a wide, readable row:
                a big neutral art panel on the left, name + plain effect chips +
                buy on the right. The old 2-col cards flooded every card with the
                rod's own color (bg, halo, pills, button), turning the shop into
                a distracting rainbow where the rods + effects were hard to read.
                Each rod's color now shows ONLY as its art glow + a small
                identity dot; the card chrome + chips are neutral. */}
            {/* ── Rod filters ── ownership row + a horizontally-scrolling
                mechanic row. Only mechanics some rod actually carries show up. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  ['all', 'All', baseRods.length],
                  ['owned', 'Owned', ownedCount],
                  ['unowned', 'Not owned', baseRods.length - ownedCount],
                ] as const).map(([val, lbl, n]) => {
                  const on = rodOwnership === val
                  return (
                    <button key={val} type="button"
                      onClick={() => { hapticTap(); setRodOwnership(val) }}
                      className="font-karla font-700 tap"
                      style={{
                        flex: 1, padding: '0.42rem 0.4rem', borderRadius: 9, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, lineHeight: 1,
                        fontSize: '0.66rem', letterSpacing: '0.03em',
                        background: on ? 'rgba(184,149,106,0.22)' : 'rgba(16,18,24,0.9)',
                        border: `1px solid ${on ? 'rgba(184,149,106,0.6)' : 'rgba(255,255,255,0.1)'}`,
                        color: on ? '#e6cfa6' : '#8a857c',
                      }}>
                      {lbl}<span style={{ fontSize: '0.58rem', opacity: 0.7 }}>{n}</span>
                    </button>
                  )
                })}
              </div>
              <div className="scrollbar-hide" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 3 }}>
                {[{ key: null as string | null, label: 'All abilities' }, ...availableMechanics].map(m => {
                  const on = rodMechanic === m.key
                  return (
                    <button key={m.key ?? 'all'} type="button"
                      onClick={() => { hapticTap(); setRodMechanic(m.key) }}
                      className="font-karla font-600 tap"
                      style={{
                        flexShrink: 0, padding: '0.34rem 0.7rem', borderRadius: 999, cursor: 'pointer',
                        fontSize: '0.64rem', whiteSpace: 'nowrap',
                        background: on ? 'rgba(184,149,106,0.2)' : 'rgba(16,18,24,0.9)',
                        border: `1px solid ${on ? 'rgba(184,149,106,0.55)' : 'rgba(255,255,255,0.11)'}`,
                        color: on ? '#e8cfa8' : '#a49f95',
                      }}>
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="mb-4">
              {visibleRods.map(rod => {
                const owned = (rod.cost === 0 && !rod.earnedOnly) || ownedRods.includes(rod.tier)
                const isActive = rod.tier === equippedRod
                const canAfford = doubloons >= rod.cost
                const rodReq = fishingGearLevelReq(rod)
                const rodLevelMet = fishingLevel >= rodReq
                const rodBuyable = canAfford && rodLevelMet
                const captainLocked = isCaptainRod(rod) && !isPremium
                const isBuying = buyingRod === rod.tier && isPending
                const isEquipping = equippingRod === rod.tier && isPending
                const c = rod.color
                const speedPct = rodSpeedPct(rod)

                const effects: string[] = []
                if (rod.doubleCatchChance >= 1) effects.push('Always double catch')
                else if (rod.doubleCatchChance > 0) effects.push(`${Math.round(rod.doubleCatchChance * 100)}% double catch`)
                if (rod.retryOnMissChance > 0) effects.push(`${Math.round(rod.retryOnMissChance * 100)}% miss retry`)
                if (rod.snagImmune) effects.push('Snag immune')
                if (rod.perfectZoneBonus > 0) effects.push(`Perfect zone +${rod.perfectZoneBonus}°`)
                if (rod.rarityBonus > 0) effects.push(`+${Math.round(rod.rarityBonus * 100)}% rare bias`)
                if ((rod.jackpotChance ?? 0) > 0) effects.push(`×${rod.jackpotMultiplier} jackpot · odds rise in shallows`)
                if ((rod.crateChanceMult ?? 1) > 1) effects.push(`${rod.crateChanceMult}× crate odds`)
                if ((rod.perfectXpMult ?? 1) > 1) effects.push(`${rod.perfectXpMult}× perfect XP`)
                if (rod.wormhole) effects.push('Wormhole reroll')
                if ((rod.instantBiteChance ?? 0) > 0) effects.push(`${Math.round(rod.instantBiteChance! * 100)}% instant bite`)
                if (speedPct > 0) effects.push(`${speedPct}% faster bites`)
                if (rod.catchZoneBonus > 0) effects.push(`+${rod.catchZoneBonus}° catch zone`)
                if (effects.length === 0) effects.push('Standard rod')

                return (
                  <div key={rod.tier} style={{
                    display: 'flex', gap: 12, padding: 10,
                    background: 'rgba(12,14,19,0.95)',
                    border: `1px solid ${isActive ? 'rgba(240,192,64,0.45)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 14,
                    boxShadow: isActive ? '0 0 16px rgba(240,192,64,0.1)' : '0 2px 8px rgba(0,0,0,0.3)',
                  }}>
                    {/* Art panel — neutral box, big enough to actually see the rod */}
                    <div style={{
                      flexShrink: 0, width: 104, alignSelf: 'stretch', minHeight: 104,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0.05) 0%, transparent 70%), rgba(4,6,10,0.5)',
                      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 8,
                    }}>
                      {(rod.slug || rod.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={rod.slug ? `/${rod.slug}_thumb.png` : rod.imageUrl} alt={rod.name} loading="lazy" decoding="async"
                          className={owned ? rodGlowClass(rod) : undefined} style={{
                            // Always show the rod in full color — even unaffordable
                            // ones — so players can see what they're saving up for.
                            // Owned rods are set apart by their animated glow (glow
                            // class) or a color-matched drop-shadow; unowned rods
                            // just get a soft neutral shadow.
                            maxWidth: '100%', maxHeight: 92, objectFit: 'contain',
                            ...(owned && rod.glow
                              ? { ['--rod-glow-color' as string]: rod.color }
                              : { filter: `drop-shadow(0 3px 12px ${owned ? `${c}55` : 'rgba(0,0,0,0.55)'})` }
                            ),
                          } as React.CSSProperties} />
                      ) : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(18,20,27,0.92)' }} />}
                    </div>

                    {/* Right: name + effects + action */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0, }} />
                        <p className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.95rem', color: owned ? '#f4ecd8' : '#cfcabf', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rod.name}</p>
                        {isActive ? <ShopStatusPill kind="equipped" /> : owned ? <ShopStatusPill kind="owned" /> : null}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {effects.map(label => (
                          <span key={label} className="font-karla font-600" style={{
                            fontSize: '0.66rem', color: '#cdc8be',
                            background: 'rgba(18,20,27,0.92)', border: '1px solid rgba(255,255,255,0.13)',
                            padding: '0.16rem 0.5rem', borderRadius: 7, whiteSpace: 'nowrap',
                          }}>{label}</span>
                        ))}
                      </div>

                      <div style={{ marginTop: 'auto', paddingTop: 2 }}>
                        {!owned && captainLocked ? (
                          <motion.button
                            onClick={openMembership}
                            whileTap={{ scale: 0.97 }}
                            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                            className="font-karla font-700 uppercase tracking-[0.08em]"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '0.5rem 0.95rem', borderRadius: 9,
                              background: 'linear-gradient(180deg, rgba(240,192,64,0.24) 0%, rgba(196,169,106,0.11) 100%)',
                              border: '1px solid rgba(240,192,64,0.5)', color: '#f0d695', fontSize: '0.66rem', cursor: 'pointer',
                            }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>
                            Captain only
                          </motion.button>
                        ) : !owned && (
                          <motion.button
                            onClick={() => { if (rodBuyable && !isPending) handlePurchaseRod(rod.tier) }}
                            disabled={isPending}
                            whileTap={rodBuyable && !isPending ? { scale: 0.97 } : undefined}
                            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                            className="font-karla font-700 uppercase tracking-[0.08em]"
                            style={{
                              padding: '0.5rem 0.95rem', borderRadius: 9,
                              background: rodBuyable ? 'linear-gradient(180deg, rgba(240,192,64,0.26) 0%, rgba(240,192,64,0.13) 100%)' : 'rgba(16,18,24,0.9)',
                              border: `1px solid ${rodBuyable ? 'rgba(240,192,64,0.6)' : 'rgba(255,255,255,0.12)'}`,
                              color: rodBuyable ? '#f0c040' : '#9a8f6a', fontSize: '0.66rem',
                              cursor: rodBuyable && !isPending ? 'pointer' : 'default', opacity: isBuying ? 0.5 : 1,
                              boxShadow: rodBuyable ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
                            }}>
                            {isBuying ? '…' : !rodLevelMet ? `Fishing Lv ${rodReq} · ${rodReq - fishingLevel} to go` : canAfford ? `Buy · ${rod.cost.toLocaleString()} ⟡` : `Need ${(rod.cost - doubloons).toLocaleString()} ⟡`}
                          </motion.button>
                        )}
                        {owned && !isActive && (
                          <motion.button
                            onClick={() => handleEquipRod(rod.tier)}
                            disabled={isPending}
                            whileTap={!isPending ? { scale: 0.97 } : undefined}
                            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                            className="font-karla font-700 uppercase tracking-[0.08em]"
                            style={{
                              padding: '0.5rem 0.95rem', borderRadius: 9,
                              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)',
                              color: '#e0ddd8', fontSize: '0.66rem', cursor: isPending ? 'default' : 'pointer', opacity: isEquipping ? 0.5 : 1,
                            }}>
                            {isEquipping ? '…' : 'Equip'}
                          </motion.button>
                        )}
                        {/* SELL IT BACK. Only for rods that cost something in
                            the first place — the free starters and the earned
                            rods refund nothing, and a button that deletes a rod
                            for zero is a trap rather than an option. The server
                            blocks them too; this only stops the button drawing. */}
                        {owned && rod.cost > 0 && !rod.earnedOnly && (
                          sellConfirm === rod.tier ? (
                            <motion.button
                              onClick={() => handleSellRod(rod.tier)}
                              disabled={isPending}
                              whileTap={!isPending ? { scale: 0.97 } : undefined}
                              className="font-karla font-700 uppercase tracking-[0.08em]"
                              style={{
                                padding: '0.5rem 0.95rem', borderRadius: 9,
                                background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.5)',
                                color: '#f0a0a0', fontSize: '0.66rem',
                                cursor: isPending ? 'default' : 'pointer',
                                opacity: sellingRod === rod.tier ? 0.5 : 1,
                              }}>
                              {sellingRod === rod.tier
                                ? '…'
                                : `Sure? +${Math.floor(rod.cost * ROD_SELL_RATE).toLocaleString()} ⟡`}
                            </motion.button>
                          ) : (
                            <motion.button
                              onClick={() => { hapticTap(); setSellConfirm(rod.tier) }}
                              disabled={isPending}
                              whileTap={!isPending ? { scale: 0.97 } : undefined}
                              className="font-karla font-700 uppercase tracking-[0.08em]"
                              style={{
                                padding: '0.5rem 0.95rem', borderRadius: 9,
                                background: 'transparent', border: '1px solid rgba(255,255,255,0.16)',
                                color: '#9a9488', fontSize: '0.66rem',
                                cursor: isPending ? 'default' : 'pointer',
                              }}>
                              Sell
                            </motion.button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {visibleRods.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1.4rem 1rem' }}>
                  <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#8a857c' }}>No rods match these filters.</p>
                  <button type="button" onClick={() => { hapticTap(); setRodOwnership('all'); setRodMechanic(null) }}
                    className="font-karla font-700 tap"
                    style={{ marginTop: 9, padding: '0.4rem 0.9rem', borderRadius: 8, background: 'rgba(184,149,106,0.18)', border: '1px solid rgba(184,149,106,0.5)', color: '#e8cfa8', fontSize: '0.7rem', cursor: 'pointer' }}>
                    Clear filters
                  </button>
                </div>
              )}
            </div>

            {/* Completionist Rod — the capstone trophy card at the bottom */}
            <div className="mb-4" style={{
              ...tileSurface(c, { owned: compOwned, active: eligible, locked: !compOwned && !eligible }),
              padding: '1.1rem',
              boxShadow: '0 3px 14px rgba(0,0,0,0.5)',
            }}>
              {compOwned ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8' }}>{compRod.name}</p>
                    <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.48rem', color: c, background: `${c}20`, border: `1px solid ${c}40`, padding: '0.1rem 0.5rem', borderRadius: '2rem' }}>Mastery</span>
                    <div className="flex-1" />
                    {compActive && <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: c }}>Equipped</span>}
                    {!compActive && <span className="font-karla font-300 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#4ade80' }}>Owned</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCompModal(true)} className="font-karla font-700 flex-1"
                      style={{ fontSize: '0.68rem', padding: '0.45rem 0.5rem', borderRadius: 8, background: `${c}20`, border: `1px solid ${c}55`, color: c, cursor: 'pointer' }}>
                      View Rod
                    </button>
                    {!compActive && (
                      <button onClick={() => handleEquipRod(14)} disabled={isPending} className="font-karla font-700 flex-1"
                        style={{ fontSize: '0.68rem', padding: '0.45rem 0.5rem', borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)', color: '#f0ede8', cursor: isPending ? 'default' : 'pointer', opacity: equippingRod === 14 && isPending ? 0.5 : 1 }}>
                        {equippingRod === 14 && isPending ? '…' : 'Equip'}
                      </button>
                    )}
                    {compActive && <span className="flex-1 text-center" style={{ paddingTop: '0.4rem' }}><ShopStatusPill kind="active" label="In use" /></span>}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    {eligible ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill={c} stroke="none" aria-hidden style={{ flexShrink: 0 }}>
                        <path d="M12 2l2.4 6.9L21.5 9l-5.7 4.3 2.2 7-6-4.4-6 4.4 2.2-7L2.5 9l7.1-.1z" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                        <rect x="4.5" y="11" width="15" height="9.5" rx="1.5" />
                        <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
                      </svg>
                    )}
                    <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: eligible ? '#f0ede8' : '#6a6764', letterSpacing: '0.08em' }}>
                      {eligible ? 'Ready to Claim' : 'Completionist Rod'}
                    </p>
                    <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.48rem', color: eligible ? c : '#4a4845', background: eligible ? `${c}18` : 'rgba(16,18,24,0.9)', border: `1px solid ${eligible ? `${c}35` : 'rgba(255,255,255,0.1)'}`, padding: '0.1rem 0.5rem', borderRadius: '2rem' }}>Mastery</span>
                  </div>
                  <p className="font-karla font-300 mb-4" style={{ fontSize: '0.75rem', color: eligible ? '#a0a09a' : '#4a4845', lineHeight: 1.5 }}>
                    {eligible
                      ? 'You\'ve seen it all. Something extraordinary is waiting for you.'
                      : 'The sea hides its greatest secret from those who haven\'t seen everything it holds.'}
                  </p>
                  <div className="flex flex-col gap-2.5 mb-4">
                    {[
                      { label: 'Fishing Level', current: Math.min(playerLevel, 100), max: 100, done: isLevelOk },
                      { label: 'Species Discovered', current: uniqueSpeciesCaught, max: totalSpecies, done: isSpeciesOk },
                    ].map(({ label, current, max, done }) => (
                      <div key={label}>
                        <div className="flex justify-between mb-1">
                          <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: done ? '#4ade80' : '#6a6764' }}>{label}</span>
                          <span className="font-karla font-600" style={{ fontSize: '0.52rem', color: done ? '#4ade80' : '#6a6764' }}>{current} / {max}</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, (current / max) * 100)}%`, background: done ? '#4ade80' : `${c}80`, borderRadius: 2, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {eligible && (
                    <button onClick={handleClaimCompletionistRod} disabled={isPending} className="font-karla font-700 w-full"
                      style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', borderRadius: 9, background: `${c}22`, border: `1px solid ${c}65`, color: c, cursor: isPending ? 'default' : 'pointer', opacity: isClaiming ? 0.5 : 1 }}>
                      {isClaiming ? 'Claiming…' : 'Claim Your Reward'}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )
      })()}

      {/* ── Reels ── */}
      {section === 'reel' && (
        <div className="flex flex-col gap-2.5 mb-4">
          {REELS.map(reel => {
            const owned = reel.tier <= reelTier
            const isActive = reel.tier === reelTier
            const locked = reel.tier > reelTier + 1
            const isNext = reel.tier === reelTier + 1
            const reelReq = fishingGearLevelReq(reel)
            const reelLevelMet = fishingLevel >= reelReq
            const canAffordReel = isNext && doubloons >= reel.cost
            const reelReady = canAffordReel && reelLevelMet
            const c = reel.color
            const slowerPct = Math.round((1 - reel.needleSpeedMultiplier) * 100)

            return (
              <motion.div
                key={reel.tier}
                onClick={() => { if (isNext && reelReady && !isPending) handleBuyReel() }}
                whileTap={isNext && reelReady && !isPending ? { scale: 0.985 } : undefined}
                transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                style={{
                  ...tileSurface(c, { owned, active: isActive, ready: isNext && reelReady, locked }),
                  padding: '0.85rem 0.9rem',
                  opacity: isPending && isNext ? 0.6 : 1,
                  cursor: isNext && reelReady ? 'pointer' : 'default',
                }}
              >
                <Sheen />
                <div className="flex items-center gap-3" style={{ position: 'relative' }}>
                  <ReelIcon color={c} owned={owned} isActive={isActive} imageUrl={reel.imageUrl ? reel.imageUrl.replace(/\.png$/, '_thumb.png') : undefined} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-cinzel font-700 text-sm sm:text-base" style={{ color: owned ? '#f4ecd8' : '#7a756c' }}>
                        {reel.name}
                      </p>
                      {isActive && <ShopStatusPill kind="active" />}
                      {owned && !isActive && <ShopStatusPill kind="owned" />}
                      {locked && <ShopStatusPill kind="locked" />}
                    </div>
                    <p className="font-karla font-300 text-sm" style={{ color: owned ? '#9a958c' : '#6a655d' }}>{reel.description}</p>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="font-karla font-600"
                        style={{
                          fontSize: '0.62rem',
                          color: owned ? (slowerPct > 0 ? `${c}cc` : '#9a958c') : '#5a564e',
                          background: owned && slowerPct > 0 ? `${c}16` : 'rgba(16,18,24,0.9)',
                          border: `1px solid ${owned && slowerPct > 0 ? `${c}38` : 'rgba(255,255,255,0.1)'}`,
                          padding: '0.12rem 0.5rem', borderRadius: '2rem',
                        }}>
                        {slowerPct > 0 ? `Needle ${slowerPct}% slower` : 'Base speed'}
                      </span>
                      {isNext && (
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
                          fontSize: '0.56rem',
                          color: reelReady ? c : '#f0c040',
                          background: reelReady ? `${c}1c` : 'rgba(240,192,64,0.1)',
                          border: `1px solid ${reelReady ? `${c}55` : 'rgba(240,192,64,0.32)'}`,
                          padding: '0.14rem 0.5rem', borderRadius: 999,
                        }}>
                          {isPending ? 'Upgrading…' : !reelLevelMet ? `Fishing Lv ${reelReq} · ${reelReq - fishingLevel} to go` : canAffordReel ? 'Tap to upgrade' : `${(reel.cost - doubloons).toLocaleString()} ⟡ short`}
                        </span>
                      )}
                    </div>
                  </div>

                  {!owned && (
                    <p className="font-cinzel font-700 text-base shrink-0" style={{ color: reelReady ? c : '#f0c040', whiteSpace: 'nowrap' }}>
                      {reel.cost.toLocaleString()} ⟡
                    </p>
                  )}
                </div>
              </motion.div>
            )
          })}
          {reelTier >= REELS.length - 1 && (
            <p className="font-karla font-300 text-[#a0a09a] text-sm text-center">
              You have the finest reel in the sea.
            </p>
          )}
        </div>
      )}

      {/* ── Line ── */}
      {section === 'line' && (
        <div className="flex flex-col gap-2.5 mb-4">
          <div style={{
            ...tileSurface('#4ade80', {}),
            padding: '0.7rem 0.9rem', marginBottom: 4,
            display: 'flex', alignItems: 'center', gap: 9,
          }}>
            <Sheen />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, position: 'relative' }}>
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
            </svg>
            <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: '#9ab39c', lineHeight: 1.4, position: 'relative' }}>
              Lines are earned by catching unique species — no purchase needed.
            </p>
          </div>
          {LINES.map(line => {
            const owned = line.tier <= lineTier
            const isActive = line.tier === lineTier
            const locked = !owned && line.unlockAt > 0
            const c = line.color
            const smallerPct = Math.round((1 - line.penaltyMultiplier) * 100)

            return (
              <div
                key={line.tier}
                style={{
                  ...tileSurface(c, { owned, active: isActive, locked }),
                  padding: '0.85rem 0.9rem',
                }}
              >
                <Sheen />
                <div className="flex items-center gap-3" style={{ position: 'relative' }}>
                  <LineIcon color={c} owned={owned} isActive={isActive} imageUrl={line.imageUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-cinzel font-700 text-base" style={{ color: owned ? '#f4ecd8' : '#7a756c' }}>
                        {line.name}
                      </p>
                      {isActive && <ShopStatusPill kind="active" />}
                      {owned && !isActive && <ShopStatusPill kind="owned" />}
                      {locked && <ShopStatusPill kind="locked" />}
                    </div>
                    <p className="font-karla font-300 text-sm" style={{ color: owned ? '#9a958c' : '#6a655d' }}>{line.description}</p>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="font-karla font-600"
                        style={{
                          fontSize: '0.62rem',
                          color: owned ? (smallerPct > 0 ? `${c}cc` : '#9a958c') : '#5a564e',
                          background: owned && smallerPct > 0 ? `${c}16` : 'rgba(16,18,24,0.9)',
                          border: `1px solid ${owned && smallerPct > 0 ? `${c}38` : 'rgba(255,255,255,0.1)'}`,
                          padding: '0.12rem 0.5rem', borderRadius: '2rem',
                        }}>
                        {smallerPct > 0 ? `Snag zones ${smallerPct}% smaller` : 'Standard snag zones'}
                      </span>
                      {locked && (
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
                          fontSize: '0.56rem', color: '#9a8f6a',
                          background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.25)',
                          padding: '0.14rem 0.5rem', borderRadius: 999,
                        }}>
                          {line.unlockAt} species to unlock
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Completionist Rod claim reveal — the capstone "you've seen it all"
           moment. Fires once on a successful claim: the real rod art rises on a
           slow rotating ray-fan + gold rings, its seven folded gifts stream in,
           tap to dismiss. ── */}
      {showClaimReveal && (() => {
        const revRod = RODS.find(r => r.tier === 14)!
        // Prismatic palette sampled from the rod's four energy strands
        // (red / amber / green / blue) so the whole reveal reads multi-colored.
        const prism = ['#f26d6d', '#f2c14e', '#57d06a', '#5aa9f0']
        const gifts = ['Always double catch', '50% miss retry', 'Snag immune', '+50% rare bias', '+16° catch zone', 'Perfect +5°', 'Fastest bites']
        return (
          <motion.div
            key="comp-claim-reveal"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
            data-any-key
            onClick={() => setShowClaimReveal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 100000,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(ellipse at center, rgba(12,12,20,0.93) 0%, rgba(4,5,9,0.97) 100%)',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              padding: '2rem', textAlign: 'center', cursor: 'pointer', overflow: 'hidden',
            }}
          >
            {/* Slow rotating prismatic ray-fan behind the rod — the four strand
                colors blended into one spinning wheel of light. */}
            <motion.div aria-hidden
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 0.5, scale: 1, rotate: 360 }}
              transition={{ opacity: { duration: 0.8 }, scale: { duration: 0.9, ease: 'easeOut' }, rotate: { duration: 30, ease: 'linear', repeat: Infinity } }}
              style={{
                position: 'absolute', width: 620, height: 620, borderRadius: '50%',
                background: `conic-gradient(from 0deg, ${prism[0]}33, ${prism[1]}33, ${prism[2]}33, ${prism[3]}33, ${prism[0]}33, ${prism[1]}33, ${prism[2]}33, ${prism[3]}33, ${prism[0]}33)`,
                maskImage: 'radial-gradient(circle, transparent 26%, #000 40%, transparent 72%)',
                WebkitMaskImage: 'radial-gradient(circle, transparent 26%, #000 40%, transparent 72%)',
              }}
            />
            {/* Expanding rings, each in a strand color. */}
            {[0, 0.14, 0.28].map((d, i) => (
              <motion.div key={i} aria-hidden
                initial={{ scale: 0, opacity: 0.85 }} animate={{ scale: 4.6, opacity: 0 }}
                transition={{ duration: 1.5, ease: 'easeOut', delay: 0.18 + d }}
                style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', border: `2px solid ${prism[i]}b0`, boxShadow: `0 0 26px ${prism[i]}88` }}
              />
            ))}
            <motion.span className="font-karla font-700 uppercase"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 0.85, y: 0 }} transition={{ delay: 0.3 }}
              style={{ position: 'relative', fontSize: '0.62rem', letterSpacing: '0.42em', color: '#e9e4d6', marginBottom: '0.9rem', textIndent: '0.42em' }}
            >
              Completionist
            </motion.span>
            {/* The rod, rising in — glow layered in all four strand colors. */}
            <motion.div
              initial={{ scale: 0, opacity: 0, y: 24 }}
              animate={{ scale: [0, 1.18, 1], opacity: 1, y: 0 }}
              transition={{ duration: 0.85, ease: 'easeOut', times: [0, 0.62, 1] }}
              style={{ position: 'relative', marginBottom: '1.1rem' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/rod_completionist_thumb.png" alt={revRod.name} width={230} height={230}
                style={{ width: 230, height: 230, objectFit: 'contain', filter: `drop-shadow(0 0 12px ${prism[0]}aa) drop-shadow(0 0 20px ${prism[3]}88) drop-shadow(0 0 30px ${prism[2]}77) drop-shadow(0 0 44px ${prism[1]}88)` }} />
            </motion.div>
            <motion.p className="font-cinzel font-700"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              style={{
                position: 'relative', fontSize: '2rem', lineHeight: 1.05, marginBottom: '0.35rem',
                background: `linear-gradient(100deg, ${prism[0]} 0%, ${prism[1]} 34%, ${prism[2]} 66%, ${prism[3]} 100%)`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                filter: 'drop-shadow(0 1px 10px rgba(0,0,0,0.6))',
              }}
            >
              {revRod.name}
            </motion.p>
            <motion.p className="font-karla"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.72 }}
              style={{ position: 'relative', fontSize: '0.82rem', color: '#cfcabb', maxWidth: 330, lineHeight: 1.55, marginBottom: '1.1rem' }}
            >
              You have seen every fish the sea holds. Every gift it gave you now folds into one rod, yours to forge as you please.
            </motion.p>
            {/* The seven folded gifts, streaming in — each in a strand color. */}
            <div className="flex flex-wrap justify-center gap-1.5" style={{ position: 'relative', maxWidth: 340, marginBottom: '1.5rem' }}>
              {gifts.map((g, i) => {
                const gc = prism[i % prism.length]
                return (
                  <motion.span key={g} className="font-karla font-600"
                    initial={{ opacity: 0, scale: 0.7, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.9 + i * 0.09, type: 'spring', stiffness: 320, damping: 20 }}
                    style={{ fontSize: '0.62rem', color: `${gc}ee`, background: `${gc}1c`, border: `1px solid ${gc}44`, padding: '0.16rem 0.55rem', borderRadius: '2rem' }}
                  >
                    {g}
                  </motion.span>
                )
              })}
            </div>
            <motion.span className="font-karla font-700 uppercase"
              initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 1.7 }}
              style={{ position: 'relative', fontSize: '0.64rem', letterSpacing: '0.2em', color: '#9a8a60' }}
            >
              Tap to continue
            </motion.span>
          </motion.div>
        )
      })()}
    </div>
  )
}

// ── Shared item-card chrome ──────────────────────────────────────────────
// One surface recipe so every Tackle Shop section (bait/hook/rod/reel/line)
// reads as the same family: an accent-tinted gradient body, a brighter accent
// top-rim, soft depth, and state-driven emphasis (owned glows, ready gets a
// gold-ready edge, locked goes flat/dim).
type TileState = { owned?: boolean; active?: boolean; ready?: boolean; locked?: boolean }
function tileSurface(c: string, s: TileState): React.CSSProperties {
  const { owned, active, ready, locked } = s
  return {
    position: 'relative',
    // NEUTRAL BODY. This was `linear-gradient(160deg, ${c}20, ...)` - the item's
    // own hue washed diagonally across the entire card. A rod list is five
    // tinted cards; the bait grid is EIGHT different hues two abreast, which is
    // a swatch book, not a shop. A tinted card under tinted chips under a
    // tinted button is the whole stack that reads as generated.
    //
    // The colour survives where it does work: the top edge, which is how a row
    // says equipped / owned / ready without repainting itself.
    background: locked
      ? 'linear-gradient(180deg, rgba(13,15,20,0.94) 0%, rgba(7,9,13,0.96) 100%)'
      : owned || active
        ? 'linear-gradient(180deg, rgba(28,31,39,0.97) 0%, rgba(14,16,22,0.98) 100%)'
        : 'linear-gradient(180deg, rgba(19,21,27,0.96) 0%, rgba(11,13,18,0.97) 100%)',
    border: `1px solid ${active ? c + '55' : owned ? c + '2e' : ready ? c + '38' : 'rgba(255,255,255,0.09)'}`,
    borderTop: `1.5px solid ${active ? c : owned ? c + 'aa' : ready ? c + '99' : locked ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.16)'}`,
    borderRadius: 15,
    boxShadow: '0 3px 14px rgba(0,0,0,0.5)',
    overflow: 'hidden',
  }
}
// Glossy top sheen — drop inside any tileSurface card as the first child.
// NO COLOURED GLOW ANYWHERE ON THIS PAGE.
//
// Tinted surfaces with a matching halo behind them is the single most
// generated-looking thing a card can do, and this shop had eleven of them: a
// coloured wash under every owned item, a coloured drop-shadow on every piece
// of art, a coloured box-shadow on every active one, and a radial pool behind
// the category tiles. Five categories each with their own hue turned the page
// into a light show, and every one of those glows was the UI colouring itself
// rather than anything in the picture.
//
// The photography is the only colour now. Surfaces are neutral, shadows are
// black, and state is said with a border and with brightness, which is what
// tackle in a dark shop would actually do.
//
// ART FORWARD. Every item icon used to be a 28px image inside a bordered,
// tinted 38px box: a picture of a reel, wearing a picture frame, on a card.
// Three surfaces to say one thing, and the smallest of them was the only one
// carrying any information.
//
// The category tiles on the shop's front page already worked this out — their
// own comment says "Art sits DIRECTLY on the tile, like the Forge. The old
// nested black disc-in-a-faint-square was the muddy double layer." The item
// rows never got the same treatment.
//
// So: no box, no border, no tint. The art is the object, drawn twice the size
// it was, lit by its own colour when owned and dimmed to iron when it is not.
const ART_BOX = 'w-[54px] h-[54px] sm:w-16 sm:h-16 shrink-0 flex items-center justify-center'

/** How a piece of tackle reads when you do not own it yet: still legible, but
 *  clearly cold metal rather than a thing with your hands on it. */
function artFilter(owned: boolean, isActive: boolean): string {
  if (!owned) return 'grayscale(0.92) brightness(0.5)'
  // Black, not the item's colour. A shadow tells you the thing is sitting on
  // something; a coloured halo tells you a designer picked a hex.
  return isActive
    ? 'drop-shadow(0 3px 8px rgba(0,0,0,0.75)) brightness(1.08)'
    : 'drop-shadow(0 2px 6px rgba(0,0,0,0.65))'
}

function Sheen() {
  return <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 20%)', pointerEvents: 'none' }} />
}

function HookIcon({ tier, color, owned, isActive, imageUrl, glowClass }: { tier: number; color: string; owned: boolean; isActive: boolean; imageUrl?: string; glowClass?: string }) {
  const stroke = owned ? color : '#4a4845'
  const fill   = owned ? color : '#4a4845'
  const icons: Record<number, React.ReactNode> = {
    0: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <circle cx="12" cy="3" r="1.2" fill={fill} stroke="none"/>
        <circle cx="9" cy="7" r="0.5" fill={stroke} stroke="none" opacity="0.5"/>
        <circle cx="13" cy="10" r="0.4" fill={stroke} stroke="none" opacity="0.4"/>
      </svg>
    ),
    1: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 3 L13 8 L11 12"/>
        <path d="M11 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <circle cx="13" cy="3" r="1.3" fill={fill} stroke="none"/>
      </svg>
    ),
    2: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <path d="M9.5 15.5 L7.5 13.5"/>
        <circle cx="12" cy="3" r="1.3" fill={fill} stroke="none"/>
      </svg>
    ),
    3: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <ellipse cx="12" cy="7" rx="2.5" ry="1" strokeWidth="1.4"/>
        <circle cx="12" cy="3" r="1.3" fill={fill} stroke="none"/>
      </svg>
    ),
    4: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v7"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <path d="M9 3 C9 1.5 15 1.5 15 3 C15 4.5 12 5 12 5"/>
        <path d="M9.5 15.5 L7.5 13.5"/>
      </svg>
    ),
    5: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <circle cx="12" cy="3" r="1.3" fill={fill} stroke="none"/>
        <circle cx="17" cy="5" r="0.8" fill={fill} stroke="none" opacity="0.7"/>
        <circle cx="15" cy="9" r="0.6" fill={fill} stroke="none" opacity="0.5"/>
        <circle cx="7" cy="7" r="0.7" fill={fill} stroke="none" opacity="0.6"/>
      </svg>
    ),
    6: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v7"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <path d="M9 2 L12 5 L15 2"/>
        <path d="M9 2 L9 4M15 2 L15 4"/>
        <path d="M9.5 15.5 L7.5 13.5"/>
      </svg>
    ),
  }

  return (
    <div className={ART_BOX}>
      {imageUrl ? (
        <img
          src={imageUrl} alt=""
          loading="lazy"
          decoding="async"
          className={owned ? glowClass : undefined}
          style={{
            width: '100%', height: '100%', objectFit: 'contain',
            opacity: owned ? 1 : 0.28,
            ...(owned && glowClass
              ? {}
              : { filter: owned ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.65))' : 'grayscale(0.92) brightness(0.5)' }),
          } as React.CSSProperties}
        />
      ) : (
        icons[tier] ?? icons[0]
      )}
    </div>
  )
}

function LineIcon({ color, owned, isActive, imageUrl }: { color: string; owned: boolean; isActive: boolean; imageUrl?: string }) {
  return (
    <div className={ART_BOX}>
      {imageUrl
        ? <img src={imageUrl} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: artFilter(owned, isActive) }} />
        : (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={owned ? color : '#4a4845'} strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 7 Q7 4 12 7 Q17 10 21 7" />
            <path d="M3 12 Q7 9 12 12 Q17 15 21 12" />
            <path d="M3 17 Q7 14 12 17 Q17 20 21 17" />
          </svg>
        )
      }
    </div>
  )
}

function ReelIcon({ color, owned, isActive, imageUrl }: { color: string; owned: boolean; isActive: boolean; imageUrl?: string }) {
  const sc = owned ? color : '#4a4845'
  // Only the drawn fallback needs this; the photo is dimmed by artFilter.
  const op = owned ? 1 : 0.45
  return (
    <div className={ART_BOX}>
      {imageUrl
        ? <img src={imageUrl} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: artFilter(owned, isActive) }} />
        : (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <circle cx="10" cy="12" r="7.5" stroke={sc} strokeWidth="1.3" opacity={op * 0.9} />
            <circle cx="10" cy="12" r="4.5" stroke={sc} strokeWidth="1" fill={sc} fillOpacity={owned ? 0.1 : 0.04} opacity={op * 0.8} />
            <circle cx="10" cy="12" r="1.8" fill={sc} opacity={op * 0.85} />
            <line x1="17.5" y1="12" x2="21.5" y2="9.5" stroke={sc} strokeWidth="1.6" strokeLinecap="round" opacity={op} />
            <circle cx="21.5" cy="9.5" r="1.5" fill={sc} opacity={op * 0.85} />
          </svg>
        )
      }
    </div>
  )
}

function GearIcon({ color, owned, isActive, label }: { color: string; owned: boolean; isActive: boolean; label: string }) {
  const bg     = owned
    ? 'linear-gradient(180deg, rgba(28,31,39,0.97) 0%, rgba(15,17,23,0.98) 100%)'
    : 'linear-gradient(180deg, rgba(19,21,27,0.96) 0%, rgba(11,13,18,0.97) 100%)'
  const border = owned ? `${color}35` : 'rgba(255,255,255,0.11)'

  return (
    <div
      className="w-[38px] h-[38px] sm:w-12 sm:h-12 shrink-0 flex items-center justify-center"
      style={{
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: 'none',
      }}
    >
      <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: owned ? color : '#4a4845' }}>
        {label}
      </span>
    </div>
  )
}
