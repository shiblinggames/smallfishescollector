'use client'

/** THE BATTLE LOADOUT HERO.
 *
 *  Everything mounted, added up. The slots below tell you WHAT you are carrying;
 *  this tells you what it actually amounts to, which is the question you came to
 *  the page with.
 *
 *  Driven by ONE table covering every RaidEffectType, so a new effect shows up
 *  here the moment an item grants it. The first version hand-picked a handful of
 *  stats and silently dropped everything else, which meant a mounted Emberfrost
 *  Cannonball or Davy's Grand Cannon read as contributing nothing.
 *
 *  Each row folds the SAME way combat folds it, checked against the reducers in
 *  RaidCombat and getRaidPlayerStats. A summary that aggregates differently from
 *  the engine is worse than none, because it reads as authoritative.
 */

import { useState } from 'react'
import { getActiveEffects, type RaidEffectType } from '@/lib/raidItems'

type Group = 'offense' | 'defense' | 'special'
type Fold = 'product' | 'sum' | 'max'

const pctOf = (mult: number) => `${mult >= 1 ? '+' : ''}${Math.round((mult - 1) * 100)}%`
const rate = (n: number) => `${Math.round(n * 100)}%`
const plus = (n: number) => `+${Math.round(n * 100)}%`

/** Every effect an item can grant, where it belongs, and how combat folds it. */
const ROWS: { type: RaidEffectType; label: string; group: Group; fold: Fold; fmt: (n: number) => string }[] = [
  // ── Offense ──
  { type: 'boss_damage_mult',        label: 'Boss damage',      group: 'offense', fold: 'product', fmt: pctOf },
  { type: 'nonboss_damage_mult',     label: 'Mob damage',       group: 'offense', fold: 'product', fmt: pctOf },
  { type: 'crit_damage_mult',        label: 'Critical damage',  group: 'offense', fold: 'product', fmt: pctOf },
  { type: 'noncrit_damage_mult',     label: 'Non-crit damage',  group: 'offense', fold: 'product', fmt: pctOf },
  { type: 'crit_upgrade_chance',     label: 'Critical chance',  group: 'offense', fold: 'sum',     fmt: plus },
  { type: 'first_shot_mult',         label: 'Opening shot',     group: 'offense', fold: 'product', fmt: pctOf },
  { type: 'fire_damage_mult',        label: 'Single shot',      group: 'offense', fold: 'product', fmt: pctOf },
  { type: 'volley_damage_mult',      label: 'Volley damage',    group: 'offense', fold: 'product', fmt: pctOf },
  { type: 'mega_damage_mult',        label: 'Ultimate damage',  group: 'offense', fold: 'product', fmt: pctOf },
  { type: 'afflicted_damage_mult',   label: 'Vs afflicted',     group: 'offense', fold: 'product', fmt: pctOf },
  { type: 'lifesteal_pct',           label: 'Lifesteal',        group: 'offense', fold: 'sum',     fmt: plus },
  // ── Defense ──
  { type: 'incoming_damage_mult',    label: 'Damage taken',     group: 'defense', fold: 'product', fmt: pctOf },
  { type: 'max_hp_mult',             label: 'Max hull',         group: 'defense', fold: 'product', fmt: pctOf },
  { type: 'parry_chance',            label: 'Parry',            group: 'defense', fold: 'max',     fmt: rate },
  { type: 'parry_reflect_pct',       label: 'Parry reflect',    group: 'defense', fold: 'max',     fmt: rate },
  { type: 'max_hit_pct',             label: 'Hit cap',          group: 'defense', fold: 'max',     fmt: rate },
  { type: 'max_hit_chance',          label: 'Hit cap odds',     group: 'defense', fold: 'max',     fmt: rate },
  { type: 'lethal_save',             label: 'Lethal saves',     group: 'defense', fold: 'sum',     fmt: n => `${n}` },
  // ── Special ── the procs and mechanics, which is most of what makes a build
  { type: 'burn_chance',             label: 'Set ablaze',       group: 'special', fold: 'max',     fmt: rate },
  { type: 'freeze_chance',           label: 'Freeze',           group: 'special', fold: 'max',     fmt: rate },
  { type: 'ramp_damage_per_turn',    label: 'Damage per turn',  group: 'special', fold: 'sum',     fmt: plus },
  { type: 'dodge_pierce_chance',     label: 'See the feint',    group: 'special', fold: 'max',     fmt: rate },
  { type: 'crit_strip_charge',       label: 'Strip on crit',    group: 'special', fold: 'max',     fmt: rate },
  { type: 'reload_charge_chance',    label: 'Double reload',    group: 'special', fold: 'max',     fmt: rate },
  { type: 'start_charge_chance',     label: 'Open loaded',      group: 'special', fold: 'max',     fmt: rate },
  { type: 'extra_start_charge_chance', label: 'Extra opener',   group: 'special', fold: 'max',     fmt: rate },
  { type: 'crit_charge_refund_chance', label: 'Free critical',  group: 'special', fold: 'max',     fmt: rate },
  { type: 'weaken_on_hit',           label: 'Weaken',           group: 'special', fold: 'max',     fmt: rate },
  { type: 'corrode_on_hit',          label: 'Corrode',          group: 'special', fold: 'max',     fmt: rate },
  { type: 'feeble_on_hit',           label: 'Feeble',           group: 'special', fold: 'max',     fmt: rate },
  { type: 'speed_roll_nav_pct',      label: 'Turn order',       group: 'special', fold: 'sum',     fmt: plus },
]

const GROUPS: { key: Group; title: string; hue: string }[] = [
  { key: 'offense', title: 'Offense', hue: '#e0a06a' },
  { key: 'defense', title: 'Defense', hue: '#7fb0d8' },
  { key: 'special', title: 'Special', hue: '#b79ae0' },
]

export default function LoadoutSummary({ equippedIds, accent = '#c4b078', onOpenEffects }: {
  /** Already charge-tagged, so a levelled spoil counts for what it currently is. */
  equippedIds: string[]
  accent?: string
  onOpenEffects?: () => void
}) {
  // CLOSED by default. The totals are a reference you check, not the reason you
  // opened this page: what you came to do is move items between the slots and
  // the inventory below, and an expanded hero pushed both down the screen every
  // single visit. The collapsed header still carries an "N active" count, so
  // nothing is hidden, only folded.
  const [open, setOpen] = useState(false)
  const fx = getActiveEffects(equippedIds)

  const active = ROWS.map(r => {
    const mine = fx.filter(e => e.type === r.type)
    if (mine.length === 0) return null
    const v = r.fold === 'product' ? mine.reduce((a, e) => a * e.value, 1)
      : r.fold === 'max' ? mine.reduce((a, e) => Math.max(a, e.value), 0)
      : mine.reduce((a, e) => a + e.value, 0)
    // A multiplier of exactly 1 is no effect at all; a rate of 0 likewise.
    if (r.fold === 'product' ? v === 1 : v === 0) return null
    return { ...r, text: r.fmt(v) }
  }).filter(Boolean) as ({ label: string; group: Group; text: string })[]

  return (
    <div style={{
      marginBottom: '1.15rem', padding: '0.9rem 0.95rem',
      borderRadius: 14,
      background: 'linear-gradient(160deg, rgba(26,33,46,0.82) 0%, rgba(12,17,26,0.86) 100%)',
      border: `1px solid ${accent}2e`,
      boxShadow: `inset 0 0 26px ${accent}0f`,
    }}>
      {/* Title and the breakdown link share a row: the link is a footnote to
          this total, and putting it here costs no vertical space at all. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: open && active.length ? 11 : 0 }}>
        {/* The title IS the toggle, so the whole row is a comfortable tap
            target rather than a chevron you have to hit precisely. */}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: 0, background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left', touchAction: 'manipulation' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a8480" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden
            style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
          <p className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: '#f0ede8', lineHeight: 1.1 }}>Equipment Stats</p>
          {!open && active.length > 0 && (
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.54rem', color: '#8a8480', whiteSpace: 'nowrap' }}>
              {active.length} active
            </span>
          )}
        </button>
        {onOpenEffects && active.length > 0 && open && (
          <button
            type="button"
            onClick={onOpenEffects}
            className="font-karla font-700 uppercase tracking-[0.1em]"
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.3rem 0.62rem', borderRadius: 999, fontSize: '0.56rem', color: '#c8d2e0', background: 'rgba(120,140,170,0.12)', border: '1px solid rgba(120,140,170,0.3)', cursor: 'pointer', touchAction: 'manipulation' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
            All effects
          </button>
        )}
      </div>

      {open && (active.length === 0 ? (
        <p className="font-karla" style={{ fontSize: '0.78rem', color: '#8a8480', lineHeight: 1.45 }}>
          Nothing mounted yet. Fill a slot below and its effects total up here.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {GROUPS.map(g => {
            const stats = active.filter(s => s.group === g.key)
            if (stats.length === 0) return null
            return (
              <div key={g.key}>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.2em', color: g.hue, marginBottom: 6, opacity: 0.92 }}>{g.title}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                  {stats.map(s => (
                    <div key={s.label} style={{
                      display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0,
                      padding: '0.45rem 0.55rem', borderRadius: 9,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <span className="font-cinzel font-800" style={{ flexShrink: 0, fontSize: '1rem', lineHeight: 1, color: g.hue, fontVariantNumeric: 'tabular-nums' }}>{s.text}</span>
                      <span className="font-karla font-600" style={{ minWidth: 0, fontSize: '0.68rem', lineHeight: 1.2, color: '#d8d3ca', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
