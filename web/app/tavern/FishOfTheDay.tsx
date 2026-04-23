'use client'

import { useState, useTransition } from 'react'
import { submitFishGuess, nextMilestone } from './fishActions'
import type { FishPuzzleState } from './fishActions'

const DOUBLOON_REWARDS = [100, 75, 50, 25]

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

      setPuzzle(prev => ({
        ...prev,
        guesses: [...prev.guesses, guessing],
        solved: result.correct,
        isOver: result.isOver,
        doubloons_awarded: result.doubloons ?? prev.doubloons_awarded,
        streak: result.streak ?? prev.streak,
        cluesRevealed: result.nextClue
          ? [...prev.cluesRevealed, result.nextClue]
          : prev.cluesRevealed,
        answer: result.answer,
      }))
    })
  }

  const guessIndex = puzzle.guesses.length
  const reward = DOUBLOON_REWARDS[guessIndex] ?? 0
  const next = nextMilestone(puzzle.streak)
  const daysToNext = next.day - puzzle.streak

  return (
    <div className="flex flex-col gap-5 w-full max-w-sm mx-auto">

      {/* Streak */}
      {puzzle.streak > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
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
              Day {next.day} · +{next.reward} ⟡
            </p>
            <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.62rem' }}>
              {daysToNext === 1 ? 'tomorrow!' : `${daysToNext} days away`}
            </p>
          </div>
        </div>
      )}

      {/* Clues */}
      <div className="flex flex-col gap-2.5">
        {puzzle.cluesRevealed.map((clue, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '0.875rem 1rem',
            }}
          >
            <p className="font-karla font-600 uppercase tracking-[0.15em] text-[#9a9488] mb-1"
               style={{ fontSize: '0.58rem' }}>
              Clue {i + 1}
            </p>
            <p className="font-karla text-[#f0ede8]" style={{ fontSize: '0.875rem', lineHeight: 1.55 }}>
              {clue}
            </p>
          </div>
        ))}

        {/* Locked clues */}
        {!puzzle.isOver && Array.from({ length: 4 - puzzle.cluesRevealed.length }).map((_, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.07)',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              opacity: 0.45,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a8880" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <p className="font-karla font-600 uppercase tracking-[0.15em] text-[#8a8880]"
               style={{ fontSize: '0.58rem' }}>
              Clue {puzzle.cluesRevealed.length + i + 1}
            </p>
          </div>
        ))}
      </div>

      {/* Guess history */}
      {puzzle.guesses.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {puzzle.guesses.map((g, i) => {
            const isCorrect = puzzle.solved && i === puzzle.guesses.length - 1
            return (
              <div key={i} className="flex items-center gap-2">
                <span style={{ color: isCorrect ? '#f0c040' : '#f87171', fontSize: '0.8rem', width: '1rem', flexShrink: 0 }}>
                  {isCorrect ? '✓' : '✗'}
                </span>
                <span className="font-karla" style={{ fontSize: '0.875rem', color: isCorrect ? '#f0c040' : '#6a6764' }}>
                  {g}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Result */}
      {puzzle.isOver && puzzle.answer && (
        <div style={{
          background: puzzle.solved ? 'rgba(240,192,64,0.07)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${puzzle.solved ? 'rgba(240,192,64,0.25)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '12px',
          padding: '1.125rem',
        }}>
          <p className="font-cinzel font-700" style={{ color: puzzle.solved ? '#f0c040' : '#f0ede8', fontSize: '1rem', marginBottom: '0.2rem' }}>
            {puzzle.solved ? puzzle.answer.common_name : `It was the ${puzzle.answer.common_name}`}
          </p>
          {puzzle.answer.scientific_name && (
            <p className="font-karla" style={{ fontStyle: 'italic', color: '#8a8880', fontSize: '0.72rem', marginBottom: '0.6rem' }}>
              {puzzle.answer.scientific_name}
            </p>
          )}
          <p className="font-karla" style={{ color: '#c8c4bc', fontSize: '0.8rem', lineHeight: 1.55 }}>
            {puzzle.answer.fun_fact}
          </p>
          {puzzle.solved && puzzle.doubloons_awarded > 0 && (
            <p className="font-karla font-600" style={{ color: '#f0c040', fontSize: '0.8rem', marginTop: '0.625rem' }}>
              +{puzzle.doubloons_awarded} ⟡
            </p>
          )}
          {milestoneReward && (
            <p className="font-karla font-600" style={{ color: '#34d399', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              +{milestoneReward} ⟡ — {puzzle.streak}-day streak milestone!
            </p>
          )}
          <p className="font-karla" style={{ color: '#6a6764', fontSize: '0.68rem', marginTop: '0.75rem' }}>
            Come back tomorrow for a new fish.
          </p>
        </div>
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
              style={{ borderRadius: '10px', fontSize: '0.875rem' }}
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
                  <p className="font-karla" style={{ padding: '0.75rem 1rem', color: '#8a8880', fontSize: '0.875rem' }}>
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
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
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
            className="btn-gold w-full disabled:opacity-30"
          >
            {isPending ? 'Checking…' : `Guess · ${reward} ⟡ if correct`}
          </button>

          <p className="font-karla text-center" style={{ color: '#6a6764', fontSize: '0.68rem' }}>
            Guess {guessIndex + 1} of 4
          </p>
        </div>
      )}
    </div>
  )
}
