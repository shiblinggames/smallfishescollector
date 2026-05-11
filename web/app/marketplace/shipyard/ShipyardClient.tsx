'use client'

import { useState, useTransition } from 'react'
import { SHIPS } from '@/lib/ships'
import { buyShip, renameShip } from '@/app/shipyard/actions'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'

export default function ShipyardClient({ shipTier: initialTier, doubloons: initialDoubloons, shipName: initialShipName }: { shipTier: number; doubloons: number; shipName: string | null }) {
  const [shipTier, setShipTier] = useState(initialTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [shipName, setShipName] = useState(initialShipName)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(initialShipName ?? '')
  const [buying, setBuying] = useState<number | null>(null)

  const activeShip = SHIPS[shipTier]
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
    <div className="px-4 sm:px-6 max-w-md sm:max-w-2xl mx-auto pb-16">
      <p className="font-karla font-600 uppercase tracking-[0.16em] text-[#6a6764] mb-4 text-[0.6rem] sm:text-xs">
        Shipyard
      </p>

      {/* ── Active ship hero ─────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        background: `radial-gradient(ellipse 110% 80% at 50% 100%, ${activeShip.color}1c 0%, rgba(8,8,6,0.95) 65%)`,
        border: `1px solid ${activeShip.color}55`,
        borderRadius: 20,
        padding: '1.25rem 1rem 1.1rem',
        marginBottom: 20,
        boxShadow: `0 0 32px ${activeShip.color}1a, inset 0 1px 0 rgba(255,255,255,0.04)`,
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
            <span style={{ fontSize: '0.72rem', color: '#6a5840' }}>✎</span>
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 130, marginBottom: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeShip.imageUrl} alt={activeShip.name}
            style={{ maxHeight: '100%', maxWidth: '85%', objectFit: 'contain', filter: `drop-shadow(0 8px 22px ${activeShip.color}66)` }}
          />
        </div>

        {/* Active ship stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, marginTop: 10 }}>
          <HeroStat label="Crew"  value={activeStats?.crewSlots ?? 1} color={activeShip.color} />
          <HeroStat label="Hull"  value={activeStats?.durability ?? 0} color="#60a5fa" />
          <HeroStat label="Armor" value={activeStats?.armor ?? 0}      color="#4ade80" />
          <HeroStat label="Speed" value={activeStats?.speed ?? 0}      color="#f0c040" />
          <HeroStat label="Min Dmg" value={activeStats?.minDamage ?? 0} color="#fb923c" />
        </div>
      </div>

      {/* ── Combat mechanics primer (small, collapsible feel) ── */}
      <div style={{
        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: '0.65rem 0.85rem', marginBottom: 22,
      }}>
        <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#7a7775', lineHeight: 1.6 }}>
          <strong style={{ color: '#a0a09a', fontWeight: 600 }}>Reload</strong> stockpiles charges (max 3). <strong style={{ color: '#a0a09a', fontWeight: 600 }}>Fire</strong> spends 1. <strong style={{ color: '#a0a09a', fontWeight: 600 }}>Volley</strong> spends all 3 for double damage. <strong style={{ color: '#a0a09a', fontWeight: 600 }}>Speed</strong> determines who fires first.
        </p>
      </div>

      {/* ── Fleet ────────────────────────────────────────────────────── */}
      <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.58rem', color: '#6a6764', marginBottom: 10 }}>
        Fleet
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SHIPS.map(ship => {
          const stats = EXPEDITION_SHIP_STATS[ship.tier]
          const owned = ship.tier <= shipTier
          const isActive = ship.tier === shipTier
          const isNext = ship.tier === shipTier + 1
          const locked = ship.tier > shipTier + 1
          const canAfford = doubloons >= ship.cost
          const c = ship.color
          const purchasing = buying === ship.tier && isPending

          return (
            <div key={ship.tier} style={{
              position: 'relative',
              background: isActive
                ? `linear-gradient(140deg, ${c}1c 0%, rgba(8,8,6,0.95) 70%)`
                : owned
                  ? `linear-gradient(140deg, ${c}10 0%, rgba(8,8,6,0.92) 70%)`
                  : isNext
                    ? `linear-gradient(140deg, ${c}10 0%, rgba(8,8,6,0.92) 70%)`
                    : 'rgba(8,8,6,0.78)',
              border: `1px solid ${isActive ? c + '70' : owned ? c + '30' : isNext ? c + '40' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 16,
              padding: '0.9rem 0.95rem 0.95rem',
              boxShadow: isActive ? `0 0 22px ${c}1c` : 'none',
              opacity: locked ? 0.7 : 1,
              overflow: 'hidden',
            }}>
              {/* Top row: image + name/status */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{
                  width: 96, height: 76, flexShrink: 0,
                  background: `radial-gradient(ellipse at 50% 70%, ${c}18 0%, transparent 70%)`,
                  borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ship.imageUrl} alt={ship.name}
                    style={{
                      maxWidth: '92%', maxHeight: '92%', objectFit: 'contain',
                      filter: owned
                        ? `drop-shadow(0 3px 10px ${c}55)`
                        : locked
                          ? 'grayscale(1) brightness(0.3)'
                          : `grayscale(0.5) brightness(0.65)`,
                    }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: owned ? '#f0ede8' : isNext ? '#c8c4bc' : '#6a6764', lineHeight: 1.1 }}>
                      {ship.name}
                    </p>
                    <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.46rem', color: '#5a5755', flexShrink: 0 }}>
                      T{ship.tier}
                    </span>
                  </div>
                  <p className="font-karla font-400" style={{ fontSize: '0.68rem', color: owned || isNext ? '#7a7775' : '#4a4845', lineHeight: 1.35, marginBottom: 8 }}>
                    {ship.description}
                  </p>
                  {/* Status pill */}
                  {isActive && (
                    <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ display: 'inline-block', fontSize: '0.48rem', color: c, background: `${c}1c`, border: `1px solid ${c}55`, borderRadius: 999, padding: '0.18rem 0.55rem' }}>
                      ⬤ Active
                    </span>
                  )}
                  {owned && !isActive && (
                    <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ display: 'inline-block', fontSize: '0.48rem', color: '#4ade80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.28)', borderRadius: 999, padding: '0.18rem 0.55rem' }}>
                      ✓ Owned
                    </span>
                  )}
                  {!owned && !locked && (
                    <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ display: 'inline-block', fontSize: '0.48rem', color: '#f0c040', background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.28)', borderRadius: 999, padding: '0.18rem 0.55rem' }}>
                      ⚓ Next Tier
                    </span>
                  )}
                  {locked && (
                    <span className="font-karla font-600 uppercase tracking-[0.14em]" style={{ display: 'inline-block', fontSize: '0.48rem', color: '#5a5755', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 999, padding: '0.18rem 0.55rem' }}>
                      🔒 Locked
                    </span>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, marginBottom: isNext ? 12 : 0 }}>
                <CardStat label="Crew"    value={stats?.crewSlots  ?? 1} accent={c}        owned={owned} />
                <CardStat label="Hull"    value={stats?.durability ?? 0} accent="#60a5fa"  owned={owned} />
                <CardStat label="Armor"   value={stats?.armor      ?? 0} accent="#4ade80"  owned={owned} />
                <CardStat label="Speed"   value={stats?.speed      ?? 0} accent="#f0c040"  owned={owned} />
                <CardStat label="Min Dmg" value={stats?.minDamage  ?? 0} accent="#fb923c"  owned={owned} />
              </div>

              {/* Buy button — only on the next purchasable tier */}
              {isNext && (
                <button
                  onClick={() => handleBuyShip(ship.tier)}
                  disabled={!canAfford || isPending}
                  className="font-cinzel font-700"
                  style={{
                    width: '100%',
                    padding: '0.72rem 0.5rem',
                    borderRadius: 12,
                    background: canAfford
                      ? `linear-gradient(180deg, ${c}26 0%, ${c}12 100%)`
                      : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${canAfford ? `${c}80` : 'rgba(255,255,255,0.1)'}`,
                    color: canAfford ? c : '#5a5755',
                    cursor: canAfford && !isPending ? 'pointer' : 'default',
                    opacity: isPending ? 0.6 : 1,
                    fontSize: '0.92rem',
                    letterSpacing: '0.04em',
                    boxShadow: canAfford ? `0 0 18px ${c}22` : 'none',
                  }}
                >
                  {purchasing
                    ? 'Upgrading…'
                    : canAfford
                      ? <>Upgrade <span style={{ color: '#f0ede8' }}>·</span> {ship.cost.toLocaleString()} ⟡</>
                      : <>Need {(ship.cost - doubloons).toLocaleString()} more ⟡</>
                  }
                </button>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="font-karla font-300 text-red-400 text-xs text-center mt-4">{error}</p>}
      {shipTier === SHIPS.length - 1 && (
        <p className="font-karla font-300 italic text-center mt-6" style={{ color: '#5a5755', fontSize: '0.78rem' }}>
          Your fleet commands the sea.
        </p>
      )}
    </div>
  )
}

function HeroStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{
      background: 'rgba(8,8,6,0.55)',
      border: `1px solid ${color}30`,
      borderRadius: 9,
      padding: '0.5rem 0.25rem',
      textAlign: 'center',
    }}>
      <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color, lineHeight: 1 }}>{value}</p>
      <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.46rem', color: '#7a7775', marginTop: 4 }}>{label}</p>
    </div>
  )
}

function CardStat({ label, value, accent, owned }: { label: string; value: number | string; accent: string; owned: boolean }) {
  return (
    <div style={{
      background: owned ? `${accent}0c` : 'rgba(255,255,255,0.03)',
      border: `1px solid ${owned ? accent + '24' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 8,
      padding: '0.4rem 0.2rem',
      textAlign: 'center',
    }}>
      <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: owned ? accent : '#5a5755', lineHeight: 1 }}>{value}</p>
      <p className="font-karla font-600 uppercase tracking-[0.06em]" style={{ fontSize: '0.42rem', color: owned ? '#6a6764' : '#4a4845', marginTop: 4 }}>{label}</p>
    </div>
  )
}
