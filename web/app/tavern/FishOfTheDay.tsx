'use client'

import { useState, useTransition } from 'react'
import { submitFishGuess } from './fishActions'
import AchievementToast from '@/components/AchievementToast'
import type { FishPuzzleState, FishAnswer, ComparisonResult } from './fishActions'

function nextMilestone(streak: number): { day: number; reward: number } {
  if (streak < 3) return { day: 3, reward: 25 }
  const next7 = Math.ceil((streak + 1) / 7) * 7
  const next30 = Math.ceil((streak + 1) / 30) * 30
  if (next30 < next7) return { day: next30, reward: 150 }
  return { day: next7, reward: 50 }
}

function capitalize(s: string): string {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const GEM_REWARDS = [100, 85, 70, 55, 40, 25]

const COMPARISON_ATTRS: { key: keyof ComparisonResult['matches']; label: string }[] = [
  { key: 'water_type',    label: 'Water'  },
  { key: 'region',        label: 'Region' },
  { key: 'is_edible',     label: 'Edible' },
  { key: 'size_category', label: 'Size'   },
]

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
  const [milestoneReward, setMilestoneReward] = useState<number | undefined>(undefined)
  const [achievementKeys, setAchievementKeys] = useState<string[]>([])

  const alreadyGuessed = new Set(puzzle.guesses.map(g => g.toLowerCase()))
  const filteredFish = allFishNames.filter(n =>
    !alreadyGuessed.has(n.toLowerCase()) &&
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

    startTransition(async () => {
      const result = await submitFishGuess(guessing)
      if ('error' in result) return

      if (result.milestoneReward) setMilestoneReward(result.milestoneReward)
      if (result.newAchievements?.length) setAchievementKeys(result.newAchievements)

      setPuzzle(prev => {
        const newGuesses = [...prev.guesses, guessing]
        const newComparisons = [...prev.guessComparisons, result.comparison ?? null]
        const newWrongCount = result.correct ? newGuesses.length - 1 : newGuesses.length
        return {
          ...prev,
          guesses: newGuesses,
          guessComparisons: newComparisons,
          tilesPerGuess: Math.min(newWrongCount, 4),
          solved: result.correct,
          isOver: result.isOver,
          gems_awarded: result.gems ?? prev.gems_awarded,
          streak: result.streak ?? prev.streak,
          answer: result.answer,
        }
      })
    })
  }

  const guessIndex = puzzle.guesses.length
  const reward = GEM_REWARDS[guessIndex] ?? 0
  const visibleAttrs = COMPARISON_ATTRS.slice(0, puzzle.tilesPerGuess)
  const next = nextMilestone(puzzle.streak)
  const daysToNext = next.day - puzzle.streak

  return (
    <div className="flex flex-col gap-5 w-full max-w-sm mx-auto">
      <AchievementToast keys={achievementKeys} onDone={() => setAchievementKeys([])} />

      {/* Streak */}
      {puzzle.streak > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.13)',
          borderRadius: '10px',
          padding: '0.625rem 0.875rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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

      {/* All 4 clues — always shown */}
      <div className="flex flex-col gap-2.5">
        {puzzle.clues.map((clue, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              padding: '0.875rem 1rem',
            }}
          >
            <p className="font-karla font-600 uppercase tracking-[0.15em] text-[#9a9488] mb-1"
               style={{ fontSize: '0.58rem' }}>
              Clue {i + 1}
            </p>
            <p className="font-karla text-[#f0ede8]" style={{ fontSize: '1rem', lineHeight: 1.6 }}>
              {clue}
            </p>
          </div>
        ))}
      </div>

      {/* Guess history */}
      {puzzle.guesses.length > 0 && (
        <div className="flex flex-col gap-3">
          {puzzle.guesses.map((g, i) => {
            const isCorrect = puzzle.solved && i === puzzle.guesses.length - 1
            const comparison = puzzle.guessComparisons[i]
            return (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <span style={{ color: isCorrect ? '#f0c040' : '#f87171', fontSize: '0.8rem', width: '1rem', flexShrink: 0 }}>
                    {isCorrect ? '✓' : '✗'}
                  </span>
                  <span className="font-karla" style={{ fontSize: '0.9rem', color: isCorrect ? '#f0c040' : '#c8c4bc' }}>
                    {g}
                  </span>
                </div>
                {!isCorrect && comparison && visibleAttrs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2" style={{ paddingLeft: '1.5rem' }}>
                    {visibleAttrs.map(({ key, label }) => {
                      const value = comparison[key as keyof Omit<ComparisonResult, 'matches'>]
                      const match = comparison.matches[key]
                      return (
                        <div
                          key={key}
                          style={{
                            display: 'inline-flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '6px',
                            background: match ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${match ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.1)'}`,
                          }}
                        >
                          <span style={{
                            fontSize: '0.58rem',
                            fontFamily: 'var(--font-karla)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            color: match ? '#34d399' : '#9a9488',
                          }}>
                            {label}
                          </span>
                          <span style={{
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-karla)',
                            color: match ? '#34d399' : '#c8c4bc',
                            marginTop: '0.1rem',
                          }}>
                            {capitalize(value)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
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
              style={{ borderRadius: '10px', fontSize: '1rem' }}
              autoComplete="off"
            />

            {showDropdown && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                maxHeight: '180px',
                overflowY: 'auto',
                background: '#0d0d0b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                zIndex: 20,
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
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.6rem 1rem',
                      fontFamily: 'var(--font-karla)',
                      fontSize: '0.875rem',
                      color: '#f0ede8',
                      background: 'transparent',
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
            {isPending ? 'Checking…' : `Guess · ${reward} ◆ if correct`}
          </button>

          <p className="font-karla text-center" style={{ color: '#6a6764', fontSize: '0.68rem' }}>
            Guess {guessIndex + 1} of 6
          </p>
        </div>
      )}
    </div>
  )
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
      borderRadius: '14px',
      overflow: 'hidden',
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
            <div
              key={key}
              className="flex gap-3"
              style={{
                padding: '0.55rem 1.125rem',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
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
