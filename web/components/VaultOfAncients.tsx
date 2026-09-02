'use client'

// THE VAULT OF ANCIENTS — the six giants, and how far each has been mastered.
//
// Lifted out of the owner's profile so the PUBLIC one can show it too. Until
// now the wall only existed on your own page, which meant the hardest thing in
// fishing was the one achievement nobody could show anybody.
//
// TWO GATES, and both are the caller's job (see each profile page):
//   the OWNER needs all six caught, or there is no wall worth showing
//   the VIEWER needs all six too, so the finale is not spoiled for someone
//   still working towards it
//
// It also draws VIGIL RANK now, which the owner-only version never did: it drew
// caught-or-not and stopped there, so a captain with six giants at Rank V
// looked identical to one who had landed each of them exactly once. The rank is
// the entire endgame ladder, and it is the thing worth showing off.

import { VIGIL_FRAME, VIGIL_MAX_RANK, vigilNumeral, type VigilState } from '@/lib/ancientVigil'
import { fishImageUrl } from '@/lib/fishArt'

const CARD_RADIUS = 18

/** Full-size fish art, matching the profile's own path convention. */

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI']
const ANCIENT_GIANTS: { id: number; name: string; epithet: string; accent: string }[] = [
  { id: 144, name: 'Plesiosaurus', epithet: 'The Long Neck',      accent: '#22d3ee' },
  { id: 145, name: 'Dunkleosteus', epithet: 'The Armored Jaw',    accent: '#f59e0b' },
  { id: 146, name: 'Mosasaurus',   epithet: 'The Sea Dragon',     accent: '#a855f7' },
  { id: 147, name: 'Basilosaurus', epithet: 'The First Leviathan', accent: '#60a5fa' },
  { id: 148, name: 'Shastasaurus', epithet: 'The Colossus',       accent: '#34d399' },
]
const MEGALODON_GIANT = { id: 143, name: 'Megalodon', epithet: 'The Apex', accent: '#f43f5e' }
// The wall is one list now: five lesser giants, then the apex, three per row.
const ALL_GIANTS = [...ANCIENT_GIANTS, MEGALODON_GIANT]

const VAULT_CSS = `
@keyframes vaultFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
@keyframes vaultShimmer { 0%{transform:translateX(-140%) skewX(-16deg)} 100%{transform:translateX(260%) skewX(-16deg)} }
@keyframes vaultMote { 0%{transform:translateY(0);opacity:0} 18%{opacity:var(--vo,.55)} 82%{opacity:calc(var(--vo,.55)*.55)} 100%{transform:translateY(-70px);opacity:0} }
@keyframes vaultPulse { 0%,100%{opacity:.4} 50%{opacity:.85} }
@keyframes vaultAwaken { 0%,100%{opacity:.35;transform:translate(-50%,-50%) scale(1)} 50%{opacity:.75;transform:translate(-50%,-50%) scale(1.06)} }
`
// [leftPct, sizePx, durS, delayS, opacity]
const VAULT_MOTES: [number, number, number, number, number][] = [
  [8, 3, 17, 0, 0.5], [22, 4, 22, -6, 0.6], [37, 2, 19, -11, 0.45], [52, 4, 25, -3, 0.62],
  [66, 3, 20, -14, 0.5], [80, 4, 23, -8, 0.58], [92, 2, 18, -2, 0.5],
]

const LockRune = ({ color }: { color: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /><circle cx="12" cy="15.5" r="1.3" />
  </svg>
)

function AncientNiche({ giant, index, caught, rank }: {
  giant: { id: number; name: string; epithet: string; accent: string }; index: number; caught: boolean
  /** Vigil rank 1-5, or 0 when uncaught. Drives the pips under the name. */
  rank: number
}) {
  // A mastered giant borrows the Vigil's own gold rather than its species
  // accent, so a finished wall reads as finished at a glance -- the same
  // "struck in gold" language the rank-up ceremony uses.
  const a = rank >= VIGIL_MAX_RANK ? (VIGIL_FRAME[VIGIL_MAX_RANK]?.accent ?? giant.accent) : giant.accent
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      borderRadius: '44px 44px 12px 12px', // arched reliquary niche
      padding: '0.95rem 0.5rem 0.7rem',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: caught
        ? `radial-gradient(ellipse at 50% 118%, ${a}33 0%, rgba(12,9,20,0.86) 56%, rgba(5,4,10,0.97) 100%)`
        : 'radial-gradient(ellipse at 50% 118%, rgba(74,68,104,0.14) 0%, rgba(8,7,14,0.94) 62%)',
      border: `1px solid ${caught ? a + '66' : 'rgba(120,112,150,0.18)'}`,
      borderTop: `1px solid ${caught ? a + 'bb' : 'rgba(150,142,180,0.3)'}`,
      boxShadow: caught ? `inset 0 1px 0 ${a}44, 0 0 22px ${a}26` : 'inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Index numeral — at the arch KEYSTONE (top-center), the one spot the arched
          corners never clip. Top-left sat inside the 44px corner curve and got cut
          off by overflow:hidden. */}
      <span className="font-cinzel font-700" style={{
        position: 'absolute', top: 7, left: '50%', transform: 'translateX(-50%)',
        fontSize: '0.52rem', letterSpacing: '0.14em', lineHeight: 1,
        color: caught ? a : 'rgba(150,142,180,0.4)',
      }}>{ROMAN[index]}</span>

      {/* shimmer sweep on caught niches */}
      {caught && (
        <span aria-hidden style={{
          position: 'absolute', top: 0, bottom: 0, width: '38%', left: 0,
          background: `linear-gradient(90deg, transparent, ${a}22, transparent)`,
          animation: 'vaultShimmer 5.5s ease-in-out infinite', pointerEvents: 'none',
        }} />
      )}

      {/* pedestal + specimen */}
      <div style={{ position: 'relative', width: 78, height: 72, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div aria-hidden style={{
          position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 62, height: 20, borderRadius: '50%',
          background: caught ? `radial-gradient(ellipse, ${a}55 0%, transparent 70%)` : 'radial-gradient(ellipse, rgba(120,112,150,0.18) 0%, transparent 70%)',
          filter: 'blur(2px)',
        }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fishImageUrl(giant.name)} alt={caught ? giant.name : 'Sealed specimen'} loading="lazy" decoding="async"
          style={caught
            ? { position: 'relative', maxWidth: 72, maxHeight: 66, objectFit: 'contain', filter: `drop-shadow(0 3px 14px ${a}88)`, animation: 'vaultFloat 4.2s ease-in-out infinite' }
            : { position: 'relative', maxWidth: 68, maxHeight: 62, objectFit: 'contain', filter: 'brightness(0) opacity(0.72)', animation: 'vaultPulse 3.6s ease-in-out infinite' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>

      <div aria-hidden style={{ width: 30, height: 1, background: `linear-gradient(90deg, transparent, ${caught ? a + '99' : 'rgba(150,142,180,0.3)'}, transparent)` }} />

      {caught ? (
        <>
          <p className="font-cinzel font-700" style={{ fontSize: '0.76rem', color: '#f6f1e8', lineHeight: 1.1, textAlign: 'center', textShadow: `0 0 9px ${a}66` }}>{giant.name}</p>
          <p className="font-karla font-600 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: a }}>{giant.epithet}</p>
          {/* VIGIL RANK. Five pips rather than a numeral, because the wall is
              read as a whole: six rows of pips shows at a glance which giants
              have been carried and which were landed once and left, which a
              row of roman numerals does not. The numeral rides alongside for
              anyone who wants the exact rung. */}
          {rank > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
              {Array.from({ length: VIGIL_MAX_RANK }, (_, n) => (
                <span key={n} aria-hidden style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: n < rank ? a : 'rgba(255,255,255,0.14)',
                  boxShadow: n < rank ? `0 0 5px ${a}` : 'none',
                }} />
              ))}
              <span className="font-karla font-800" style={{ fontSize: '0.46rem', letterSpacing: '0.08em', color: a, marginLeft: 2 }}>
                {vigilNumeral(rank)}
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ color: 'rgba(160,150,190,0.55)' }}><LockRune color="rgba(160,150,190,0.55)" /></div>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: 'rgba(150,142,180,0.5)' }}>Sealed</p>
        </>
      )}
    </div>
  )
}

export default function VaultOfAncients({ caught, vigil }: {
  /** fish_species ids this captain has landed. Names are not needed: the wall
   *  always draws all six from its own table and this only decides which are
   *  sealed, which is why it takes ids rather than rows. */
  caught: number[]
  /** Vigil state keyed by fish id. Omit to draw a caught-or-not wall. */
  vigil?: VigilState
}) {
  const caughtIds = new Set(caught)
  const totalCaught = caughtIds.size
  const fiveSealed = ANCIENT_GIANTS.every(g => caughtIds.has(g.id))
  const megaCaught = caughtIds.has(MEGALODON_GIANT.id)
  const complete = megaCaught // Megalodon is always last, so this === all six

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: complete
        ? 'radial-gradient(ellipse at 50% 0%, rgba(50,20,60,0.94) 0%, rgba(8,5,12,0.98) 72%)'
        : 'radial-gradient(ellipse at 50% 0%, rgba(30,14,44,0.92) 0%, rgba(7,5,11,0.98) 72%)',
      border: `1px solid ${complete ? 'rgba(253,230,138,0.4)' : 'rgba(168,85,247,0.32)'}`,
      borderTop: `1px solid ${complete ? 'rgba(253,230,138,0.6)' : 'rgba(168,85,247,0.5)'}`,
      borderRadius: CARD_RADIUS,
      padding: '1.1rem 0.9rem 1rem',
      boxShadow: `inset 0 1px 0 rgba(253,230,138,0.08), inset 0 0 40px rgba(99,102,241,0.05), 0 0 30px ${complete ? 'rgba(253,230,138,0.14)' : 'rgba(124,58,237,0.14)'}`,
    }}>
      <style dangerouslySetInnerHTML={{ __html: VAULT_CSS }} />

      {/* Completion halo — used to live on the apex plinth; it belongs to the
          whole wall now that the wall is one grid. */}
      {complete && (
        <span aria-hidden style={{
          position: 'absolute', top: '50%', left: '50%', width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(253,230,138,0.14) 0%, transparent 62%)',
          animation: 'vaultAwaken 4.5s ease-in-out infinite', pointerEvents: 'none',
        }} />
      )}

      {/* drifting motes */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {VAULT_MOTES.map(([left, size, dur, delay, op], i) => (
          <span key={i} style={{
            position: 'absolute', bottom: '18%', left: `${left}%`, width: size, height: size, borderRadius: '50%',
            background: i % 2 ? 'rgba(103,232,249,0.7)' : 'rgba(196,181,253,0.7)',
            animation: `vaultMote ${dur}s ease-in-out ${delay}s infinite`, ['--vo' as string]: op,
          } as React.CSSProperties} />
        ))}
      </div>

      {/* header: counter inset on a fading rule */}
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: '1rem' }}>
        <div aria-hidden style={{ position: 'absolute', left: 6, right: 6, top: '50%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(253,230,138,0.4) 50%, transparent)' }} />
        <span className="font-cinzel font-700 uppercase" style={{
          position: 'relative', display: 'inline-block', padding: '0 0.9rem',
          background: complete ? 'rgba(18,8,16,1)' : 'rgba(11,7,14,1)',
          fontSize: '0.58rem', letterSpacing: '0.3em', color: '#fde68a',
        }}>
          {ROMAN[totalCaught]} of VI sealed
        </span>
      </div>

      {/* ALL SIX niches in one grid, three per row — two clean rows. Megalodon
          used to sit under them on its own full-width apex plinth; it is simply
          the sixth niche now, sharing row two with IV and V. Its crimson accent
          and the VI numeral are all the apex distinction the wall needs. */}
      <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 9 }}>
        {ALL_GIANTS.map((g, i) => (
          <div key={g.id} style={{ flex: '0 0 calc(33.333% - 6px)', minWidth: 92 }}>
            <AncientNiche giant={g} index={i + 1} caught={caughtIds.has(g.id)}
              rank={caughtIds.has(g.id) ? (vigil?.[String(g.id)]?.rank ?? 1) : 0} />
          </div>
        ))}
      </div>

      {/* The payoff the apex plinth used to carry — kept, because finishing the
          wall deserves a line, and the grid alone says nothing. */}
      <p className="font-karla font-400 italic" style={{
        position: 'relative', textAlign: 'center', marginTop: 12,
        fontSize: '0.64rem', lineHeight: 1.4,
        color: complete ? '#fde68a' : 'rgba(254,205,211,0.68)',
      }}>
        {complete
          ? '“Every giant, sealed. The deep keeps nothing back from you now.”'
          : fiveSealed
            ? 'The other five are sealed. The black water will open for you now. Go and take it.'
            : 'Seal the other five giants, and the deep will surrender its oldest.'}
      </p>
    </div>
  )
}
