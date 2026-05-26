'use client'

import Link from 'next/link'

export interface JourneyGoal {
  id: string
  label: string
  desc: string
  href: string
  current: number
  target: number
  done: boolean
  badgeImage?: string
  binary?: boolean
  record?: boolean
}

export interface JourneyGroup {
  title: string
  accent: string
  goals: JourneyGoal[]
}

interface Props {
  groups: JourneyGroup[]
  doneCount: number
  totalCount: number
}

function valueText(g: JourneyGoal): { text: string; color: string } {
  if (g.binary) {
    return g.done
      ? { text: 'Earned', color: '#4ade80' }
      : { text: 'Locked', color: 'rgba(240,237,232,0.32)' }
  }
  if (g.done) {
    return { text: g.badgeImage ? 'Earned' : 'Complete', color: '#4ade80' }
  }
  const cur = g.current.toLocaleString()
  const tgt = g.target.toLocaleString()
  return {
    text: g.record ? `Best ${cur} / ${tgt}` : `${cur} / ${tgt}`,
    color: 'rgba(240,237,232,0.6)',
  }
}

export default function AchievementsClient({ groups }: Props) {
  return (
    <div>
      {/* Goal groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        {groups.map(group => (
          <section key={group.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.accent, flexShrink: 0 }} />
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.74rem', color: group.accent }}>
                {group.title}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.goals.map(g => {
                const v = valueText(g)
                const pct = g.target > 0 ? Math.min(1, g.current / g.target) : (g.done ? 1 : 0)
                return (
                  <Link
                    key={g.id}
                    href={g.href}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: g.done ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.022)',
                      border: `1px solid ${g.done ? group.accent + '55' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 14, padding: '0.8rem 0.85rem', textDecoration: 'none',
                    }}
                  >
                    {/* Badge art / accent marker */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(255,255,255,0.04)',
                    }}>
                      {g.badgeImage ? (
                        <img
                          src={g.badgeImage} alt=""
                          style={{
                            width: 32, height: 32, objectFit: 'contain',
                            filter: g.done ? 'none' : 'grayscale(1)',
                            opacity: g.done ? 1 : 0.32,
                          }}
                          onError={e => {
                            const el = e.target as HTMLImageElement
                            el.style.display = 'none'
                            const p = el.parentElement
                            if (p) p.innerHTML = `<span style="font-size:1.1rem;opacity:${g.done ? 0.9 : 0.3}">🏅</span>`
                          }}
                        />
                      ) : (
                        <span style={{
                          width: 14, height: 14, borderRadius: '50%',
                          background: g.done ? group.accent : 'transparent',
                          border: `2px solid ${group.accent}`, opacity: g.done ? 1 : 0.5,
                        }} />
                      )}
                    </div>

                    {/* Body */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <p className="font-karla font-700" style={{
                          fontSize: '0.9rem', color: g.done ? '#f0ede8' : 'rgba(240,237,232,0.78)',
                        }}>
                          {g.label}
                        </p>
                        <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: v.color, flexShrink: 0 }}>
                          {v.text}
                        </p>
                      </div>
                      <p className="font-karla" style={{
                        fontSize: '0.76rem', color: 'rgba(240,237,232,0.42)', lineHeight: 1.4, marginTop: 2,
                      }}>
                        {g.desc}
                      </p>
                      {!g.binary && (
                        <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 8 }}>
                          <div style={{
                            height: '100%', width: `${pct * 100}%`,
                            background: group.accent, borderRadius: 3,
                            opacity: g.done ? 1 : 0.75, transition: 'width 0.4s ease',
                          }} />
                        </div>
                      )}
                    </div>

                    <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '1rem', flexShrink: 0 }}>›</span>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
