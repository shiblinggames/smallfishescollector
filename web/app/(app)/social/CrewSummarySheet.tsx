'use client'

import { useState } from 'react'
import Link from 'next/link'
import CharacterAvatar from '@/components/CharacterAvatar'
import PopupShell from '@/components/PopupShell'
import { getXPProgress as fishingProgress } from '@/lib/fishingLevel'
import { getXPProgress as navProgress } from '@/lib/expeditionLevel'
import type { CrewMember } from './actions'

/** The four comparable stats, shared with the crew board so a number can never
 *  mean one thing on the row and another in the sheet. */
export type LbStat = {
  key: string
  label: string
  color: string
  value: (m: CrewMember) => number
  fmt: (v: number) => string
}

/**
 * A CREW MEMBER, opened from their row.
 *
 * The row was four numbers and an X, and the only way to learn anything more
 * about someone was to leave the page entirely for /u/[username]. This is the
 * step that was missing in between: everything the social page already knows
 * about a captain, laid out properly, with the trip to their full profile
 * offered rather than required.
 *
 * The remove control lives HERE and nowhere else. On the row it sat one mis-tap
 * from a name you meant to open, and dropping someone from your crew is not a
 * thing to do by accident. Behind a tap and a confirm it takes intent, and the
 * row stops having two targets competing for the same finger.
 */
export default function CrewSummarySheet({
  member, me, rank, crewSize, stats, onRemove, onClose, busy,
}: {
  member: CrewMember
  me: CrewMember
  rank: number
  crewSize: number
  stats: LbStat[]
  onRemove: () => void
  onClose: () => void
  busy: boolean
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const fp = fishingProgress(member.fishingXP)
  const np = navProgress(member.expeditionXP)
  // Their OWN border colour dresses the sheet, so no two captains open the same
  // looking card. Falls back to the fishing gold for accounts that never picked.
  const accent = member.avatarBorder || '#c4a96a'

  return (
    <PopupShell open onClose={onClose} zIndex={140}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, margin: '0 auto', borderRadius: 20, overflow: 'hidden',
          background: 'linear-gradient(180deg, #121a26 0%, #080e16 100%)',
          border: `1px solid ${accent}44`,
          boxShadow: `0 0 44px ${accent}1c, 0 20px 60px rgba(0,0,0,0.62)`,
        }}
      >
        {/* The crest. Portrait big enough to actually see the hat and the colours
            they chose, which is the part of a captain that is theirs. */}
        <div
          style={{
            position: 'relative', padding: '1.5rem 1.2rem 1.2rem', textAlign: 'center',
            background: `radial-gradient(ellipse 120% 90% at 50% 0%, ${accent}2e 0%, transparent 70%)`,
            borderBottom: `1px solid ${accent}26`,
          }}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
              color: '#d8d4ce', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>

          <span style={{ display: 'inline-block', lineHeight: 0, filter: `drop-shadow(0 6px 18px ${accent}55)` }}>
            <CharacterAvatar
              characterColor={member.characterColor}
              equippedHat={member.equippedHat}
              bgColor={member.avatarBg ?? undefined}
              ringColor={member.avatarBorder ?? undefined}
              size={92}
            />
          </span>
          <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f5f2ec', lineHeight: 1.1, marginTop: 10 }}>
            {member.username}
          </p>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.18em', color: `${accent}cc`, marginTop: 5 }}>
            {rank === 1 ? 'Top of your crew' : `${rank} of ${crewSize} in your crew`}
          </p>
        </div>

        {/* The two ladders, each with the bar it is partway along. A level on its
            own is a number; the bar under it is a captain mid-climb. */}
        <div style={{ padding: '1.05rem 1.2rem 0.35rem', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {[
            { label: 'Fishing', color: '#c4a96a', lvl: fp.level, prog: fp.progress },
            { label: 'Navigation', color: '#7090c0', lvl: np.level, prog: np.progress },
          ].map(r => (
            <div key={r.label}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.14em', color: '#8a8480' }}>{r.label}</span>
                <span className="font-cinzel font-700" style={{ fontSize: '1.02rem', color: r.color }}>Lv {r.lvl}</span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round(r.prog * 100)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${r.color}88, ${r.color})` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Head to head. Comparing is the whole reason to follow somebody, so
            every stat says where you stand rather than leaving you to subtract. */}
        <div style={{ padding: '0.85rem 1.2rem 0.2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
          {stats.map(st => {
            const theirs = st.value(member)
            const d = theirs - st.value(me)
            return (
              <div key={st.key} style={{ padding: '0.6rem 0.7rem', borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <span className="font-karla font-700 uppercase" style={{ display: 'block', fontSize: '0.5rem', letterSpacing: '0.14em', color: '#7a7674' }}>{st.label}</span>
                <span className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: st.color }}>{st.fmt(theirs)}</span>
                <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.54rem', marginTop: 1, color: d === 0 ? '#6a6764' : d > 0 ? '#f0a9a9' : '#7fd0a0' }}>
                  {d === 0 ? 'level with you' : d > 0 ? `${d} ahead of you` : `${Math.abs(d)} behind you`}
                </span>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '1.1rem 1.2rem 1.2rem', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Link
            href={`/u/${member.username}`}
            className="font-karla font-700 uppercase tap"
            style={{
              display: 'block', textAlign: 'center', padding: '0.8rem', borderRadius: 12,
              fontSize: '0.68rem', letterSpacing: '0.12em', textDecoration: 'none',
              background: `${accent}1e`, border: `1px solid ${accent}66`, color: '#f5f2ec',
            }}
          >
            View full profile
          </Link>

          {/* Two taps, and the second one names who is being dropped. */}
          <button
            onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
            disabled={busy}
            className="font-karla font-700 uppercase"
            style={{
              padding: '0.62rem', borderRadius: 11, fontSize: '0.6rem', letterSpacing: '0.1em',
              background: confirmRemove ? 'rgba(224,124,124,0.16)' : 'transparent',
              border: `1px solid ${confirmRemove ? 'rgba(224,124,124,0.5)' : 'rgba(255,255,255,0.12)'}`,
              color: busy ? '#6a6764' : confirmRemove ? '#f0a9a9' : '#7a7674',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Removing…' : confirmRemove ? `Remove ${member.username}?` : 'Remove from crew'}
          </button>
        </div>
      </div>
    </PopupShell>
  )
}
