// THE SALT ROAD DIGEST, DRAWN (split out 2026-09-30). The tavern's server part
// (./SaltRoadDigest) reads the rapport and hands it here; the desktop build,
// which has no server components, reads it from the save and draws the same.

import Group from './Group'
import { PersonCard } from '@/components/SaltRoadCards'
import { FOLK, TIER_NAME, TIER_AT } from '@/lib/seaFolk'
import type { folkState } from '../sea/folkActions'

const SHOW = 3

/** The digest itself, from the rapport rows. Split from the read so the desktop
 *  build (which has no server components) can draw it from the save. */
export default function SaltRoadDigestView({ rap }: { rap: Awaited<ReturnType<typeof folkState>> }) {

  const known = FOLK
    .map(folk => ({ folk, r: rap.find(x => x.folkId === folk.id) }))
    .filter((x): x is { folk: typeof FOLK[number]; r: NonNullable<typeof x['r']> } =>
      !!x.r && x.r.points > 0)
    .sort((a, b) => b.r.points - a.r.points)

  const maxed = known.filter(x => x.r.tier >= 4).length
  const top = known.slice(0, SHOW)

  const note = known.length === 0
    ? `None of the ${FOLK.length} yet`
    : `${known.length} of ${FOLK.length} known`
      + (maxed > 0 ? ` · ${maxed} thick as thieves` : '')

  return (
    <Group title="The Salt Road" note={note}>
      {known.length === 0 ? (
        <p className="font-karla" style={{
          fontSize: '0.76rem', color: 'rgba(214,198,166,0.6)', margin: 0, lineHeight: 1.5,
        }}>
          Nine people keep to this sea and stay in the same water. Hail one, and keep
          hailing them, and they start talking to you differently.
        </p>
      ) : (
        <>
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: `repeat(${SHOW}, minmax(0, 1fr))`,
          }}>
            {top.map(({ folk, r }) => (
              <PersonCard key={folk.id}
                face={folk.face} accent={folk.accent} name={folk.short}
                sub={TIER_NAME[r.tier]}
                pct={Math.round((Math.min(r.points, TIER_AT[4]) / TIER_AT[4]) * 100)}
                maxed={r.tier >= 4} />
            ))}
          </div>
          <p className="font-karla" style={{
            fontSize: '0.7rem', color: 'rgba(214,198,166,0.5)', margin: '0.7rem 0 0', lineHeight: 1.45,
          }}>
            {known.length < FOLK.length
              ? `${FOLK.length - known.length} more out there. They are on the water, not in here.`
              : 'All nine, and every one of them knows your sail.'}
          </p>
        </>
      )}
    </Group>
  )
}
