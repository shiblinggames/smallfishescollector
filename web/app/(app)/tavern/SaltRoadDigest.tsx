import Group from './Group'
import { PersonCard } from '@/components/SaltRoadCards'
import { FOLK, TIER_NAME, TIER_AT } from '@/lib/seaFolk'
import { folkState } from '../sea/folkActions'

/**
 * WHERE YOU STAND WITH THE NINE.
 *
 * The regulars are the one system on this sea a captain can sail past for a
 * week without discovering, and the payoff for the ones who do not is a month
 * of sailing per person. Until now the only place that showed it was a modal
 * hanging off the chart, which meant the longest relationship in the game was
 * also the one with the least evidence that it existed.
 *
 * ── READ-ONLY, AND THAT IS THE POINT ────────────────────────────────────────
 *
 * No talking, no gifts, no tapping through. Rapport moves by pulling alongside
 * somebody on the water, and the moment it can be worked from a menu, sailing
 * out to find Meg stops being the point of Meg. The tavern is allowed to
 * remember them; it is not allowed to replace them.
 *
 * ── AND IT IS A DIGEST, NOT THE WALL ────────────────────────────────────────
 *
 * Three faces and two numbers. Nine cards here would be a roster, and this page
 * already has a room and a crew above it; the full set lives on the chart,
 * where the people are. The three shown are the ones you have got FURTHEST
 * with, because that is the part worth being reminded of.
 */
const SHOW = 3

export default async function SaltRoadDigest() {
  const rap = await folkState()

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
