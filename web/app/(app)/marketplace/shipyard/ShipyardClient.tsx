'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SHIPS, getShip, MAX_SHIP_TIER } from '@/lib/ships'
import { buyShip, renameShip } from '@/app/shipyard/actions'
import { EXPEDITION_SHIP_STATS, raidItemSlotsForTier } from '@/lib/expeditions'
import { navLevelReqForShip } from '@/lib/gearGating'
import ShopHeader from '@/components/ShopHeader'
import ShopBuyButton from '@/components/ShopBuyButton'
import ShopStatusPill from '@/components/ShopStatusPill'

export default function ShipyardClient({ shipTier: initialTier, doubloons: initialDoubloons, navLevel, shipName: initialShipName }: { shipTier: number; doubloons: number; navLevel: number; shipName: string | null }) {
  const router = useRouter()
  const [shipTier, setShipTier] = useState(initialTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [shipName, setShipName] = useState(initialShipName)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(initialShipName ?? '')
  const [buying, setBuying] = useState<number | null>(null)

  const activeShip = getShip(shipTier)
  const activeStats = EXPEDITION_SHIP_STATS[shipTier]

  function handleBuyShip(tier: number) {
    setError(null)
    setBuying(tier)
    startTransition(async () => {
      const result = await buyShip()
      setBuying(null)
      if ('error' in result) {
        setError(result.error)
      } else {
        setShipTier(result.shipTier)
        setDoubloons(result.doubloons)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.doubloons }))
      }
    })
  }

  function submitRename() {
    const trimmed = nameInput.trim().slice(0, 32)
    if (!trimmed) { setEditingName(false); return }
    startTransition(async () => {
      const result = await renameShip(trimmed)
      if (!('error' in result)) setShipName(trimmed)
    })
    setEditingName(false)
  }

  return (
    <div className="page-col pb-16">
      <ShopHeader title="Shipyard" backLabel="Back" onBack={() => router.back()} />

      {/* ── Active ship hero ─────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        background: `radial-gradient(ellipse 120% 85% at 50% 100%, ${activeShip.color}1a 0%, rgba(6,12,20,0.96) 68%)`,
        border: `1px solid ${activeShip.color}45`,
        borderRadius: 20,
        padding: '1.25rem 1rem 1.1rem',
        marginBottom: 20,
        overflow: 'hidden',
      }}>
        <p className="font-karla font-700 uppercase tracking-[0.22em]" style={{ fontSize: '0.5rem', color: activeShip.color, marginBottom: 6, textAlign: 'center' }}>
          Your Active Ship · Tier {shipTier}
        </p>

        {editingName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', marginBottom: 10 }}>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditingName(false) }}
              maxLength={32}
              placeholder={activeShip.name}
              style={{
                background: 'rgba(255,255,255,0.08)', border: `1px solid ${activeShip.color}55`,
                borderRadius: 8, padding: '0.4rem 0.7rem',
                color: '#f0ede8', fontSize: '1.15rem', fontFamily: 'var(--font-cinzel), serif', fontWeight: 700,
                outline: 'none', minWidth: 0, textAlign: 'center', maxWidth: 240,
              }}
            />
            <button onClick={submitRename} className="font-karla font-700" style={{ background: `${activeShip.color}22`, border: `1px solid ${activeShip.color}55`, borderRadius: 7, padding: '0.38rem 0.8rem', color: activeShip.color, cursor: 'pointer', fontSize: '0.72rem' }}>Save</button>
            <button onClick={() => setEditingName(false)} className="font-karla" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5248', fontSize: '0.72rem' }}>Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => { setNameInput(shipName ?? ''); setEditingName(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', marginBottom: 10 }}
          >
            <span className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f0ede8', lineHeight: 1, textShadow: `0 0 16px ${activeShip.color}40` }}>
              {shipName ?? activeShip.name}
            </span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a724e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 130, marginBottom: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeShip.imageUrl} alt={activeShip.name}
            loading="lazy" decoding="async"
            style={{ maxHeight: '100%', maxWidth: '85%', objectFit: 'contain', filter: `drop-shadow(0 8px 22px ${activeShip.color}66)` }}
          />
        </div>

        {/* Active ship stats row. Raid Items is a tier-scaled cap on
            how many equipped raid items the ship can carry into a
            fight (see raidItemSlotsForTier) — meaningful upgrade
            pull for T2/T4/T5 buyers, so it gets the same surface as
            the existing combat stats instead of being buried in the
            loadout drawer. 5 columns is tight on small mobile but
            readable at 5×~64px. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, marginTop: 10 }}>
          <HeroStat label="Crew"       value={activeStats?.crewSlots ?? 1}        color={activeShip.color} />
          <HeroStat label="Hull"       value={activeStats?.durability ?? 0}       color="#60a5fa" />
          <HeroStat label="Speed"      value={activeStats?.speed ?? 0}            color="#f0c040" />
          <HeroStat label="Min Dmg"    value={activeStats?.minDamage ?? 0}        color="#fb923c" />
          <HeroStat label="Raid Items" value={raidItemSlotsForTier(shipTier)}     color="#a78bfa" />
        </div>
      </div>

      {/* ── Combat mechanics primer ── */}
      <div style={{
        background: 'rgba(8,14,24,0.55)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14, padding: '0.75rem 0.95rem', marginBottom: 22,
      }}>
        <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#b5b3ae', lineHeight: 1.6 }}>
          <strong style={{ color: '#f0ede8', fontWeight: 700 }}>Reload</strong> stockpiles charges (max 3). <strong style={{ color: '#f0ede8', fontWeight: 700 }}>Fire</strong> spends 1. <strong style={{ color: '#f0ede8', fontWeight: 700 }}>Volley</strong> spends all 3 for double damage. <strong style={{ color: '#f0ede8', fontWeight: 700 }}>Speed</strong> determines who fires first.
        </p>
      </div>

      {/* ── Available ships — only the upgrade path ahead. Boats you've
          already upgraded past aren't "owned" and you never sail them again,
          so they're hidden; your active hull is the hero above. ───────────── */}
      {shipTier < MAX_SHIP_TIER && (
        <>
          <SectionLabel>Available Ships</SectionLabel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {SHIPS.filter(ship => ship.tier > shipTier).map(ship => {
          const stats = EXPEDITION_SHIP_STATS[ship.tier]
          const owned = ship.tier <= shipTier
          const isActive = ship.tier === shipTier
          const isNext = ship.tier === shipTier + 1
          const locked = ship.tier > shipTier + 1
          const c = ship.color
          const purchasing = buying === ship.tier && isPending

          return (
            <div key={ship.tier} style={{
              position: 'relative',
              background: isActive
                ? `linear-gradient(160deg, ${c}1c 0%, rgba(6,12,20,0.96) 66%)`
                : (owned || isNext)
                  ? `linear-gradient(160deg, ${c}10 0%, rgba(6,12,20,0.94) 72%)`
                  : 'rgba(8,14,24,0.7)',
              border: `1px solid ${isActive ? c + '6a' : owned ? c + '38' : isNext ? c + '4a' : 'rgba(255,255,255,0.09)'}`,
              borderRadius: 16,
              padding: '0.9rem 0.95rem 0.95rem',
              opacity: locked ? 0.7 : 1,
              overflow: 'hidden',
            }}>
              {/* Hero image strip */}
              <div style={{
                width: '100%', height: 140, marginBottom: 10,
                background: `radial-gradient(ellipse at 50% 70%, ${c}1c 0%, transparent 65%)`,
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ship.imageUrl} alt={ship.name}
                  loading="lazy" decoding="async"
                  style={{
                    maxWidth: '88%', maxHeight: '92%', objectFit: 'contain',
                    filter: owned
                      ? `drop-shadow(0 6px 18px ${c}66)`
                      : locked
                        ? 'grayscale(1) brightness(0.32)'
                        : `grayscale(0.45) brightness(0.7)`,
                  }}
                />
                <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{
                  position: 'absolute', top: 8, right: 10,
                  fontSize: '0.46rem', color: '#8a8784',
                  background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 999, padding: '0.16rem 0.5rem',
                }}>
                  T{ship.tier}
                </span>
                {/* Status pill, overlaid */}
                <span style={{ position: 'absolute', bottom: 6, left: 10 }}>
                  <ShopStatusPill kind={isActive ? 'active' : owned ? 'owned' : isNext ? 'next' : 'locked'} />
                </span>
              </div>

              {/* Name + description */}
              <div style={{ marginBottom: 10 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: owned || isNext ? '#f0ede8' : '#a0a09a', lineHeight: 1.15, marginBottom: 4 }}>
                  {ship.name}
                </p>
                <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: owned || isNext ? '#b5b3ae' : '#7a7775', lineHeight: 1.45 }}>
                  {ship.description}
                </p>
              </div>

              {/* Compact stats row. The "Items" chip shows the
                  raid-item loadout capacity for that hull tier — so
                  a player eyeing T5 can see they'd get a 4th item
                  slot before they buy. */}
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 6,
                marginBottom: isNext ? 12 : 0,
                fontSize: '0.7rem',
              }}>
                <StatChip label="Crew"  value={stats?.crewSlots  ?? 1}        accent={c}       owned={owned} />
                <StatChip label="Hull"  value={stats?.durability ?? 0}        accent="#60a5fa" owned={owned} />
                <StatChip label="Speed" value={stats?.speed      ?? 0}        accent="#f0c040" owned={owned} />
                <StatChip label="Dmg"   value={stats?.minDamage  ?? 0}        accent="#fb923c" owned={owned} />
                <StatChip label="Items" value={raidItemSlotsForTier(ship.tier)} accent="#a78bfa" owned={owned} />
              </div>

              {/* Buy button — only on the next purchasable tier, gated by Nav level */}
              {isNext && (navLevel >= navLevelReqForShip(ship.cost) ? (
                <ShopBuyButton
                  label="Upgrade"
                  pendingLabel="Upgrading…"
                  cost={ship.cost}
                  balance={doubloons}
                  pending={purchasing}
                  busy={isPending && !purchasing}
                  accent={c}
                  onClick={() => handleBuyShip(ship.tier)}
                />
              ) : (
                <div className="font-karla font-700 uppercase tracking-[0.08em]" style={{ textAlign: 'center', padding: '0.7rem', borderRadius: 12, background: 'rgba(224,164,74,0.1)', border: '1px solid rgba(224,164,74,0.4)', color: '#e0a44a', fontSize: '0.72rem' }}>
                  Reach Nav Lv {navLevelReqForShip(ship.cost)} to unlock
                </div>
              ))}
            </div>
          )
            })}
          </div>
        </>
      )}

      {error && <p className="font-karla font-300 text-red-400 text-xs text-center mt-4">{error}</p>}
      {shipTier >= MAX_SHIP_TIER && (
        <p className="font-karla font-300 italic text-center mt-6" style={{ color: '#5a5755', fontSize: '0.78rem' }}>
          Your fleet commands the sea.
        </p>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span aria-hidden style={{ width: 3, height: 13, borderRadius: 2, flexShrink: 0, background: 'linear-gradient(180deg, #f0c040 0%, rgba(240,192,64,0.15) 100%)' }} />
      <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.72rem', color: '#d8d4cd' }}>
        {children}
      </p>
    </div>
  )
}

function HeroStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{
      background: 'rgba(8,14,24,0.55)',
      border: `1px solid ${color}40`,
      borderRadius: 10,
      padding: '0.5rem 0.25rem',
      textAlign: 'center',
    }}>
      <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color, lineHeight: 1 }}>{value}</p>
      <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: '#b5b3ae', marginTop: 4 }}>{label}</p>
    </div>
  )
}

function StatChip({ label, value, accent, owned }: { label: string; value: number | string; accent: string; owned: boolean }) {
  return (
    <span className="font-karla font-600" style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
      background: owned ? `${accent}12` : 'rgba(255,255,255,0.04)',
      border: `1px solid ${owned ? accent + '38' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 999,
      padding: '0.22rem 0.55rem',
      fontSize: '0.7rem',
      lineHeight: 1,
    }}>
      <span className="font-cinzel font-700" style={{ color: owned ? accent : '#8a8784' }}>{value}</span>
      <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.56rem', color: owned ? '#b5b3ae' : '#6a6764' }}>{label}</span>
    </span>
  )
}
