'use client'

import { useState } from 'react'
import CharacterAvatar from '@/components/CharacterAvatar'
import { FINN_AVATAR } from '@/lib/finn'
import { CORSAIRS_RECKONING } from '@/lib/bossRaids'

const PETE_PORTRAIT = CORSAIRS_RECKONING.enemies.pete.portrait ?? ''

export interface StoryLogData {
  finn: {
    encounter: { id: string; lines: string[] }[]
    win: { id: string; lines: string[] }[]
    revealed: boolean
    revealLines: string[]
    discovered: number
    total: number
  }
  raid: {
    done: { label: string; kind: 'story' | 'combat' | 'milestone' | 'shop'; lines: string[] }[]
    next: { label: string; flavor: string } | null
    clearedCount: number
    total: number
  }
}

const KIND_COLOR: Record<string, string> = {
  story: '#6fbf73', combat: '#f0743a', milestone: '#e0b358', shop: '#b08bf0',
}

function Beat({ lines, accent }: { lines: string[]; accent: string }) {
  return (
    <div style={{
      borderLeft: `2px solid ${accent}55`,
      paddingLeft: '0.7rem',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      {lines.map((l, i) => (
        <p key={i} className="font-karla" style={{ fontSize: '0.78rem', lineHeight: 1.55, color: 'rgba(240,237,232,0.66)', whiteSpace: 'pre-line' }}>
          {l}
        </p>
      ))}
    </div>
  )
}

function Panel({
  icon, title, accent, chip, children, defaultOpen = false,
}: {
  icon: React.ReactNode
  title: string
  accent: string
  chip: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent}2e`,
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.7rem',
          padding: '0.85rem 1rem', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span aria-hidden style={{
          width: 32, height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.95rem', color: '#f0ede8' }}>{title}</span>
          <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ display: 'block', fontSize: '0.56rem', color: accent, marginTop: 2 }}>{chip}</span>
        </span>
        <span style={{ color: accent, fontSize: '0.85rem', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 1rem 1.05rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function StoryLog({ data }: { data: StoryLogData }) {
  const { finn, raid } = data
  const FINN_ACCENT = '#d8a24a'
  const RAID_ACCENT = '#c8704a'

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p className="sg-eyebrow mb-2" style={{ color: '#9a9488' }}>The Story So Far</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* ── Finn ── */}
        <Panel
          icon={
            <CharacterAvatar
              characterColor={FINN_AVATAR.characterColor}
              equippedHat={FINN_AVATAR.equippedHat}
              size={32}
              bgColor={FINN_AVATAR.bgColor}
              ringColor={FINN_AVATAR.borderColor}
            />
          }
          title="The Rival on the Dock"
          accent={FINN_ACCENT}
          chip={`${finn.discovered} / ${finn.total} moments uncovered`}
        >
          {finn.discovered === 0 ? (
            <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.5)', lineHeight: 1.55 }}>
              You have not crossed his path yet. Keep fishing and a rival will find you.
            </p>
          ) : (
            <>
              {finn.encounter.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: '#7a7875' }}>What he let slip</p>
                  {finn.encounter.map(b => <Beat key={b.id} lines={b.lines} accent={FINN_ACCENT} />)}
                </div>
              )}
              {finn.win.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: '#7a7875' }}>As you beat him</p>
                  {finn.win.map(b => <Beat key={b.id} lines={b.lines} accent={FINN_ACCENT} />)}
                </div>
              )}
              {finn.revealed && (
                <div style={{
                  background: `${FINN_ACCENT}14`, border: `1px solid ${FINN_ACCENT}44`,
                  borderRadius: 10, padding: '0.8rem 0.9rem',
                  display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: FINN_ACCENT, marginBottom: 4 }}>The Truth</p>
                  {finn.revealLines.map((l, i) => (
                    <p key={i} className="font-karla" style={{ fontSize: '0.78rem', lineHeight: 1.55, color: 'rgba(240,237,232,0.74)' }}>{l}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </Panel>

        {/* ── Raid arc ── */}
        <Panel
          icon={
            <span style={{
              width: 32, height: 32, borderRadius: '50%',
              background: `${RAID_ACCENT}22`,
              border: `1px solid ${RAID_ACCENT}44`,
              overflow: 'hidden', display: 'block', position: 'relative',
            }}>
              {PETE_PORTRAIT && (
                <img
                  src={PETE_PORTRAIT}
                  alt=""
                  aria-hidden
                  style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%', objectFit: 'cover',
                  }}
                />
              )}
            </span>
          }
          title="The Sunken Hand"
          accent={RAID_ACCENT}
          chip={`${raid.clearedCount} / ${raid.total} stops cleared`}
        >
          {raid.clearedCount === 0 ? (
            <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.5)', lineHeight: 1.55 }}>
              The campaign has not begun. Pull the first thread on the Expeditions map.
            </p>
          ) : (
            <>
              {raid.done.map((d, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: KIND_COLOR[d.kind] ?? RAID_ACCENT, flexShrink: 0 }} />
                    <span className="font-cinzel font-700" style={{ fontSize: '0.84rem', color: '#f0ede8' }}>{d.label}</span>
                  </div>
                  <div style={{ paddingLeft: 14 }}>
                    <Beat lines={d.lines} accent={KIND_COLOR[d.kind] ?? RAID_ACCENT} />
                  </div>
                </div>
              ))}
            </>
          )}
          {raid.next && (
            <div style={{
              borderTop: '1px dashed rgba(255,255,255,0.12)', paddingTop: '0.85rem',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#6a6764' }}>The trail continues</p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: 'rgba(240,237,232,0.7)' }}>{raid.next.label}</p>
              <p className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(240,237,232,0.45)', lineHeight: 1.5, fontStyle: 'italic' }}>{raid.next.flavor}</p>
            </div>
          )}
          {!raid.next && raid.clearedCount > 0 && (
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#6a6764', lineHeight: 1.5 }}>
              You have uncovered everything there is. For now.
            </p>
          )}
        </Panel>

      </div>
    </div>
  )
}
