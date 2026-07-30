'use client'

/** THE CHARGE PANEL for Finn's two spoils.
 *
 *  Both items are the same idea worn on opposite sides of the game, so they get
 *  one panel rather than two that drift apart. It shows the level, the bar to
 *  the next one, and the whole milestone ladder with everything ahead of you
 *  still visible: the point of these items is the climb, and a ladder you can
 *  see is the reason to keep the other half of the game in your week.
 *
 *  Read-only. Charging happens server-side wherever the opposite skill grants
 *  XP; nothing here can move a number.
 */

import { FINN_ITEMS, FINN_ITEM_MAX_LEVEL, finnItemProgress, type FinnItemId } from '@/lib/finnItems'

export default function FinnChargePanel({ id, xp, equipped }: {
  id: FinnItemId
  xp: number
  /** Uncharged items are still shown, just stated plainly as dormant. */
  equipped: boolean
}) {
  const def = FINN_ITEMS[id]
  const { level, into, next, pct } = finnItemProgress(xp)
  const maxed = next === null
  const source = def.chargedBy === 'navigation' ? 'Navigation XP' : 'Fishing XP'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {/* ── level + bar ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
          <span className="font-karla font-800 uppercase tracking-[0.12em]" style={{ fontSize: '0.53rem', color: def.color }}>
            Charge {level} / {FINN_ITEM_MAX_LEVEL}
          </span>
          <span className="font-karla" style={{ fontSize: '0.56rem', color: '#7d786f', fontVariantNumeric: 'tabular-nums' }}>
            {maxed ? 'Fully charged' : `${into.toLocaleString()} / ${next.toLocaleString()}`}
          </span>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: 'rgba(0,0,0,0.34)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.round(pct * 100)}%`, height: '100%',
            background: maxed
              ? `linear-gradient(90deg, ${def.color}, #f0e2b8)`
              : `linear-gradient(90deg, ${def.color}88, ${def.color})`,
            boxShadow: `0 0 8px ${def.color}66`,
            transition: 'width 420ms cubic-bezier(0.22,1,0.36,1)',
          }} />
        </div>
        <p className="font-karla" style={{ margin: '5px 0 0', fontSize: '0.6rem', lineHeight: 1.45, color: equipped ? '#9a958c' : '#7d786f' }}>
          {equipped
            ? `Charges on ${source}. It only draws while it is equipped.`
            : `Dormant. Equip it and it starts drawing ${source}.`}
        </p>
      </div>

      {/* ── the ladder ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {def.milestones.map(m => {
          const on = m.level <= level
          return (
            <div key={m.level} style={{
              display: 'flex', alignItems: 'flex-start', gap: 7,
              padding: '5px 7px', borderRadius: 8,
              background: on ? `${def.color}14` : 'rgba(255,255,255,0.02)',
              border: `1px solid ${on ? `${def.color}3d` : 'rgba(255,255,255,0.06)'}`,
            }}>
              <span className="font-cinzel font-700" style={{
                flexShrink: 0, width: 15, textAlign: 'center', fontSize: '0.62rem',
                color: on ? def.color : '#5a564f', fontVariantNumeric: 'tabular-nums',
              }}>{m.level}</span>
              <span className="font-karla" style={{
                fontSize: '0.62rem', lineHeight: 1.4,
                color: on ? '#cfc9c0' : '#6d685f',
              }}>{m.desc}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
