'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

type HintMeta = { type: HintType; label: string; icon: React.ReactNode }

function HintIcon({ type }: { type: HintType }) {
  const stroke = 'currentColor'
  if (type === 'next_clue') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
      <path d="M9 10l3 3 3-3" /><path d="M12 13V4" />
    </svg>
  )
  if (type === 'letter') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V8l4 6 4-6v11" /><path d="M16 19V8h4" /><path d="M16 13h3" />
    </svg>
  )
  if (type === 'first_letter') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19V7l4 8 4-8v12" /><path d="M16 17h6" />
    </svg>
  )
  if (type === 'attribute') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  )
  if (type === 'length') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h18" /><path d="M3 8v8" /><path d="M21 8v8" />
    </svg>
  )
  // picture
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M3 17l5-4 4 3 4-4 5 4" />
    </svg>
  )
}

const HINT_META: HintMeta[] = [
  { type: 'next_clue',    label: 'Next Clue',   icon: <HintIcon type="next_clue" />    },
  { type: 'letter',       label: 'Letter',      icon: <HintIcon type="letter" />       },
  { type: 'first_letter', label: 'First Letter',icon: <HintIcon type="first_letter" /> },
  { type: 'attribute',    label: 'Attribute',   icon: <HintIcon type="attribute" />    },
  { type: 'length',       label: 'Word Lengths',icon: <HintIcon type="length" />       },
  { type: 'picture',      label: 'Picture',     icon: <HintIcon type="picture" />      },
]

function isHintExhausted(type: HintType, hints: HintsUsed): boolean {
  if (type === 'picture')      return !!hints.picture
  if (type === 'length')       return !!hints.length
  if (type === 'first_letter') return !!hints.first_letter
  if (type === 'attribute')    return (hints.attributes?.length ?? 0) >= 4
  if (type === 'next_clue')    return (hints.next_clue_count ?? 0) >= 3
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
  const filteredFish = allFishNames.filter(n =>
    !alreadyGuessed.has(n.toLowerCase()) &&
    n.toLowerCase().includes(search.toLowerCase())
  )
  const roundHintUsed = puzzle.hintBuysTotal > puzzle.guesses.length

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
      }))
    })
  }

  function handleHint(type: HintType) {
    if (puzzle.isOver || hintPending) return
    if (roundHintUsed) { setHintError('Make a guess to unlock another hint'); return }
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
        hintBuysTotal: result.hintBuysTotal,
        revealed: result.revealed,
        gemsRemaining: result.gemsRemaining,
        clues: result.unlockedClue ? [...prev.clues, result.unlockedClue] : prev.clues,
      }))
    })
  }

  const next = nextMilestone(puzzle.streak)
  const daysToNext = next.day - puzzle.streak

  return (
    <div className="flex flex-col gap-3 w-full max-w-sm mx-auto">
      <AchievementToast keys={achievementKeys} onDone={() => setAchievementKeys([])} />

      {!puzzle.isOver && <HeaderStrip gems={puzzle.gemsRemaining} guesses={puzzle.guesses.length} maxGuesses={puzzle.maxGuesses} solved={puzzle.solved} />}

      {puzzle.streak > 0 && !puzzle.isOver && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.55rem 0.85rem',
          background: '#060c14',
          border: '1px solid #2a3548',
          borderRadius: 10,
        }}>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#d4a85a' }}>
            <span style={{ fontWeight: 800, fontSize: '0.82rem' }}>{puzzle.streak}</span>
            <span style={{ color: '#7a8aa0' }}> day streak</span>
          </p>
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7a8aa0' }}>
            Day {next.day} → +{next.reward} ◆ {daysToNext === 1 ? '(tomorrow!)' : `(${daysToNext} days)`}
          </p>
        </div>
      )}

      {/* Revealed info — only renders if something is revealed */}
      {!puzzle.isOver && (puzzle.revealed.picture_url || puzzle.revealed.word_lengths || puzzle.revealed.first_letter || puzzle.revealed.letters.length > 0 || puzzle.revealed.attributes.length > 0) && (
        <RevealedPanel revealed={puzzle.revealed} />
      )}

      {/* Clues */}
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {puzzle.clues.map((clue, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{
                background: '#060c14',
                border: '1px solid #2a3548',
                borderRadius: 10, padding: '0.85rem 0.95rem',
                display: 'flex', gap: 11, alignItems: 'flex-start',
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#1c2540',
                border: '1px solid #3a4560',
                fontFamily: 'var(--font-cinzel)', fontSize: '0.74rem',
                color: '#a8b8d0', fontWeight: 700,
                marginTop: 1,
              }}>
                {i + 1}
              </div>
              <p className="font-karla" style={{ fontSize: '0.92rem', lineHeight: 1.55, color: '#e8e4de', flex: 1 }}>
                {clue}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Guess history pips */}
      {puzzle.guesses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0.55rem 0.85rem', background: '#04080e', border: '1px solid #2a3548', borderRadius: 10 }}>
          {puzzle.guesses.map((g, i) => {
            const isCorrect = puzzle.solved && i === puzzle.guesses.length - 1
            return (
              <div key={i} className="flex items-center gap-2.5">
                <span style={{
                  width: 15, height: 15, borderRadius: 3,
                  background: isCorrect ? '#3d7349' : '#9a4848',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', color: '#0a0a0a', fontWeight: 800, flexShrink: 0,
                }}>
                  {isCorrect ? '✓' : '✕'}
                </span>
                <span className="font-karla font-600" style={{ fontSize: '0.82rem', color: isCorrect ? '#86c895' : '#7a8aa0' }}>
                  {g}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Hint shop */}
      {!puzzle.isOver && (
        <div style={{
          padding: '0.65rem 0.7rem 0.75rem',
          background: '#060c14',
          border: '1px solid #2a3548',
          borderRadius: 12,
        }}>
          <div className="flex items-center justify-between" style={{ padding: '0 0.2rem 0.55rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.58rem', color: roundHintUsed ? '#d4a85a' : '#7a8aa0' }}>
              {roundHintUsed ? 'Locked — Guess to Continue' : 'Hint Shop · 1 per round'}
            </p>
            <AnimatePresence>
              {hintError && (
                <motion.p
                  key={hintError}
                  initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                  className="font-karla font-700" style={{ fontSize: '0.6rem', color: '#c88080' }}
                >
                  {hintError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {HINT_META.map(({ type, label, icon }) => {
              const cost = puzzle.hintCosts[type]
              const exhausted = isHintExhausted(type, puzzle.hintsUsed)
              const canAfford = puzzle.gemsRemaining >= cost
              const lockedRound = roundHintUsed && !exhausted
              const disabled = exhausted || !canAfford || lockedRound || hintPending !== null
              const loading = hintPending === type
              const bg = exhausted ? '#1a2820' : lockedRound ? '#04080e' : canAfford ? '#1c2540' : '#04080e'
              const borderColor = exhausted ? '#3d7349' : lockedRound ? '#2a3548' : canAfford ? '#3a4a78' : '#2a3548'
              return (
                <motion.button
                  key={type}
                  onClick={() => handleHint(type)}
                  disabled={disabled}
                  whileTap={disabled ? {} : { scale: 0.95 }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 5, padding: '0.6rem 0.3rem 0.5rem',
                    background: bg,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 8,
                    color: exhausted ? '#86c895' : lockedRound ? '#4a5468' : canAfford ? '#a8b8d0' : '#4a5468',
                    cursor: disabled ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20 }}>
                    {loading ? (
                      <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-block', fontSize: '0.75rem' }}>◆</motion.span>
                    ) : icon}
                  </div>
                  <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: exhausted ? '#86c895' : lockedRound ? '#5a6478' : '#e8e4dc', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2, textAlign: 'center' }}>
                    {label}
                  </p>
                  <p className="font-karla font-700" style={{ fontSize: '0.64rem', lineHeight: 1, color: exhausted ? '#86c895' : lockedRound ? '#4a5468' : '#d4a85a' }}>
                    {exhausted ? '✓ GOT' : `${cost} ◆`}
                  </p>
                </motion.button>
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
        <div className="flex flex-col gap-2.5" style={{ marginTop: '0.25rem' }}>
          <div className="relative">
            <input
              type="text"
              placeholder="Guess a fish…"
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
                maxHeight: 200, overflowY: 'auto',
                background: '#04080e',
                border: '1px solid #2a3548',
                borderRadius: 10, zIndex: 20,
              }}>
                {filteredFish.length === 0 ? (
                  <p className="font-karla" style={{ padding: '0.75rem 1rem', color: '#7a8aa0', fontSize: '0.875rem' }}>
                    No fish found
                  </p>
                ) : filteredFish.map(name => (
                  <button
                    key={name}
                    onMouseDown={() => handleSelect(name)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '0.65rem 1rem',
                      fontFamily: 'var(--font-karla)', fontSize: '0.88rem',
                      color: '#e8e4dc', background: 'transparent',
                      borderBottom: '1px solid #1a2434',
                      cursor: 'pointer',
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <motion.button
            onClick={handleGuess}
            disabled={!selected || isPending}
            whileTap={!selected || isPending ? {} : { scale: 0.97 }}
            className="font-karla font-700 uppercase tracking-[0.14em]"
            style={{
              width: '100%', padding: '0.85rem',
              borderRadius: 10,
              fontSize: '0.78rem',
              background: selected && !isPending ? '#2d5a3a' : '#04080e',
              border: `1px solid ${selected && !isPending ? '#3d7349' : '#2a3548'}`,
              color: selected && !isPending ? '#d4ecda' : '#5a6478',
              cursor: !selected || isPending ? 'not-allowed' : 'pointer',
              transition: 'background 0.18s, border 0.18s, color 0.18s',
            }}
          >
            {isPending ? 'Checking…' : selected ? `Guess "${selected}"` : 'Pick a fish'}
          </motion.button>
        </div>
      )}
    </div>
  )
}

function HeaderStrip({ gems, guesses, maxGuesses, solved }: { gems: number; guesses: number; maxGuesses: number; solved: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 14,
      padding: '0.85rem 1.05rem',
      background: '#060c14',
      border: '1px solid #2a3548',
      borderRadius: 12,
    }}>
      <div>
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#7a8aa0', marginBottom: 3 }}>
          Banked Payout
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <motion.p
            key={gems}
            initial={{ scale: 1.15, color: '#e8c878' }}
            animate={{ scale: 1, color: '#d4a85a' }}
            transition={{ duration: 0.35 }}
            className="font-cinzel font-700"
            style={{ fontSize: '1.85rem', lineHeight: 1 }}
          >
            {gems}
          </motion.p>
          <span className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#a08648' }}>◆</span>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#7a8aa0', marginBottom: 5 }}>
          Guesses
        </p>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
          {Array.from({ length: maxGuesses }).map((_, i) => {
            const used = i < guesses
            const isLastUsed = i === guesses - 1
            const isCurrent = i === guesses && !solved
            return (
              <motion.div key={i}
                animate={isCurrent ? { opacity: [0.45, 1, 0.45] } : { opacity: 1 }}
                transition={isCurrent ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                style={{
                  width: 16, height: 16, borderRadius: 4,
                  background: used
                    ? (solved && isLastUsed ? '#3d7349' : '#9a4848')
                    : '#04080e',
                  border: `1px solid ${used ? (solved && isLastUsed ? '#3d7349' : '#9a4848') : '#2a3548'}`,
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function RevealedPanel({ revealed }: { revealed: RevealedHints }) {
  const { picture_url, word_lengths, first_letter, attributes, letters } = revealed
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      style={{
        background: '#060c14',
        border: '1px solid #3d5e48',
        borderRadius: 12, padding: '0.85rem 0.9rem',
        display: 'flex', flexDirection: 'column', gap: 11,
      }}
    >
      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.58rem', color: '#86c895' }}>
        Revealed
      </p>

      {picture_url && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ display: 'flex', justifyContent: 'center', padding: '0.3rem 0' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={picture_url} alt="The fish"
            style={{ maxWidth: '65%', maxHeight: 150, objectFit: 'contain', filter: 'drop-shadow(0 4px 24px rgba(34,197,94,0.25))' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        </motion.div>
      )}

      {word_lengths && (
        <Blanks wordLengths={word_lengths} letters={letters} firstLetter={first_letter} />
      )}

      {!word_lengths && (letters.length > 0 || first_letter) && (
        <div className="flex flex-wrap gap-1.5">
          {first_letter && <LetterChip label="Starts" value={first_letter.toUpperCase()} />}
          {letters.map(l => <LetterChip key={l.position} label="In Name" value={l.char.toUpperCase()} />)}
        </div>
      )}

      {attributes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attributes.map(a => (
            <div key={a.key} style={{
              display: 'inline-flex', flexDirection: 'column',
              padding: '0.28rem 0.6rem',
              background: '#1a2820',
              border: '1px solid #3d7349',
              borderRadius: 6,
            }}>
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#7a9a85' }}>
                {a.label}
              </span>
              <span className="font-karla font-700" style={{ fontSize: '0.76rem', color: '#d4ecda', lineHeight: 1.1, marginTop: 1 }}>
                {capitalize(a.value)}
              </span>
            </div>
          ))}
        </div>
      )}

    </motion.div>
  )
}

function LetterChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      padding: '0.26rem 0.5rem',
      background: '#1a2820',
      border: '1px solid #3d7349',
      borderRadius: 6,
    }}>
      <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#7a9a85' }}>
        {label}
      </span>
      <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#d4ecda', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  )
}

function Blanks({ wordLengths, letters, firstLetter }: {
  wordLengths: number[]
  letters: { position: number; char: string }[]
  firstLetter: string | null
}) {
  const positionMap = new Map<number, { wordIdx: number; charIdx: number }>()
  let p = 0
  for (let w = 0; w < wordLengths.length; w++) {
    for (let c = 0; c < wordLengths[w]; c++) {
      positionMap.set(p, { wordIdx: w, charIdx: c })
      p++
    }
    p++
  }
  const grids: (string | null)[][] = wordLengths.map(len => Array(len).fill(null))
  for (const { position, char } of letters) {
    const map = positionMap.get(position)
    if (map) grids[map.wordIdx][map.charIdx] = char
  }
  if (firstLetter && grids[0]) grids[0][0] = firstLetter

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', padding: '0.35rem 0' }}>
      {grids.map((word, wi) => (
        <div key={wi} style={{ display: 'flex', gap: 4 }}>
          {word.map((ch, ci) => (
            <motion.div key={`${wi}-${ci}`}
              initial={false}
              animate={{
                backgroundColor: ch ? '#2d5a3a' : '#04080e',
                borderColor:     ch ? '#3d7349' : '#2a3548',
                rotateY:         ch ? [0, 180, 360] : 0,
              }}
              transition={{ duration: ch ? 0.42 : 0, ease: 'easeOut' }}
              style={{
                width: 32, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 5,
                border: '1px solid #2a3548',
                fontFamily: 'var(--font-cinzel)', fontSize: '1.1rem',
                fontWeight: 700,
                color: ch ? '#d4ecda' : 'transparent',
                textTransform: 'uppercase',
              }}
            >
              {ch ?? '_'}
            </motion.div>
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
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
      style={{
        background: '#060c14',
        border: `1px solid ${solved ? '#3d7349' : '#7a4848'}`,
        borderRadius: 12, overflow: 'hidden',
      }}
    >
      <div style={{ padding: '1rem 1.05rem 0.9rem' }}>
        <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.58rem', color: solved ? '#86c895' : '#c88080', marginBottom: 5 }}>
          {solved ? `Solved · +${gemsAwarded} ◆ Earned` : 'Out of Guesses'}
        </p>
        <p className="font-cinzel font-700" style={{ color: '#e8e4dc', fontSize: '1.4rem', lineHeight: 1.1, marginBottom: 4 }}>
          {answer.common_name}
        </p>
        {answer.scientific_name && (
          <p className="font-karla" style={{ fontStyle: 'italic', color: '#7a8aa0', fontSize: '0.72rem', marginBottom: '0.75rem' }}>
            {answer.scientific_name}
          </p>
        )}
        <p className="font-karla" style={{ color: '#d4d0c8', fontSize: '0.9rem', lineHeight: 1.6 }}>
          {answer.fun_fact}
        </p>
        {solved && gemsAwarded > 0 && (
          <div style={{
            marginTop: 12, padding: '0.55rem 0.8rem', borderRadius: 8,
            background: '#04080e', border: '1px solid #2a3548',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#7a8aa0' }}>
              Banked Payout
            </span>
            <span className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#d4a85a' }}>
              +{gemsAwarded} ◆
            </span>
          </div>
        )}
        {milestoneReward && (
          <div style={{
            marginTop: 6, padding: '0.5rem 0.8rem', borderRadius: 8,
            background: '#04080e', border: '1px solid #2a3548',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#7a8aa0' }}>
              {streak}-day streak
            </span>
            <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#d4a85a' }}>
              +{milestoneReward} ◆
            </span>
          </div>
        )}
        {!solved && (
          <p className="font-karla font-600" style={{ color: '#c88080', fontSize: '0.76rem', marginTop: 10 }}>
            Banked gems forfeited. Try again tomorrow.
          </p>
        )}
      </div>

      <div style={{ background: '#04080e', borderTop: '1px solid #2a3548' }}>
        {DETAIL_ROWS.map(({ key, label }) => {
          const val = answer[key]
          if (!val) return null
          return (
            <div key={key} className="flex gap-3" style={{ padding: '0.55rem 1.05rem', borderBottom: '1px solid #1a2434' }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em] shrink-0" style={{ fontSize: '0.58rem', color: '#7a8aa0', width: 78, paddingTop: 2 }}>
                {label}
              </p>
              <p className="font-karla" style={{ fontSize: '0.82rem', color: '#d4d0c8', lineHeight: 1.55 }}>
                {val}
              </p>
            </div>
          )
        })}
      </div>

      <p className="font-karla font-600" style={{ color: '#5a6478', fontSize: '0.66rem', padding: '0.7rem 1.05rem', textAlign: 'center' }}>
        New fish drops at midnight
      </p>
    </motion.div>
  )
}
