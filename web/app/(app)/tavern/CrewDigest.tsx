import Link from 'next/link'
import CharacterAvatar from '@/components/CharacterAvatar'
import Group from './Group'
import { getCrew, getNewFollowers } from '../social/actions'
import { pactState } from '../sea/pactActions'

/**
 * YOUR CREW AND YOUR PACTS, AS TWO NUMBERS AND A ROW OF FACES.
 *
 * NOT THE LIST. The full follow list and the full pact board are a page of
 * their own (`/social`) and this is the tavern's read on them: how many, who
 * is new, and anything actually waiting on you. The tavern says how things
 * stand; the page says what they are.
 *
 * THE ONE THING THAT IS NOT A DIGEST is somebody asking to sail with you. That
 * is a person waiting on an answer, it goes stale, and burying it one link
 * deep behind a count is how a request sits unanswered for a week. It gets its
 * own line and its own colour, and the number of them is the only figure on
 * this card that is allowed to shout.
 */
const FACES = 7

export default async function CrewDigest() {
  const [crew, newFollowers, pacts] = await Promise.all([
    getCrew(),
    getNewFollowers(),
    pactState(),
  ])

  const shown = crew.slice(0, FACES)
  const more = Math.max(0, crew.length - shown.length)
  const note = crew.length === 0
    ? 'Nobody yet'
    : `${crew.length} ${crew.length === 1 ? 'captain' : 'captains'}`
      + (newFollowers.length > 0 ? ` · ${newFollowers.length} new` : '')
      + (pacts.sailing.length > 0 ? ` · ${pacts.sailing.length} sailing with you` : '')

  return (
    <Group title="Your crew" note={note} action={{ href: '/social', label: 'See all' }}>
      {pacts.asking.length > 0 && (
        <p className="font-karla font-700" style={{
          fontSize: '0.76rem', color: '#a8d98a', margin: '0 0 0.7rem', lineHeight: 1.4,
        }}>
          {pacts.asking.length === 1
            ? `${pacts.asking[0].username} is asking to sail with you.`
            : `${pacts.asking.length} captains are asking to sail with you.`}
          {' '}
          <Link href="/social" style={{ color: '#a8d98a', textUnderlineOffset: 3 }}>Answer them</Link>.
        </p>
      )}

      {crew.length === 0 ? (
        <p className="font-karla" style={{
          fontSize: '0.76rem', color: 'rgba(214,198,166,0.6)', margin: 0, lineHeight: 1.5,
        }}>
          Follow a few captains and you can agree to sail together, and see each other out on the water.
        </p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {shown.map(m => (
            <Link key={m.username} href={`/u/${m.username}`} title={m.username}
              style={{ textDecoration: 'none', display: 'block' }}>
              <CharacterAvatar
                characterColor={m.characterColor}
                equippedHat={m.equippedHat}
                bgColor={m.avatarBg ?? undefined}
                ringColor={m.avatarBorder ?? undefined}
                size={38}
              />
            </Link>
          ))}
          {more > 0 && (
            <span className="font-karla font-700" style={{
              fontSize: '0.72rem', color: 'rgba(214,198,166,0.55)',
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            }}>+{more}</span>
          )}
        </div>
      )}
    </Group>
  )
}
