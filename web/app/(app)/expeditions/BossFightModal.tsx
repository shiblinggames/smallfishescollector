'use client'

// ── THE CARD THAT NAMES A BOSS ──────────────────────────────────────────────
//
// The portrait, what it drops, your best time against it, and the choice of the
// standard run or the challenge. Opened three ways and they are all the same
// object: sail up to a hull on the chart, step through the Wargate to one you
// have already put down, or tap a tile on the campaign map.
//
// ── IT USED TO LIVE INSIDE THE CAMPAIGN MAP ─────────────────────────────────
//
// Filed in RaidsSection, which is three and a half thousand lines of node map,
// and exported from there because the sea needed it. That meant every surface
// that wanted this card lazily pulled the WHOLE map in behind it — a chart that
// draws one modal was loading the chapter accordion, the boss deck, the node
// sheet and five puzzle engines to do it. It also made the map impossible to
// retire while the sea depended on it.
//
// Its private helpers came with it: the clear-time format, the live drop odds
// (fortune moves them, so they are computed against the crew you actually have)
// and the drop's own detail modal.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import {
  bossIdentityRevealed, formatDropChance, isChallengeVariant,
  type RaidNodeDrop, type RaidNodeView,
} from '@/lib/raidMap'
import { RARITY_COLOR, RAID_BOSS_BG, RAID_LOCATION_BG, isUniqueLoot, type BossRaidConfig } from '@/lib/bossRaids'
import { FINN_ITEMS, finnTierNumeral, type FinnItemId } from '@/lib/finnItems'
import { getRaidItem } from '@/lib/raidItems'
import { getRaidConfigById } from '@/lib/raidRegistry'
import { crateItemChances, isChallengeRaid } from '@/lib/raidLoot'
import { fortuneLootMult } from '@/lib/expeditions'
import { getShipSkin } from '@/lib/shipSkins'
import { SPECIAL_ITEMS } from '@/lib/specialItems'
import { IconLock, IconCrate } from '@/components/GameIcons'
import ItemEffectLines from '@/components/ItemEffectLines'
import type { RaidRecords } from './raidMapActions'

export function formatRaidMs(ms: number): string {
  if (!ms || ms < 0) return '—'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function makeLiveChance(
  cfg: BossRaidConfig | undefined,
  ownedRaidItems: string[],
  ownedShipSkins: string[],
  totalFortune: number,
  ownedSpecialItems: string[] = [],
) {
  // THREE places an owned unique can live, and the boss cards have to know all
  // of them. Finn's table drops one FISHING SPECIAL (The Primeval Eye), which
  // is a boolean column rather than a raid_items entry -- so checking only
  // raid_items meant a player carrying the Eye still saw it listed as
  // unclaimed on his card, with a live drop rate, forever.
  const dropOwned = (d: RaidNodeDrop): boolean =>
    (!!d.id && (ownedRaidItems.includes(d.id) || ownedSpecialItems.includes(d.id)))
    || (!!d.shipSkinId && ownedShipSkins.includes(d.shipSkinId))
  const lootOwned = (l: { id: string; shipSkinId?: string }): boolean =>
    ownedRaidItems.includes(l.id) || ownedSpecialItems.includes(l.id)
    || (!!l.shipSkinId && ownedShipSkins.includes(l.shipSkinId))
  const liveChance = (d: RaidNodeDrop): string | undefined => {
    if (!cfg || !d.id) return undefined
    const row = cfg.loot.find(l => l.id === d.id)
    if (!row || !isUniqueLoot(row)) return undefined
    if (dropOwned(d)) return 'Owned'
    const owned = new Set(cfg.loot.filter(lootOwned).map(l => l.id))
    const hit = crateItemChances(cfg.loot, owned, cfg.uniqueShare, 1, fortuneLootMult(totalFortune), isChallengeRaid(cfg.raidId))
      .find(c => c.id === d.id)
    return hit ? formatDropChance(hit.chance) : undefined
  }
  return { liveChance, dropOwned, lootOwned }
}

export function DropDetailModal({ drop, owned, chance, onClose }: {
  drop: RaidNodeDrop
  /**
   * Pass makeLiveChance's `dropOwned`, never a hand-rolled check. Both call
   * sites used to inline `ownedRaidItems.includes(id) || ownedShipSkins…`,
   * which misses the THIRD place an owned unique lives: a fishing special is a
   * boolean profile column, not a raid_items entry. So a captain already
   * carrying The Primeval Eye tapped it on the node sheet and the card told
   * him he had not earned it.
   */
  owned: boolean
  /**
   * The LIVE chance, from crateItemChances. RaidNodeDrop.chance is baked at
   * map-build time from `weight / total`, which was the old model and knows
   * nothing about the rarity rule or crew Fortune. The chip that opens this
   * modal has shown the live figure since the boss-card fix, so the modal was
   * quoting a different number for the same item.
   */
  chance?: string
  onClose: () => void
}) {
  const rarityColor = drop.rarity ? RARITY_COLOR[drop.rarity] : '#9ca3af'
  const raidItem    = drop.raidItemId ? getRaidItem(drop.raidItemId)   : undefined
  const shipSkin    = drop.shipSkinId ? getShipSkin(drop.shipSkinId)   : undefined
  const special     = drop.specialItemId ? SPECIAL_ITEMS.find(x => x.id === drop.specialItemId) : undefined
  // Finn's two spoils have no fixed effect line to print: what they DO is the
  // charge ladder. Show the whole ladder here so the drop sells itself before
  // you have ever held it.
  const finn = (drop.id === 'anglers_patience' || drop.id === 'borrowed_jaw')
    ? FINN_ITEMS[drop.id as FinnItemId]
    : undefined
  // What kind of drop is this — drives the "type" label + body copy.
  const dropKind = raidItem ? 'Raid Item' : shipSkin ? 'Ship Skin' : special ? 'Fishing Special' : 'Drop'
  // Description: prefer the raid item's full description; fall back to
  // the drop's sublabel (already preformatted by lootDrops).
  const description = raidItem?.description ?? special?.description
    ?? (drop.sublabel ?? '').replace(/^Raid item\.\s*|^Ship skin\.\s*|^Fishing special\.\s*/, '')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: '100%', maxWidth: 'var(--modal-w)',
          background: 'linear-gradient(180deg, #0e1726 0%, #07101c 100%)',
          border: `1px solid ${rarityColor}55`,
          borderTop: `3px solid ${rarityColor}`,
          borderRadius: 16,
          padding: '1.1rem 1.05rem 1.1rem',
          boxShadow: `0 16px 48px rgba(0,0,0,0.55), 0 0 24px ${rarityColor}22`,
          position: 'relative',
        }}
      >
        {/* Close (X) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#9aa0a6', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, font: 'inherit',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>

        {/* Header: big icon + name + type + rarity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingRight: 24 }}>
          {/* One box for every kind of drop. A hull used to need a wider one
              because its sprite was a 16:9 canvas; trimmed to the ship it is
              only a little wider than tall, and it fills a square box like
              everything else. */}
          <div style={{
            width: 64, height: 64, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${rarityColor}14`, border: `1px solid ${rarityColor}45`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            {drop.swatch
              ? <span style={{ display: 'block', width: '100%', height: '100%', background: drop.swatch, filter: drop.swatchFilter }} />
              : drop.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={drop.image} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: drop.imageFilter, padding: 4 }} />
                : <span style={{ fontSize: '2rem', color: rarityColor, display: 'flex' }}><IconCrate size={32} /></span>}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: rarityColor, marginBottom: 4 }}>
              {dropKind}
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f5f2ec', lineHeight: 1.15 }}>
              {drop.label}
            </p>
            {drop.rarity && (
              <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: rarityColor, marginTop: 3 }}>
                {drop.rarity}
              </p>
            )}
          </div>
        </div>

        {/* Description. A raid item lists its mechanics one per line — these
            cards carry the forged and Abyssal drops, which are the longest in
            the game. Anything else (a skin, a fishing special) is one sentence
            and stays prose. */}
        {raidItem ? (
          <div style={{ marginBottom: 14 }}>
            <ItemEffectLines def={raidItem} size={0.78} color="rgba(240,237,232,0.78)" />
          </div>
        ) : description ? (
          <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.78)', lineHeight: 1.55, marginBottom: 14 }}>
            {description}
          </p>
        ) : null}

        {/* Finn's charge ladder. Every tier listed, none of them marked as
            unlocked, because this is a preview of what the thing becomes. */}
        {finn && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: finn.color, marginBottom: 6 }}>
              Tiers up on {finn.chargedBy === 'navigation' ? 'Navigation' : 'Fishing'} XP
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {finn.milestones.map(m => (
                <div key={m.level} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 7,
                  padding: '4px 7px', borderRadius: 7,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${finn.color}22`,
                }}>
                  <span className="font-cinzel font-700" style={{ flexShrink: 0, width: 22, textAlign: 'right', fontSize: '0.57rem', color: finn.color, letterSpacing: '0.04em' }}>{finnTierNumeral(m.level)}</span>
                  <span className="font-karla" style={{ fontSize: '0.6rem', lineHeight: 1.4, color: 'rgba(240,237,232,0.72)' }}>{m.unlock}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source line for raid items (tells you where it drops) */}
        {raidItem?.source && (
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7a8090', marginBottom: 14 }}>
            Source: <span style={{ color: '#9aa6b8' }}>{raidItem.source}</span>
          </p>
        )}

        {/* Owned banner, else the drop-chance pill. */}
        {owned ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="font-karla font-700 uppercase tracking-[0.1em]"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: '0.65rem', color: '#7fd49a',
                background: 'rgba(127,212,154,0.14)', border: '1px solid rgba(127,212,154,0.5)',
                borderRadius: 999, padding: '0.32rem 0.85rem',
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Owned · in your hold
            </span>
          </div>
        ) : (chance ?? drop.chance) ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="font-karla font-700 uppercase tracking-[0.1em]"
              style={{
                fontSize: '0.65rem', color: rarityColor,
                background: `${rarityColor}1c`, border: `1px solid ${rarityColor}50`,
                borderRadius: 999, padding: '0.32rem 0.85rem',
              }}>
              {chance ?? drop.chance} drop chance
            </span>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  )
}

export function bossNameOf(node: { raidId?: string; label: string }): string {
  const cfg = node.raidId ? getRaidConfigById(node.raidId) : undefined
  return cfg?.enemies[cfg.bossId]?.name ?? node.label
}

// The boss fight modal — opens on a tile tap. Shows the big portrait, the drops,
// and the choice of Fight (normal) vs Challenge. Portaled + backdrop-dismissable.
// EXPORTED, because the sea opens this too. You sail up to a hull, and the
// card that names it, shows what it drops and offers the challenge run is
// this one — not a second card that has to be kept in step with it.
export function BossFightModal({ boss, challenge, rec, challengeRec, ownedRaidItems, ownedShipSkins, ownedSpecialItems = [], totalFortune = 0, isNext, onEnter, onClose, clearedNodeIds, enterLabel, enterSub }: {
  boss: RaidNodeView
  challenge: RaidNodeView | null
  rec: RaidRecords | null
  challengeRec: RaidRecords | null
  ownedRaidItems: string[]
  ownedShipSkins: string[]
  ownedSpecialItems?: string[]
  totalFortune?: number
  isNext: boolean
  onEnter: (route: string) => void
  onClose: () => void
  /** Cleared node ids — decides whether a story-gated boss is unmasked. */
  clearedNodeIds: Set<string>
  /** The Wargate borrows this sheet with a different verb: same card, same
   *  drops, same records, but pressing it SAILS you to the boss instead of
   *  entering the raid. Defaults keep the map's own copy. */
  enterLabel?: string
  enterSub?: string
}) {
  // Tapping a drop opens the same DropDetailModal the map nodes use, so an item
  // reads identically wherever you meet it. Local state: this modal is portaled
  // and rendered from two call sites, and neither should have to own this.
  const [dropDetail, setDropDetail] = useState<RaidNodeDrop | null>(null)
  const onDropTap = (d: RaidNodeDrop) => setDropDetail(d)
  const node = boss.node
  const bossName = bossNameOf(node)
  const cleared = boss.status === 'cleared'   // beat the boss NORMALLY → art revealed
  // Identity masking is separate from CLEARED: a boss the story has already
  // introduced should not be a silhouette just because you have not beaten them.
  // But "already introduced" has to MEAN it — see bossIdentityRevealed.
  const shown = cleared || bossIdentityRevealed(boss.node, clearedNodeIds)
  const locked = boss.status === 'locked'
  // NOTHING BLOCKS A FIGHT ANY MORE. This was `repairOwed > 0`: a sunk ship
  // owed a fee and every boss card refused until it was paid. See the note at
  // the top of raids/actions — the sail back is the penalty now.
  const blocked = false
  const chAvailable = !!challenge && (challenge.status === 'available' || challenge.status === 'cleared')
  const chCleared = challenge?.status === 'cleared'

  // Normal ⇄ Challenge toggle drives which mode's info the sheet shows. Only
  // offered when a challenge branch exists and the boss itself isn't locked.
  const showToggle = !locked && !!challenge
  const [mode, setMode] = useState<'normal' | 'challenge'>('normal')
  const isChallenge = mode === 'challenge' && !!challenge
  const activeNode = (isChallenge && challenge ? challenge : boss).node
  const activeRec = isChallenge ? challengeRec : rec
  const accent = locked ? '#6a6764' : isChallenge ? '#e08a7a' : isNext ? '#5eead4' : '#c4a96a'
  const backdrop = node.raidId ? (RAID_BOSS_BG[node.raidId] ?? RAID_LOCATION_BG[node.raidId]) : undefined

  // Drops for the ACTIVE mode, with LIVE odds. uniqueShare raids reserve a fixed
  // slice of the crate split across the uniques you still need, so a static "8%"
  // is really 50% when only one is left — recompute against what you own.
  const cfg = activeNode.raidId ? getRaidConfigById(activeNode.raidId) : undefined
  // These used to be a hand-copied second pair, which is exactly how the Eye
  // could be taught to makeLiveChance and STILL show unclaimed here. Taken off
  // the one helper now so there is a single answer to "do I own this".
  const { liveChance, dropOwned, lootOwned } = makeLiveChance(cfg, ownedRaidItems, ownedShipSkins, totalFortune, ownedSpecialItems)
  // specialItemId is in here because Finn's Eye is a FISHING special: without it
  // the headline drop off the final boss never rendered on his own card. The cap
  // is 6 rather than 4 for the same reason, since he alone drops five.
  // No slice. It used to cap at 6, which was invisible on every boss in the game
  // except the Quartermaster's Ghost: he carries EIGHT Cache items and the card
  // silently hid two of them, so the one boss whose entire purpose is showing you
  // what he still holds was the one boss lying about it.
  const drops = (activeNode.detail?.drops ?? []).filter(d => (d.rarity === 'epic' || d.rarity === 'legendary' || d.rarity === 'ancient' || d.rarity === 'cosmetic') && (d.raidItemId || d.shipSkinId || d.specialItemId))
  // Gear and hull skins are different KINDS of prize: one changes how you fight,
  // the other changes how you look, and they were sharing a rail with the skin
  // usually sitting first. Split, so each row answers one question.
  const dropItems = drops.filter(d => !d.shipSkinId)
  const dropSkins = drops.filter(d => !!d.shipSkinId)

  // Header status pill reflects the active mode.
  const pillCleared = isChallenge ? chCleared : cleared
  const pillNext = !isChallenge && isNext && !cleared
  const pillLocked = isChallenge ? !chAvailable : locked
  const pillLabel = pillCleared ? 'Cleared' : pillNext ? 'Next up' : pillLocked ? 'Locked' : 'Ready'

  const enterRoute = activeNode.route
  const enterBlocked = locked || (isChallenge && !chAvailable)

  function doEnter() {
    if (enterBlocked || !enterRoute) return
    vibrate([0, 16, 30, 24])
    onEnter(enterRoute)
  }

  return createPortal(
    <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,7,12,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div onClick={e => e.stopPropagation()} initial={{ y: 60 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ width: '100%', maxWidth: 'var(--modal-w)', background: '#0a1119', borderRadius: '22px 22px 0 0', overflow: 'hidden', border: `1px solid ${accent}55`, borderBottom: 'none', boxShadow: '0 -12px 50px rgba(0,0,0,0.6)' }}>
        {/* Mode toggle — sits ABOVE the art. Switching it re-skins the whole
            sheet (drops, odds, records) to that mode; the bottom stays one
            Enter Raid button that launches whichever mode is selected. */}
        {showToggle && (
          <div style={{ display: 'flex', gap: 6, padding: '0.7rem 0.8rem 0.55rem' }}>
            {([['normal', 'Normal', 'standard loot', '#5eead4'], ['challenge', chCleared ? 'Challenge ✓' : 'Challenge', chAvailable ? 'bonus loot' : 'clear the raid first', '#e08a7a']] as const).map(([m, label, sub, acc]) => {
              const on = mode === m
              return (
                <button key={m} type="button" onClick={() => setMode(m)} className="tap"
                  style={{ flex: 1, borderRadius: 12, padding: '0.5rem 0', textAlign: 'center', lineHeight: 1.1, cursor: 'pointer',
                    border: `1px solid ${on ? `${acc}b0` : 'rgba(255,255,255,0.1)'}`,
                    background: on ? `${acc}22` : 'rgba(255,255,255,0.03)', color: on ? '#f4efe4' : '#8a857c' }}>
                  <span className="font-cinzel font-800 uppercase" style={{ display: 'block', fontSize: '0.82rem', letterSpacing: '0.06em' }}>{label}</span>
                  <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.5rem', letterSpacing: '0.04em', opacity: 0.8, marginTop: 1 }}>{sub}</span>
                </button>
              )
            })}
          </div>
        )}
        <div style={{ position: 'relative', height: 230 }}>
          {backdrop && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={backdrop} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: shown ? 0.5 : 0.3, filter: shown ? undefined : 'grayscale(1) brightness(0.55)' }} />
          )}
          {node.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.image} alt={shown ? bossName : 'Undiscovered boss'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 28%', filter: shown ? 'drop-shadow(0 8px 22px rgba(0,0,0,0.6))' : 'brightness(0) drop-shadow(0 8px 22px rgba(0,0,0,0.6))' }} />
          )}
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,10,16,0.2) 0%, rgba(6,10,16,0.12) 52%, rgba(10,17,25,0.98) 100%)' }} />
          <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', padding: 0, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.18)', color: '#e6e0d4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 1.1rem 0.6rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <p className="font-cinzel font-800" style={{ fontSize: '1.55rem', lineHeight: 1.05, color: shown ? '#fff' : '#c8c1b3', letterSpacing: shown ? undefined : '0.14em', textShadow: `0 2px 10px rgba(0,0,0,0.9), 0 0 20px ${accent}30` }}>{shown ? bossName : '???'}</p>
            <span className="font-karla font-700 uppercase" style={{ flexShrink: 0, fontSize: '0.5rem', letterSpacing: '0.12em', padding: '0.26rem 0.6rem', borderRadius: 999, marginBottom: 5,
              ...(pillCleared ? { color: '#8ff0c0', background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.45)' }
                : pillNext ? { color: '#08120f', background: 'rgba(94,234,212,0.92)' }
                : pillLocked ? { color: '#8a857c', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }
                : { color: accent, background: `${accent}22`, border: `1px solid ${accent}66` }) }}>
              {pillLabel}
            </span>
          </div>
        </div>
        <div style={{ padding: '0.55rem 1.1rem 1.4rem' }}>
          {drops.length > 0 && (
            <>
              <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.18em', color: '#8a857c', marginBottom: 8 }}>Drops</p>
              {/* WRAPPING GRIDS, not a sideways rail. The rail kept every boss to
                  one line, but it also meant most of a long table lived off the
                  right edge where you had to know to swipe for it. These sheets
                  scroll vertically anyway, so the grid just uses that: the
                  Ghost's eight items land as two rows of four, all visible.
                  Skins share the items' cell width: hullDropImage trims their
                  sprites to the ship, so there is no 16:9 canvas to make room
                  for any more. */}
              {(() => {
                const tile = (d: RaidNodeDrop) => {
                  const rc = (d.rarity && RARITY_COLOR[d.rarity]) || '#c4a96a'
                  const owned = dropOwned(d)
                  const chance = owned ? undefined : (liveChance(d) ?? d.chance)
                  return (
                    <button
                      key={d.id ?? d.label}
                      type="button"
                      onClick={() => onDropTap(d)}
                      aria-label={`${d.label}${chance ? `, ${chance}` : ', owned'}, details`}
                      style={{
                        width: '100%', minWidth: 0,
                        display: 'flex', flexDirection: 'column', gap: 3,
                        padding: 0, background: 'none', border: 'none',
                        cursor: 'pointer', font: 'inherit', touchAction: 'manipulation',
                      }}
                    >
                      {/* No plate behind the art: the piece sits on the sheet
                          itself. A drop shadow tinted to its rarity does the
                          work the border used to, without boxing it in. */}
                      {/* 84 -> 60. Two stacked rows cost the sheet a whole extra
                          band of height, and the art was sized for a single rail
                          where vertical space was free. */}
                      {/* LEFT, not centre, so art and name sit over each other.
                          Art of different widths centred in a cell puts every
                          piece on its own left edge; anchoring both to the cell
                          gives the whole grid one margin. */}
                      <div style={{
                        position: 'relative', width: '100%', height: 60,
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                      }}>
                        {d.swatch
                          ? <div style={{ width: '100%', height: '100%', borderRadius: 10, background: d.swatch, filter: d.swatchFilter }} />
                          : d.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img
                                src={d.image}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                style={{
                                  // Every drop draws to the same height and starts
                                  // at the same left edge. The hull used to stretch
                                  // to the cell's full WIDTH, which only made sense
                                  // while its sprite was a wide canvas with a small
                                  // ship adrift in it.
                                  width: 'auto', height: '100%',
                                  maxWidth: '100%', maxHeight: '100%',
                                  objectFit: 'contain',
                                  filter: [d.imageFilter, `drop-shadow(0 3px 10px ${rc}66)`].filter(Boolean).join(' '),
                                  opacity: owned ? 0.9 : 1,
                                }}
                              />
                            : <span style={{ color: rc, display: 'flex' }}><IconCrate size={30} /></span>}
                        {owned && (
                          <span style={{
                            position: 'absolute', top: 5, left: 5,
                            width: 17, height: 17, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(10,20,14,0.86)', border: '1px solid rgba(74,222,128,0.65)',
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
                          </span>
                        )}
                      </div>
                      <span className="font-karla font-800 uppercase tracking-[0.08em]" style={{
                        fontSize: '0.6rem', textAlign: 'left',
                        color: owned ? '#7fd49a' : rc,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {owned ? 'Owned' : (chance ?? 'Drop')}
                      </span>
                      {/* Name never wraps: a two-line name would make one tile
                          taller than its neighbours and break the rail's line.
                          It clips, and the full name is in the detail modal. */}
                      <span className="font-karla font-600" style={{
                        display: 'block', width: '100%',
                        fontSize: '0.62rem', lineHeight: 1.25, textAlign: 'left',
                        color: '#b9b3a8',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {d.label}
                      </span>
                    </button>
                  )
                }
                // Sub-labels only when there is something to tell apart. On a
                // boss with no skin, "Items" under "Drops" is a heading for the
                // sake of having one.
                const split = dropItems.length > 0 && dropSkins.length > 0
                const sub = (t: string) => (
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#6f6a63', marginBottom: 6 }}>{t}</p>
                )
                return (
                  <div style={{ marginBottom: 16 }}>
                    {/* FIXED tracks, not minmax(_, 1fr). With 1fr the cells
                        stretch to fill the row, so two items and one hull skin
                        ended up at completely different widths and the two rows
                        no longer started from the same edge. Fixed widths keep
                        every cell the size its art wants and let both rows pack
                        from the left, wrapping when they run out of room.
                        Both rows are 80px now: the hull sprites are trimmed to
                        the ship, so a skin is about as wide as an item instead
                        of a 16:9 canvas. */}
                    {dropItems.length > 0 && (
                      <div style={{ marginBottom: dropSkins.length > 0 ? 12 : 0 }}>
                        {split && sub('Items')}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 80px)', justifyContent: 'start', gap: 8 }}>
                          {dropItems.map(tile)}
                        </div>
                      </div>
                    )}
                    {dropSkins.length > 0 && (
                      <div>
                        {split && sub('Ship Skins')}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 80px)', justifyContent: 'start', gap: 8 }}>
                          {dropSkins.map(tile)}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}
          {activeRec && (
            <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
              <div>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#8a857c', marginBottom: 2 }}>Your best</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: activeRec.yourBestMs != null ? '#e6dcc4' : '#6a6764', fontVariantNumeric: 'tabular-nums' }}>{activeRec.yourBestMs != null ? formatRaidMs(activeRec.yourBestMs) : '—'}</p>
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#8a857c', marginBottom: 2 }}>Fastest clear</p>
                {activeRec.fastestMs > 0 ? (
                  <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#e6dcc4', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatRaidMs(activeRec.fastestMs)} <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#8a857c' }}>· {activeRec.fastestUsername}</span></p>
                ) : (
                  <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#6a6764' }}>—</p>
                )}
              </div>
            </div>
          )}
          {locked ? (
            <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#8a857c', display: 'flex', alignItems: 'center', gap: 7, padding: '0.4rem 0' }}>
              <IconLock size={15} /> {boss.lockReason ?? 'Locked'}
            </p>
          ) : (
            <button type="button" className="tap" disabled={enterBlocked} onClick={doEnter}
              style={{ width: '100%', borderRadius: 13, padding: '0.9rem 0', textAlign: 'center', lineHeight: 1.15, cursor: enterBlocked ? 'default' : 'pointer',
                border: `1px solid ${enterBlocked ? 'rgba(255,255,255,0.1)' : `${accent}b0`}`,
                background: enterBlocked ? 'rgba(255,255,255,0.04)' : `${accent}2a`, color: enterBlocked ? '#6a6764' : '#f4efe4' }}>
              <span className="font-cinzel font-800 uppercase" style={{ display: 'block', fontSize: '1.05rem', letterSpacing: '0.08em' }}>
                {isChallenge && !chAvailable ? 'Clear the Raid First' : (enterLabel ?? 'Enter Raid →')}
              </span>
              <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.52rem', letterSpacing: '0.05em', opacity: 0.75, marginTop: 2 }}>
                {enterSub ?? (isChallenge ? 'Challenge · bonus loot' : 'Normal · standard loot')}
              </span>
            </button>
          )}
        </div>
      </motion.div>
      {/* Sits INSIDE the boss modal's portal so it stacks above it. Its own
          click-stop keeps a tap inside the detail from closing the sheet
          underneath it. */}
      {dropDetail && (
        <div onClick={e => e.stopPropagation()}>
          <DropDetailModal
            drop={dropDetail}
            chance={liveChance(dropDetail)}
            owned={dropOwned(dropDetail)}
            onClose={() => setDropDetail(null)}
          />
        </div>
      )}
    </motion.div>,
    document.body,
  )
}
