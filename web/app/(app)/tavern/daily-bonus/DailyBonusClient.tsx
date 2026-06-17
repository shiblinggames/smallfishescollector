'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { claimDailyBonus, claimDailyBait, claimWeeklyCrate } from '@/app/actions/dailyBonus'
import { openMembership } from '@/components/MembershipModal'

const GEM = '#a78bfa'
const BAIT = '#4ade80'
const GOLD = '#f0c040'

// Slot-strip dimensions + spin timing (mirrors the in-water fishing crate feel).
const TILE_W = 96
const TILE_H = 82
const SPIN_MS = 2300

type CrateClaim = Extract<Awaited<ReturnType<typeof claimWeeklyCrate>>, { claimed: true }>
type Loot = CrateClaim['loot']
type GoodLoot = Exclude<Loot, { error: string }>
type CratePhase = 'idle' | 'rolling' | 'revealed'

const BAIT_IMG: Record<string, string> = { worm: '/worms.png', chum: '/chum.png' }
function isRare(l: GoodLoot): boolean {
  return l.type === 'skin' || l.type === 'hat' || l.type === 'boat' || l.type === 'pet'
}

export default function DailyBonusClient({ isPremium, gemsClaimed: g0, baitClaimed: b0, crateClaimed: c0 }: {
  isPremium: boolean
  gemsClaimed: boolean
  baitClaimed: boolean
  crateClaimed: boolean
}) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [gemsClaimed, setGemsClaimed] = useState(g0)
  const [baitClaimed, setBaitClaimed] = useState(b0)
  const [crateClaimed, setCrateClaimed] = useState(c0)
  const [loading, setLoading] = useState<'gems' | 'bait' | 'crate' | null>(null)

  const [cratePhase, setCratePhase] = useState<CratePhase>('idle')
  const [crateStrip, setCrateStrip] = useState<GoodLoot[] | null>(null)
  const [crateLoot, setCrateLoot] = useState<GoodLoot | null>(null)
  const [rareOverlay, setRareOverlay] = useState<GoodLoot | null>(null)

  const gemAmount = isPremium ? 150 : 50
  const baitName = isPremium ? 'Chum' : 'Worms'
  const baitImg = isPremium ? '/chum.png' : '/worms.png'
  const crateName = isPremium ? 'Gold Crate' : 'Wooden Crate'
  const crateClosed = isPremium ? '/goldcrateclosed.png' : '/crateclosed.png'
  const crateOpen = isPremium ? '/goldcrateopen.png' : '/crateopen.png'

  const allDone = gemsClaimed && baitClaimed && crateClaimed

  async function claimGems() {
    if (gemsClaimed || loading) return
    setLoading('gems')
    const r = await claimDailyBonus()
    if (r.claimed) {
      setGemsClaimed(true)
      if (r.gems !== undefined) window.dispatchEvent(new CustomEvent('gems-changed', { detail: r.gems }))
    }
    setLoading(null)
  }

  async function claimBait() {
    if (baitClaimed || loading) return
    setLoading('bait')
    const r = await claimDailyBait()
    if (r.claimed) setBaitClaimed(true)
    setLoading(null)
  }

  async function claimCrate() {
    if (crateClaimed || loading || cratePhase !== 'idle') return
    setLoading('crate')
    const r = await claimWeeklyCrate()
    setLoading(null)
    if (!r.claimed) return
    setCrateClaimed(true)

    const loot = r.loot
    if ('error' in loot) { setCratePhase('revealed'); router.refresh(); return }

    // Build the slot strip — fillers flashing past, the real reward last so
    // the spin visibly lands on it (same trick as the fishing crate).
    setCrateStrip([...buildFillers(), loot])
    setCratePhase('rolling')

    window.setTimeout(() => {
      setCratePhase('revealed')
      setCrateLoot(loot)
      router.refresh()
      if (isRare(loot)) setRareOverlay(loot)   // cosmetics/pets get the big moment
    }, SPIN_MS + 120)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Link href="/tavern" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#a89878', textDecoration: 'none' }}>← Tavern</Link>
        {isPremium && (
          <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: GOLD, background: `${GOLD}16`, border: `1px solid ${GOLD}44`, borderRadius: 999, padding: '0.2rem 0.5rem' }}>Captain</span>
        )}
      </div>
      <h1 className="font-cinzel font-800" style={{ fontSize: '1.6rem', color: '#f5f0e6', textAlign: 'center', marginBottom: 2 }}>Daily Haul</h1>
      <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9a948a', textAlign: 'center', marginBottom: 20 }}>
        {allDone ? "You've claimed it all. Fair winds tomorrow." : 'Stop by every day. The crate refreshes each Monday.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ClaimCard
          accent={GEM} eyebrow="Daily Gems" title={`+${gemAmount} ◆`}
          sub={isPremium ? 'Your Captain gem stipend, every day.' : 'Captains earn 150 a day.'}
          claimed={gemsClaimed} claimedSub="Back tomorrow." loading={loading === 'gems'} onClaim={claimGems}
          glyph={<span className="font-cinzel font-800" style={{ fontSize: '2rem', color: GEM, lineHeight: 1 }}>◆</span>}
        />

        <ClaimCard
          accent={BAIT} eyebrow="Daily Bait" title={`+20 ${baitName}`}
          sub={isPremium ? 'Premium chum to draw the big ones.' : 'Captains get chum instead.'}
          claimed={baitClaimed} claimedSub="Back tomorrow." loading={loading === 'bait'} onClaim={claimBait}
          img={baitImg}
        />

        <CrateCard
          isPremium={isPremium} crateName={crateName} crateClosed={crateClosed} crateOpen={crateOpen}
          phase={cratePhase} strip={crateStrip} loot={crateLoot}
          claimed={crateClaimed} loading={loading === 'crate'} onClaim={claimCrate}
        />
      </div>

      {!isPremium && (
        <button type="button" onClick={openMembership} className="font-karla" style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 18, fontSize: '0.74rem', color: GOLD, background: 'none', border: 'none', cursor: 'pointer' }}>
          Become a Captain for 150 gems, chum, and a gold crate →
        </button>
      )}

      {/* Full-screen reveal for rare pulls (cosmetics / pets) */}
      {mounted && rareOverlay && createPortal(
        <RareReveal loot={rareOverlay} onClose={() => setRareOverlay(null)} />,
        document.body,
      )}
    </div>
  )
}

function buildFillers(): GoodLoot[] {
  const pool: GoodLoot[] = [
    { type: 'doubloons', amount: 75 },
    { type: 'doubloons', amount: 150 },
    { type: 'doubloons', amount: 300 },
    { type: 'doubloons', amount: 500 },
    { type: 'bait', baitType: 'worm', baitName: 'Worms', quantity: 5 },
    { type: 'bait', baitType: 'chum', baitName: 'Chum', quantity: 5 },
    { type: 'bait', baitType: 'minnow', baitName: 'Minnow', quantity: 5 },
    { type: 'bait', baitType: 'night_crawler', baitName: 'Night Crawler', quantity: 5 },
  ]
  const out: GoodLoot[] = []
  for (let i = 0; i < 18; i++) out.push(pool[Math.floor(Math.random() * pool.length)])
  return out
}

function lootLabel(loot: GoodLoot): string {
  switch (loot.type) {
    case 'doubloons': return `${loot.amount.toLocaleString()} ⟡`
    case 'bait':      return `${loot.quantity} ${loot.baitName}`
    case 'skin':      return `${loot.skinName} color`
    case 'hat':       return `${loot.hatName} bandana`
    case 'boat':      return `${loot.boatName} boat`
    case 'pet':       return `${loot.petName}${loot.isDuplicate ? ' (duplicate)' : '!'}`
  }
}

function lootImg(loot: GoodLoot): string | undefined {
  if (loot.type === 'hat') return loot.hatImageUrl
  if (loot.type === 'boat') return loot.boatImageUrl
  if (loot.type === 'pet') return loot.petImageUrl
  if (loot.type === 'bait') return BAIT_IMG[loot.baitType]
  return undefined
}

function SlotTile({ loot }: { loot: GoodLoot }) {
  const img = lootImg(loot)
  const isSkin = loot.type === 'skin'
  return (
    <div style={{ width: TILE_W, height: TILE_H, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <div style={{ width: 40, height: 40, borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
          : isSkin
            ? <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundImage: `url(/fishing_${loot.skinId}_rest.png)`, backgroundSize: '420% auto', backgroundPosition: '60% 68%' }} />
            : <span className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: GOLD }}>⟡</span>}
      </div>
      <span className="font-karla font-600 truncate" style={{ fontSize: '0.54rem', color: '#cfc6b0', maxWidth: TILE_W - 8, textAlign: 'center' }}>{lootLabel(loot)}</span>
    </div>
  )
}

function ClaimCard({ accent, eyebrow, title, sub, claimed, claimedSub, loading, onClaim, img, glyph }: {
  accent: string; eyebrow: string; title: string; sub: string
  claimed: boolean; claimedSub: string; loading: boolean; onClaim: () => void
  img?: string; glyph?: React.ReactNode
}) {
  return (
    <div style={{
      background: claimed ? 'rgba(8,8,6,0.7)' : 'linear-gradient(180deg, rgba(14,16,22,0.94) 0%, rgba(7,9,12,0.97) 100%)',
      border: `1px solid ${claimed ? 'rgba(255,255,255,0.08)' : `${accent}44`}`,
      borderRadius: 16, padding: '0.95rem 1rem',
      boxShadow: claimed ? 'none' : `0 6px 22px rgba(0,0,0,0.4), 0 0 20px ${accent}12`,
      opacity: claimed ? 0.62 : 1, transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ position: 'relative', width: 58, height: 58, flexShrink: 0, borderRadius: 13, background: claimed ? 'rgba(255,255,255,0.04)' : `${accent}18`, border: `1px solid ${claimed ? 'rgba(255,255,255,0.1)' : `${accent}40`}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {claimed ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          ) : img ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={img} alt="" aria-hidden style={{ width: 42, height: 42, objectFit: 'contain' }} />
          ) : glyph}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.54rem', color: claimed ? '#7a7674' : `${accent}cc` }}>{eyebrow}</p>
          <p className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: claimed ? '#8a8884' : '#f3efe6', lineHeight: 1.15, margin: '2px 0' }}>{title}</p>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a857c', lineHeight: 1.4 }}>{claimed ? claimedSub : sub}</p>
        </div>
        {!claimed && (
          <motion.button whileTap={{ scale: 0.93 }} onClick={onClaim} disabled={loading}
            className="font-cinzel font-700 uppercase tracking-[0.06em]"
            style={{ flexShrink: 0, padding: '0.6rem 1rem', borderRadius: 11, background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, fontSize: '0.74rem', cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? '…' : 'Claim'}
          </motion.button>
        )}
      </div>
    </div>
  )
}

function CrateCard({ isPremium, crateName, crateClosed, crateOpen, phase, strip, loot, claimed, loading, onClaim }: {
  isPremium: boolean; crateName: string; crateClosed: string; crateOpen: string
  phase: CratePhase; strip: GoodLoot[] | null; loot: GoodLoot | null
  claimed: boolean; loading: boolean; onClaim: () => void
}) {
  const accent = isPremium ? GOLD : '#c8a06a'
  const rolling = phase === 'rolling'
  const opened = phase === 'revealed' && !!loot
  const dim = claimed && phase === 'idle'   // already opened on a prior visit
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(28,22,10,0.95) 0%, rgba(12,9,5,0.97) 100%)',
      border: `1px solid ${dim ? 'rgba(255,255,255,0.08)' : `${accent}55`}`,
      borderRadius: 18, padding: '1.1rem 1.05rem',
      boxShadow: dim ? 'none' : `0 8px 28px rgba(0,0,0,0.45), 0 0 26px ${accent}1c`,
      opacity: dim ? 0.62 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.54rem', color: `${accent}cc` }}>Weekly Crate</p>
        <span className="font-karla font-600" style={{ fontSize: '0.56rem', color: '#8a857c' }}>Resets Monday</span>
      </div>

      {/* Rolling: slot strip that decelerates onto the reward */}
      {rolling && strip ? (
        <div style={{
          margin: '6px auto 2px', width: TILE_W, height: TILE_H, overflow: 'hidden', borderRadius: 12,
          border: `1px solid ${accent}44`, background: 'rgba(0,0,0,0.4)',
          maskImage: 'linear-gradient(to right, transparent 0%, #000 16%, #000 84%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 16%, #000 84%, transparent 100%)',
        }}>
          <motion.div
            style={{ display: 'flex', width: strip.length * TILE_W, height: TILE_H }}
            initial={{ x: 0 }}
            animate={{ x: -((strip.length - 1) * TILE_W) }}
            transition={{ duration: SPIN_MS / 1000, ease: [0.15, 0.8, 0.3, 1] }}
          >
            {strip.map((t, i) => <SlotTile key={i} loot={t} />)}
          </motion.div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <motion.div
            animate={opened ? { scale: [0.8, 1.12, 1] } : dim ? {} : { y: [0, -4, 0] }}
            transition={opened ? { type: 'spring', stiffness: 320, damping: 14 } : { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: 76, height: 76, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
          >
            <motion.div aria-hidden
              animate={{ opacity: opened ? 1 : dim ? 0.3 : 0.85, scale: opened ? [0.6, 1.6, 1.15] : 1 }}
              transition={opened ? { duration: 0.6, ease: 'easeOut' } : { duration: 0.3 }}
              style={{ position: 'absolute', inset: -8, borderRadius: '50%', background: `radial-gradient(circle, ${accent}55 0%, transparent 70%)`, pointerEvents: 'none' }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={opened ? crateOpen : crateClosed} alt={crateName} style={{ width: 70, height: 70, objectFit: 'contain', filter: dim ? 'grayscale(0.5) brightness(0.7)' : `drop-shadow(0 4px 12px ${accent}66)` }} />
          </motion.div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: dim ? '#8a8884' : '#f5ecd6', lineHeight: 1.1 }}>{crateName}</p>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a89e86', lineHeight: 1.45, marginTop: 3 }}>
              {isPremium ? 'A free gold crate every week, full loot inside.' : 'A free crate weekly. Captains open a gold one.'}
            </p>
          </div>
        </div>
      )}

      {/* Inline reveal for common pulls (rares get the full-screen moment) */}
      <AnimatePresence>
        {opened && loot && !isRare(loot) && (
          <motion.div initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} transition={{ type: 'spring', stiffness: 320, damping: 26 }} style={{ marginTop: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 0.85rem', borderRadius: 12, background: `${accent}14`, border: `1px solid ${accent}40` }}>
              <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 9, background: `${accent}1a`, border: `1px solid ${accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {lootImg(loot)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={lootImg(loot)} alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
                  : <span className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: accent }}>⟡</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: `${accent}cc` }}>You hauled up</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f3efe6', lineHeight: 1.2 }}>{lootLabel(loot)}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 'idle' && !claimed && (
        <motion.button whileTap={{ scale: 0.96 }} onClick={onClaim} disabled={loading}
          className="font-cinzel font-700 uppercase tracking-[0.08em] w-full"
          style={{ marginTop: 12, padding: '0.8rem', borderRadius: 12, background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, fontSize: '0.82rem', cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? 'Cracking the lid…' : 'Open Crate'}
        </motion.button>
      )}
      {rolling && (
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.6rem', color: `${accent}cc`, textAlign: 'center', marginTop: 12 }}>Rolling…</p>
      )}
      {dim && (
        <p className="font-karla" style={{ fontSize: '0.7rem', color: '#7a7674', textAlign: 'center', marginTop: 10 }}>Opened this week. Back Monday.</p>
      )}
    </div>
  )
}

// ── Full-screen rare reveal (cosmetics / pets) ───────────────────────────────
function RareReveal({ loot, onClose }: { loot: GoodLoot; onClose: () => void }) {
  const isPet = loot.type === 'pet'
  const accent = isPet && 'petAccent' in loot ? loot.petAccent : '#4ade80'
  const img = lootImg(loot)
  const eyebrow = isPet
    ? ('isDuplicate' in loot && loot.isDuplicate ? 'Duplicate Pet' : 'Pet Unlocked!')
    : 'Rare Find!'
  const sub =
    loot.type === 'pet' ? ('isDuplicate' in loot && loot.isDuplicate ? 'You already own this one.' : 'Equip it from your Appearance loadout.')
    : loot.type === 'skin' ? 'New character color unlocked.'
    : loot.type === 'hat'  ? 'New bandana unlocked.'
    : 'New boat unlocked.'

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(2,4,8,0.86)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
    >
      {/* Rays */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scale: 0.6, rotate: 0 }} animate={{ opacity: 0.5, scale: 1, rotate: 360 }}
        transition={{ opacity: { duration: 0.5 }, scale: { duration: 0.6 }, rotate: { duration: 24, repeat: Infinity, ease: 'linear' } }}
        style={{ position: 'absolute', width: 460, height: 460, background: `conic-gradient(from 0deg, ${accent}00, ${accent}33, ${accent}00, ${accent}33, ${accent}00, ${accent}33, ${accent}00)`, borderRadius: '50%', pointerEvents: 'none' }}
      />
      <motion.div
        initial={{ scale: 0.85, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 320, textAlign: 'center' }}
      >
        <p className="font-karla font-700 uppercase tracking-[0.22em]" style={{ fontSize: '0.6rem', color: accent, marginBottom: 14 }}>{eyebrow}</p>
        <motion.div
          initial={{ scale: 0.4, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 14, delay: 0.1 }}
          style={{ width: 150, height: 150, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {img
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={img} alt="" style={{ width: 150, height: 150, objectFit: 'contain', filter: `drop-shadow(0 0 28px ${accent}88)` }} />
            : loot.type === 'skin'
              ? <div style={{ width: 120, height: 120, borderRadius: 18, backgroundImage: `url(/fishing_${loot.skinId}_rest.png)`, backgroundSize: '420% auto', backgroundPosition: '60% 68%', border: `2px solid ${accent}66`, boxShadow: `0 0 28px ${accent}55` }} />
              : null}
        </motion.div>
        <p className="font-cinzel font-800" style={{ fontSize: '1.55rem', color: accent, lineHeight: 1.1, textShadow: `0 0 24px ${accent}80` }}>{lootLabel(loot)}</p>
        <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a8a29a', marginTop: 8 }}>{sub}</p>
        <button onClick={onClose} className="font-cinzel font-700 uppercase tracking-[0.1em]"
          style={{ marginTop: 22, padding: '0.7rem 1.6rem', borderRadius: 12, background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, fontSize: '0.78rem', cursor: 'pointer' }}>
          Stow it
        </button>
      </motion.div>
    </motion.div>
  )
}
