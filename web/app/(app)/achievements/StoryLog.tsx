'use client'

import { useState } from 'react'
import CharacterAvatar from '@/components/CharacterAvatar'
import { FINN_AVATAR } from '@/lib/finn'
import { CORSAIRS_RECKONING } from '@/lib/bossRaids'

const PETE_PORTRAIT = CORSAIRS_RECKONING.enemies.pete.portrait ?? ''

export interface StoryLogData {
  finn: {
    encounter: { id: string; lines: string[] }[]
    revealed: boolean
    revealLines: string[]
    discovered: number
    total: number
  }
  raid: {
    done: { label: string; kind: 'story' | 'combat' | 'milestone' | 'shop'; lines: string[]; image?: string | null }[]
    next: { label: string; flavor: string; image?: string | null } | null
    clearedCount: number
    total: number
  }
}

type RaidStopData = StoryLogData['raid']['done'][number]

const KIND_COLOR: Record<string, string> = {
  story: '#6fbf73', combat: '#f0743a', milestone: '#e0b358', shop: '#b08bf0',
}
const KIND_LABEL: Record<string, string> = {
  story: 'Story', combat: 'Battle', milestone: 'Milestone', shop: 'Port of Call',
}

// Warm ink tones — the journal is written on parchment, not a dark glass panel.
const INK = 'rgba(240,230,210,0.78)'
const INK_FAINT = 'rgba(240,230,210,0.5)'
const PARCHMENT_TITLE = '#f0e6d2'

function Beat({ lines, accent, dropcap }: { lines: string[]; accent: string; dropcap?: boolean }) {
  return (
    <div style={{
      borderLeft: `2px solid ${accent}55`,
      paddingLeft: '0.7rem',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      {lines.map((l, i) => (
        <p
          key={i}
          className={`font-karla${dropcap && i === 0 ? ' log-dropcap' : ''}`}
          style={{ fontSize: '0.8rem', lineHeight: 1.6, color: INK, whiteSpace: 'pre-line' }}
        >
          {l}
        </p>
      ))}
    </div>
  )
}

/** A Finn moment rendered like a remembered exchange — his avatar beside
 *  the words, so the journal reads as a record of run-ins with the rival. */
function FinnBeat({ lines, accent, dropcap }: { lines: string[]; accent: string; dropcap?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        <CharacterAvatar
          characterColor={FINN_AVATAR.characterColor}
          equippedHat={FINN_AVATAR.equippedHat}
          size={28}
          bgColor={FINN_AVATAR.bgColor}
          ringColor={FINN_AVATAR.borderColor}
        />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Beat lines={lines} accent={accent} dropcap={dropcap} />
      </div>
    </div>
  )
}

/** Small wax-seal style chip stamping the kind of stop into the margin. */
function KindSeal({ kind }: { kind: string }) {
  const accent = KIND_COLOR[kind] ?? '#c8704a'
  return (
    <span
      className="font-karla font-700 uppercase tracking-[0.1em]"
      style={{
        fontSize: '0.52rem', color: accent, flexShrink: 0,
        background: `${accent}1a`, border: `1px solid ${accent}40`,
        borderRadius: 999, padding: '2px 8px',
      }}
    >
      {KIND_LABEL[kind] ?? kind}
    </span>
  )
}

function RaidStop({ d, dropcap }: { d: RaidStopData; dropcap?: boolean }) {
  const accent = KIND_COLOR[d.kind] ?? '#c8704a'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {d.image ? (
          <span style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            border: `1.5px solid ${accent}66`,
            overflow: 'hidden', position: 'relative', display: 'block',
            background: 'rgba(8,12,16,0.6)',
          }}>
            <img
              src={d.image}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </span>
        ) : (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0, marginLeft: 3 }} />
        )}
        <span className="font-cinzel font-700" style={{ fontSize: '0.84rem', color: PARCHMENT_TITLE, flex: 1, minWidth: 0 }}>{d.label}</span>
        <KindSeal kind={d.kind} />
      </div>
      <div style={{ paddingLeft: d.image ? 43 : 14 }}>
        <Beat lines={d.lines} accent={accent} dropcap={dropcap} />
      </div>
    </div>
  )
}

/** Parchment journal page. Header + latest beat are always visible; older
 *  beats live behind the inline "Show earlier" toggle (see EarlierToggle). */
function Panel({
  icon, title, accent, chip, children,
}: {
  icon: React.ReactNode
  title: string
  accent: string
  chip: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: [
        'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(196,169,106,0.10) 0%, transparent 70%)',
        'linear-gradient(180deg, rgba(48,36,18,0.38) 0%, rgba(28,20,10,0.6) 100%)',
      ].join(', '),
      border: '1px solid rgba(196,169,106,0.25)',
      borderRadius: 14,
      boxShadow: 'inset 0 0 24px rgba(0,0,0,0.45)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.7rem',
        padding: '0.85rem 1rem 0.7rem',
        borderBottom: '1px solid rgba(196,169,106,0.14)',
      }}>
        <span aria-hidden style={{
          width: 32, height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.95rem', color: PARCHMENT_TITLE }}>{title}</span>
          <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ display: 'block', fontSize: '0.56rem', color: accent, marginTop: 2 }}>{chip}</span>
        </span>
      </div>
      <div style={{ padding: '0.9rem 1rem 1.05rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {children}
      </div>
    </div>
  )
}

/** Collapsed-by-default reveal for the older beats of a storyline. */
function EarlierToggle({ accent, count, children }: { accent: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (count <= 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="font-karla font-700 uppercase tracking-[0.1em]"
        style={{
          alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: accent,
        }}
      >
        <span style={{ fontSize: '0.6rem' }}>{open ? 'Hide earlier' : `Show ${count} earlier`}</span>
        <span style={{ fontSize: '0.72rem', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{children}</div>}
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: '#a89878' }}>
      {children}
    </p>
  )
}

export default function StoryLog({ data }: { data: StoryLogData }) {
  const { finn, raid } = data
  const FINN_ACCENT = '#d8a24a'
  const RAID_ACCENT = '#c8704a'

  // Finn: the Truth (if revealed) is the climax — otherwise the latest moment.
  const finnLatestBeat = finn.encounter[finn.encounter.length - 1] ?? null
  const finnEarlier = finn.revealed ? finn.encounter : finn.encounter.slice(0, -1)

  // Raid: the most recently cleared stop leads; older stops collapse.
  const raidLatest = raid.done[raid.done.length - 1] ?? null
  const raidEarlier = raid.done.slice(0, -1)

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p className="sg-eyebrow mb-2" style={{ color: '#a89878' }}>The Story So Far</p>
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
            <p className="font-karla" style={{ fontSize: '0.78rem', color: INK_FAINT, lineHeight: 1.55 }}>
              You have not crossed his path yet. Keep fishing and a rival will find you.
            </p>
          ) : (
            <>
              {/* Latest — the Truth if revealed, else the most recent moment */}
              {finn.revealed ? (
                <div style={{
                  background: `${FINN_ACCENT}14`, border: `1px solid ${FINN_ACCENT}44`,
                  borderRadius: 10, padding: '0.8rem 0.9rem',
                  display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: FINN_ACCENT, marginBottom: 4 }}>The Truth</p>
                  {finn.revealLines.map((l, i) => (
                    <p key={i} className={`font-karla${i === 0 ? ' log-dropcap' : ''}`} style={{ fontSize: '0.8rem', lineHeight: 1.6, color: INK }}>{l}</p>
                  ))}
                </div>
              ) : finnLatestBeat && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Eyebrow>Latest moment</Eyebrow>
                  <FinnBeat lines={finnLatestBeat.lines} accent={FINN_ACCENT} dropcap />
                </div>
              )}

              {/* Earlier moments behind the dropdown */}
              <EarlierToggle accent={FINN_ACCENT} count={finnEarlier.length}>
                <Eyebrow>What he let slip</Eyebrow>
                {finnEarlier.map(b => <FinnBeat key={b.id} lines={b.lines} accent={FINN_ACCENT} />)}
              </EarlierToggle>
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
                  loading="lazy"
                  decoding="async"
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
            <p className="font-karla" style={{ fontSize: '0.78rem', color: INK_FAINT, lineHeight: 1.55 }}>
              The campaign has not begun. Pull the first thread on the Expeditions map.
            </p>
          ) : (
            <>
              {raidLatest && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Eyebrow>Latest stop</Eyebrow>
                  <RaidStop d={raidLatest} dropcap />
                </div>
              )}
              <EarlierToggle accent={RAID_ACCENT} count={raidEarlier.length}>
                {raidEarlier.map((d, i) => <RaidStop key={i} d={d} />)}
              </EarlierToggle>
            </>
          )}

          {raid.next && (
            <div style={{
              borderTop: '1px dashed rgba(196,169,106,0.22)', paddingTop: '0.85rem',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {raid.next.image && (
                <span style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  border: '1.5px solid rgba(196,169,106,0.3)',
                  overflow: 'hidden', position: 'relative', display: 'block',
                  background: 'rgba(8,12,16,0.6)',
                }}>
                  <img
                    src={raid.next.image}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    decoding="async"
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%', objectFit: 'cover',
                      opacity: 0.55, filter: 'saturate(0.7)',
                    }}
                  />
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#a89878' }}>The trail continues</span>
                <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: 'rgba(240,230,210,0.75)' }}>{raid.next.label}</span>
                <span className="font-karla" style={{ fontSize: '0.74rem', color: INK_FAINT, lineHeight: 1.5, fontStyle: 'italic' }}>{raid.next.flavor}</span>
              </span>
            </div>
          )}
          {!raid.next && raid.clearedCount > 0 && (
            <p className="font-karla" style={{ fontSize: '0.72rem', color: INK_FAINT, lineHeight: 1.5 }}>
              You have uncovered everything there is. For now.
            </p>
          )}
        </Panel>

      </div>
    </div>
  )
}
