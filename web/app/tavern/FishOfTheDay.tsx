'use client'

import { useState, useTransition } from 'react'
import { submitFishGuess, purchaseHint } from './fishActions'
import AchievementToast from '@/components/AchievementToast'
import type { FishPuzzleState, FishAnswer, HintType, RevealedHints, HintsUsed } from './fishActions'

function nextMilestone(streak: number): { day: number; reward: number } {
  if (streak < 3) return { day: 3, reward: 25 }
  const next7 = Math.ceil((streak + 1) / 7) * 7
  const next30 = Math.ceil((streak + 1) / 30) * 30
  if (next30 < next7) return { day: next30, reward: 150 }
  return { day: next7, reward: 50 }
}

const HINT_META: { type: HintType; label: string; blurb: string }[] = [
  { type: 'eliminate',    label: 'Rule out a fish',  blurb: 'Reveals one species that is NOT the answer' },
  { type: 'letter',       label: 'Random letter',    blurb: 'Reveals one letter at its position'         },
  { type: 'first_letter', label: 'First letter',     blurb: 'Locks down the starting letter'             },
  { type: 'attribute',    label: 'Random attribute', blurb: 'Reveals water / region / size / edibility'  },
  { type: 'length',       label: 'Word lengths',     blurb: 'Shows how many letters per word'            },
  { type: 'picture',      label: 'Reveal picture',   blurb: 'Shows the fish — last resort'               },
]

function isHintExhausted(type: HintType, hints: HintsUsed): boolean {
  if (type === 'picture')      return !!hints.picture
  if (type === 'length')       return !!hints.length
  if (type === 'first_letter') return !!hints.first_letter
  if (type === 'attribute')    return (hints.attributes?.length ?? 0) >= 4
  // letter / eliminate are repeatable — server returns error if pool empty
  return false
}

export default function FishOfTheDay({
  initialPuzzle,
  allFishNames,
}: {
  initialPuzzle: FishPuzzleState
  allFishNames: string[]
}) {
  const [puzzle, setPuzzle] = useState(initialPuzzle)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [hintPending, setHintPending] = useState<HintType | null>(null)
  const [hintError, setHintError] = useState<string | null>(null)
  const [milestoneReward, setMilestoneReward] = useState<number | undefined>(undefined)
  const [achievementKeys, setAchievementKeys] = useState<string[]>([])

  const alreadyGuessed = new Set(puzzle.guesses.map(g => g.toLowerCase()))
  const eliminated = new Set(puzzle.revealed.eliminated.map(s => s.toLowerCase()))
  const filteredFish = allFishNames.filter(n =>
    !alreadyGuessed.has(n.toLowerCase()) &&
    !eliminated.has(n.toLowerCase()) &&
    n.toLowerCase().includes(search.toLowerCase())
  )

  function handleSelect(name: string) {
    setSelected(name)
    setSearch(name)
    setShowDropdown(false)
  }

  function handleSearchChange(val: string) {
    setSearch(val)
    setSelected(null)
    setShowDropdown(val.length > 0)
  }

  function handleGuess() {
    if (!selected || puzzle.isOver || isPending) return
    const guessing = selected
    setSelected(null)
    setSearch('')
    setShowDropdown(false)
    setHintError(null)

    startTransition(async () => {
      const result = await submitFishGuess(guessing)
      if ('error' in result) return

      if (result.milestoneReward) setMilestoneReward(result.milestoneReward)
      if (result.newAchievements?.length) setAchievementKeys(result.newAchievements)

      setPuzzle(prev => ({
        ...prev,
        guesses: [...prev.guesses, guessing],
        solved: result.correct,
        isOver: result.isOver,
        gems_awarded: result.gems ?? prev.gems_awarded,
        streak: result.streak ?? prev.streak,
        answer: result.answer,
        clues: result.nextClue ? [...prev.clues, result.nextClue] : prev.clues,
      }))
    })
  }

  function handleHint(type: HintType) {
    if (puzzle.isOver || hintPending) return
    const cost = puzzle.hintCosts[type]
    if (puzzle.gemsRemaining < cost) { setHintError('Not enough gems'); return }
    setHintPending(type)
    setHintError(null)
    startTransition(async () => {
      const result = await purchaseHint(type)
      setHintPending(null)
      if ('error' in result) { setHintError(result.error); return }
      setPuzzle(prev => ({
        ...prev,
        hintsUsed: result.hintsUsed,
        revealed: result.revealed,
        gemsRemaining: result.gemsRemaining,
      }))
    })
  }

  const guessesRemaining = puzzle.maxGuesses - puzzle.guesses.length
  const next = nextMilestone(puzzle.streak)
  const daysToNext = next.day - puzzle.streak

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm mx-auto">
      <AchievementToast keys={achievementKeys} onDone={() => setAchievementKeys([])} />

      {/* Streak */}
      {puzzle.streak > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.13)',
          borderRadius: 10, padding: '0.625rem 0.875rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#9a9488]" style={{ fontSize: '0.55rem' }}>
              Current Streak
            </p>
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.1rem', lineHeight: 1 }}>
              {puzzle.streak} <span className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.7rem' }}>
                {puzzle.streak === 1 ? 'day' : 'days'}
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#9a9488]" style={{ fontSize: '0.55rem' }}>
              Next reward
            </p>
            <p className="font-karla text-[#f0c040]" style={{ fontSize: '0.72rem' }}>
              Day {next.day} · +{next.reward} ◆
            </p>
            <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.62rem' }}>
              {daysToNext === 1 ? 'tomorrow!' : `${daysToNext} days away`}
            </p>
          </div>
        </div>
      )}

      {/* Gem bank */}
      {!puzzle.isOver && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(167,139,250,0.12), rgba(167,139,250,0.04))',
          border: '1px solid rgba(167,139,250,0.35)',
          borderRadius: 12, padding: '0.75rem 0.95rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: 'rgba(167,139,250,0.7)' }}>
              Banked Payout
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#a78bfa', lineHeight: 1 }}>
              {puzzle.gemsRemaining} <span style={{ fontSize: '0.9rem', color: 'rgba(167,139,250,0.65)' }}>◆</span>
            </p>
          </div>
          <div className="text-right">
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#9a9488' }}>
              Guesses left
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8', lineHeight: 1 }}>
              {guessesRemaining} / {puzzle.maxGuesses}
            </p>
          </div>
        </div>
      )}

      {/* Revealed info panel */}
      {!puzzle.isOver && (puzzle.revealed.picture_url || puzzle.revealed.word_lengths || puzzle.revealed.first_letter || puzzle.revealed.letters.length > 0 || puzzle.revealed.attributes.length > 0 || puzzle.revealed.eliminated.length > 0) && (
        <RevealedPanel revealed={puzzle.revealed} />
      )}

      {/* Clues (drip-fed) */}
      <div className="flex flex-col gap-2.5">
        {puzzle.clues.map((clue, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 12, padding: '0.875rem 1rem',
          }}>
            <p className="font-karla font-600 uppercase tracking-[0.15em] text-[#9a9488] mb-1" style={{ fontSize: '0.58rem' }}>
              Clue {i + 1}
            </p>
            <p className="font-karla text-[#f0ede8]" style={{ fontSize: '1rem', lineHeight: 1.55 }}>
              {clue}
            </p>
          </div>
        ))}
      </div>

      {/* Guess history */}
      {puzzle.guesses.length > 0 && (
        <div className="flex flex-col gap-1.5" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '0.6rem 0.85rem' }}>
          {puzzle.guesses.map((g, i) => {
            const isCorrect = puzzle.solved && i === puzzle.guesses.length - 1
            return (
              <div key={i} className="flex items-center gap-2">
                <span style={{ color: isCorrect ? '#f0c040' : '#f87171', fontSize: '0.8rem', width: '1rem', flexShrink: 0 }}>
                  {isCorrect ? '✓' : '✗'}
                </span>
                <span className="font-karla" style={{ fontSize: '0.86rem', color: isCorrect ? '#f0c040' : '#a0a09a' }}>
                  {g}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Hint picker */}
      {!puzzle.isOver && (
        <div style={{
          background: 'rgba(2,6,12,0.6)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '0.75rem 0.85rem',
        }}>
          <div className="flex items-center justify-between mb-2">
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: '#9a9488' }}>
              Buy a Hint
            </p>
            {hintError && (
              <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#f87171' }}>
                {hintError}
              </p>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {HINT_META.map(({ type, label, blurb }) => {
              const cost = puzzle.hintCosts[type]
              const exhausted = isHintExhausted(type, puzzle.hintsUsed)
              const canAfford = puzzle.gemsRemaining >= cost
              const disabled = exhausted || !canAfford || hintPending !== null
              const loading = hintPending === type
              return (
                <button
                  key={type}
                  onClick={() => handleHint(type)}
                  disabled={disabled}
                  style={{
                    textAlign: 'left',
                    padding: '0.55rem 0.65rem',
                    background: exhausted ? 'rgba(255,255,255,0.03)' : 'rgba(167,139,250,0.07)',
                    border: `1px solid ${exhausted ? 'rgba(255,255,255,0.06)' : 'rgba(167,139,250,0.22)'}`,
                    borderRadius: 8,
                    cursor: disabled ? 'default' : 'pointer',
                    opacity: exhausted ? 0.45 : 1,
                  }}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#f0ede8' }}>
                      {label}
                    </span>
                    <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: exhausted ? '#5a5856' : '#a78bfa' }}>
                      {exhausted ? '✓' : loading ? '…' : `${cost} ◆`}
                    </span>
                  </div>
                  <p className="font-karla font-300" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.35 }}>
                    {blurb}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Result */}
      {puzzle.isOver && puzzle.answer && (
        <AnswerCard
          answer={puzzle.answer}
          solved={puzzle.solved}
          gemsAwarded={puzzle.gems_awarded}
          streak={puzzle.streak}
          milestoneReward={milestoneReward}
        />
      )}

      {/* Picker */}
      {!puzzle.isOver && (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search fish…"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={() => search.length > 0 && setShowDropdown(true)}
              className="sg-input"
              style={{ borderRadius: 10, fontSize: '1rem' }}
              autoComplete="off"
            />

            {showDropdown && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                maxHeight: 180, overflowY: 'auto',
                background: '#0d0d0b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, zIndex: 20,
              }}>
                {filteredFish.length === 0 ? (
                  <p className="font-karla" style={{ padding: '0.75rem 1rem', color: '#a0a09a', fontSize: '0.875rem' }}>
                    No fish found
                  </p>
                ) : filteredFish.map(name => (
                  <button
                    key={name}
                    onMouseDown={() => handleSelect(name)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '0.6rem 1rem',
                      fontFamily: 'var(--font-karla)', fontSize: '0.875rem',
                      color: '#f0ede8', background: 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer',
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <p className="font-karla font-600" style={{ color: '#f0c040', fontSize: '0.8rem' }}>
              → {selected}
            </p>
          )}

          <button
            onClick={handleGuess}
            disabled={!selected || isPending}
            className="btn-ghost w-full disabled:opacity-30"
          >
            {isPending ? 'Checking…' : `Guess · ${puzzle.gemsRemaining} ◆ if correct`}
          </button>
        </div>
      )}
    </div>
  )
}

function RevealedPanel({ revealed }: { revealed: RevealedHints }) {
  const { picture_url, word_lengths, first_letter, attributes, letters, eliminated } = revealed
  return (
    <div style={{
      background: 'rgba(52,211,153,0.05)',
      border: '1px solid rgba(52,211,153,0.22)',
      borderRadius: 12, padding: '0.85rem 1rem',
      display: 'flex', flexDirection: 'column', gap: '0.7rem',
    }}>
      <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: 'rgba(52,211,153,0.7)' }}>
        Revealed
      </p>

      {picture_url && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={picture_url} alt="The fish"
            style={{ maxWidth: '70%', maxHeight: 160, objectFit: 'contain', borderRadius: 10, filter: 'drop-shadow(0 4px 22px rgba(52,211,153,0.22))' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}

      {word_lengths && (
        <Blanks wordLengths={word_lengths} letters={letters} firstLetter={first_letter} />
      )}

      {!word_lengths && (letters.length > 0 || first_letter) && (
        <div className="flex flex-wrap gap-1.5">
          {first_letter && (
            <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#34d399', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', padding: '0.2rem 0.55rem', borderRadius: 6 }}>
              Starts with {first_letter.toUpperCase()}
            </span>
          )}
          {letters.map(l => (
            <span key={l.position} className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#34d399', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', padding: '0.2rem 0.55rem', borderRadius: 6 }}>
              #{l.position + 1}: {l.char.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {attributes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attributes.map(a => (
            <span key={a.key} className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#34d399', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', padding: '0.22rem 0.6rem', borderRadius: 6 }}>
              <span style={{ color: 'rgba(52,211,153,0.7)' }}>{a.label}:</span> {capitalize(a.value)}
            </span>
          ))}
        </div>
      )}

      {eliminated.length > 0 && (
        <div>
          <p className="font-karla font-400 mb-1" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)' }}>
            Ruled out:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {eliminated.map(name => (
              <span key={name} className="font-karla" style={{ fontSize: '0.65rem', color: '#9a9488', textDecoration: 'line-through', textDecorationColor: 'rgba(154,148,136,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.18rem 0.5rem', borderRadius: 6 }}>
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Blanks({ wordLengths, letters, firstLetter }: {
  wordLengths: number[]
  letters: { position: number; char: string }[]
  firstLetter: string | null
}) {
  // Map absolute string positions → which word + position within word.
  // common_name layout: words separated by single spaces. Build position→word index.
  const positionMap = new Map<number, { wordIdx: number; charIdx: number }>()
  let p = 0
  for (let w = 0; w < wordLengths.length; w++) {
    for (let c = 0; c < wordLengths[w]; c++) {
      positionMap.set(p, { wordIdx: w, charIdx: c })
      p++
    }
    p++ // space
  }

  // Build word grids of revealed chars
  const grids: (string | null)[][] = wordLengths.map(len => Array(len).fill(null))
  for (const { position, char } of letters) {
    const map = positionMap.get(position)
    if (map) grids[map.wordIdx][map.charIdx] = char
  }
  if (firstLetter && grids[0]) grids[0][0] = firstLetter

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'center', padding: '0.4rem 0' }}>
      {grids.map((word, wi) => (
        <div key={wi} style={{ display: 'flex', gap: 6 }}>
          {word.map((ch, ci) => (
            <span key={ci} style={{
              fontFamily: 'var(--font-cinzel)', fontWeight: 700,
              fontSize: '1.1rem',
              width: 18, textAlign: 'center',
              color: ch ? '#34d399' : '#5a5856',
              borderBottom: '2px solid rgba(255,255,255,0.22)',
              textTransform: 'uppercase',
              lineHeight: 1.4,
            }}>
              {ch ?? ' '}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

function capitalize(s: string): string {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const DETAIL_ROWS: { key: keyof FishAnswer; label: string }[] = [
  { key: 'habitat',             label: 'Habitat'      },
  { key: 'range',               label: 'Range'        },
  { key: 'diet',                label: 'Diet'         },
  { key: 'size',                label: 'Size'         },
  { key: 'conservation_status', label: 'Conservation' },
]

function AnswerCard({ answer, solved, gemsAwarded, streak, milestoneReward }: {
  answer: FishAnswer
  solved: boolean
  gemsAwarded: number
  streak: number
  milestoneReward?: number
}) {
  return (
    <div style={{
      background: solved ? 'rgba(240,192,64,0.06)' : 'rgba(255,255,255,0.06)',
      border: `1px solid ${solved ? 'rgba(240,192,64,0.22)' : 'rgba(255,255,255,0.15)'}`,
      borderRadius: 14, overflow: 'hidden',
    }}>
      <div style={{ padding: '1.125rem 1.125rem 0.875rem' }}>
        <p className="font-cinzel font-700" style={{ color: solved ? '#f0c040' : '#f0ede8', fontSize: '1.1rem', marginBottom: '0.2rem' }}>
          {solved ? answer.common_name : `It was the ${answer.common_name}`}
        </p>
        {answer.scientific_name && (
          <p className="font-karla" style={{ fontStyle: 'italic', color: '#a0a09a', fontSize: '0.72rem', marginBottom: '0.75rem' }}>
            {answer.scientific_name}
          </p>
        )}
        <p className="font-karla" style={{ color: '#e8e4de', fontSize: '0.9rem', lineHeight: 1.65 }}>
          {answer.fun_fact}
        </p>
        {solved && gemsAwarded > 0 && (
          <p className="font-karla font-600" style={{ color: '#a78bfa', fontSize: '0.8rem', marginTop: '0.625rem' }}>
            +{gemsAwarded} ◆
          </p>
        )}
        {!solved && (
          <p className="font-karla font-600" style={{ color: '#f87171', fontSize: '0.78rem', marginTop: '0.625rem' }}>
            Out of guesses — banked gems forfeited.
          </p>
        )}
        {milestoneReward && (
          <p className="font-karla font-600" style={{ color: '#34d399', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            +{milestoneReward} ◆ — {streak}-day streak milestone!
          </p>
        )}
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.11)' }}>
        {DETAIL_ROWS.map(({ key, label }) => {
          const val = answer[key]
          if (!val) return null
          return (
            <div key={key} className="flex gap-3" style={{ padding: '0.55rem 1.125rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="font-karla font-600 uppercase tracking-[0.10em] shrink-0" style={{ fontSize: '0.6rem', color: '#9a9488', width: 80, paddingTop: 2 }}>
                {label}
              </p>
              <p className="font-karla" style={{ fontSize: '0.82rem', color: '#c8c4bc', lineHeight: 1.55 }}>
                {val}
              </p>
            </div>
          )
        })}
      </div>

      <p className="font-karla" style={{ color: '#6a6764', fontSize: '0.68rem', padding: '0.75rem 1.125rem' }}>
        Come back tomorrow for a new fish.
      </p>
    </div>
  )
}
