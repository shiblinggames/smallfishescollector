'use client'

import { useState, useEffect, useRef } from 'react'
import { submitQuizAnswer, type SubmitResult } from './actions'
import type { QuizData } from './generate'
import { refreshTavernBadge } from '@/lib/tavernBadge'

function RewardToast({ reward, onDone }: { reward: number; onDone: () => void }) {
  const [visible, setVisible] = useState(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 50)
    const hide = setTimeout(() => setVisible(false), 2800)
    const exit = setTimeout(() => onDoneRef.current(), 3300)
    return () => { clearTimeout(show); clearTimeout(hide); clearTimeout(exit) }
  }, [])

  return (
    <div style={{
      position: 'fixed',
      bottom: '7rem',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        padding: '0.7rem 1rem',
        background: 'rgba(20,18,16,0.96)',
        border: '1px solid rgba(240,192,64,0.35)',
        borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
      }}>
        <div style={{
          width: 32, height: 32, flexShrink: 0,
          background: 'rgba(240,192,64,0.1)',
          border: '1px solid rgba(240,192,64,0.25)',
          borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#f0c040',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v1.5M12 15.5V17M9.5 9.5C9.5 8.4 10.6 8 12 8s2.5.6 2.5 1.8c0 2.4-5 2-5 4.4C9.5 15.4 10.6 16 12 16s2.5-.5 2.5-1.7"/>
          </svg>
        </div>
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#f0c040', marginBottom: 1 }}>
            Reward Earned
          </p>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.88rem' }}>
            +{reward} ⟡
          </p>
        </div>
      </div>
    </div>
  )
}

interface Props {
  quiz: QuizData
  previousAnswer: { correct: boolean; chosen_index: number; reward: number } | null
}

export default function QuizClient({ quiz, previousAnswer }: Props) {
  const [selected, setSelected] = useState<number | null>(previousAnswer?.chosen_index ?? null)
  const [result, setResult] = useState<SubmitResult | null>(
    previousAnswer
      ? {
          correct: previousAnswer.correct,
          correctIndex: quiz.correct_index,
          explanation: quiz.explanation,
          reward: previousAnswer.reward,
          newDoubloons: 0,
        }
      : null
  )
  const [loading, setLoading] = useState(false)
  const [showRewardToast, setShowRewardToast] = useState(false)
  const [timeLeft, setTimeLeft] = useState(previousAnswer ? 0 : 20)
  const [timedOut, setTimedOut] = useState(false)

  const revealed = result !== null || timedOut

  useEffect(() => {
    if (previousAnswer || timedOut || result) return
    if (timeLeft <= 0) {
      setTimedOut(true)
      return
    }
    const t = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(t)
  }, [timeLeft, previousAnswer, timedOut, result])

  async function handleSelect(index: number) {
    if (revealed || loading) return
    setSelected(index)
    setLoading(true)
    const res = await submitQuizAnswer(index)
    if ('error' in res) {
      setLoading(false)
      return
    }
    setResult(res)
    if (res.correct && res.reward > 0) setShowRewardToast(true)
    refreshTavernBadge()
    setLoading(false)
  }

  function optionStyle(index: number): React.CSSProperties {
    if (timedOut) {
      if (index === quiz.correct_index) {
        return { background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'default' }
      }
      return { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#4a4845', cursor: 'default' }
    }
    if (!revealed) {
      return {
        background: selected === index ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${selected === index ? 'rgba(240,192,64,0.35)' : 'rgba(255,255,255,0.15)'}`,
        color: selected === index ? '#f0ede8' : '#a0a09a',
        cursor: loading ? 'default' : 'pointer',
        opacity: loading && selected !== index ? 0.5 : 1,
      }
    }
    if (index === result!.correctIndex) {
      return {
        background: 'rgba(74,222,128,0.08)',
        border: '1px solid rgba(74,222,128,0.3)',
        color: '#4ade80',
        cursor: 'default',
      }
    }
    if (index === selected && !result!.correct) {
      return {
        background: 'rgba(248,113,113,0.08)',
        border: '1px solid rgba(248,113,113,0.25)',
        color: '#f87171',
        cursor: 'default',
      }
    }
    return {
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.09)',
      color: '#4a4845',
      cursor: 'default',
    }
  }

  const LETTERS = ['A', 'B', 'C', 'D']

  return (
    <>
    {showRewardToast && (
      <RewardToast reward={result!.reward} onDone={() => setShowRewardToast(false)} />
    )}
    <div className="px-6 max-w-xl mx-auto pb-24 sm:pb-12 pt-8">
      {/* Topic pill */}
      {quiz.topic && (
        <p className="sg-eyebrow mb-4" style={{ color: '#9a9488' }}>
          {quiz.topic.charAt(0).toUpperCase() + quiz.topic.slice(1)}
        </p>
      )}

      {/* Question */}
      <h1 className="font-cinzel font-700 text-[#f0ede8] mb-5" style={{ fontSize: '1.15rem', lineHeight: 1.45 }}>
        {quiz.question}
      </h1>

      {/* Timer bar */}
      {!previousAnswer && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: timeLeft <= 5 ? '#f87171' : '#6a6764' }}>
              {timedOut ? 'Time\'s up' : `${timeLeft}s`}
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: 2,
              width: `${(timeLeft / 20) * 100}%`,
              background: timeLeft <= 5 ? '#f87171' : timeLeft <= 10 ? '#f0c040' : '#4ade80',
              transition: 'width 1s linear, background 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Options */}
      <div className="flex flex-col gap-3 mb-8">
        {quiz.options.map((option, i) => (
          <button
            key={i}
            onClick={() => handleSelect(i)}
            disabled={revealed || loading}
            className="flex items-center gap-4 w-full text-left rounded-xl px-4 py-3.5 transition-all"
            style={optionStyle(i)}
          >
            <span
              className="font-cinzel font-700 shrink-0"
              style={{ fontSize: '0.7rem', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'rgba(255,255,255,0.11)' }}
            >
              {LETTERS[i]}
            </span>
            <span className="font-karla font-500" style={{ fontSize: '0.88rem', lineHeight: 1.4 }}>
              {option}
            </span>
            {revealed && (timedOut ? i === quiz.correct_index : i === result!.correctIndex) && (
              <svg className="ml-auto shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            )}
            {revealed && !timedOut && i === selected && !result!.correct && i !== result!.correctIndex && (
              <svg className="ml-auto shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Result */}
      {revealed && (
        <div
          className="rounded-xl px-5 py-4"
          style={{
            background: result!.correct ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${result!.correct ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.15)'}`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            {result!.correct ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                <p className="font-karla font-700 uppercase tracking-[0.12em] text-[#4ade80]" style={{ fontSize: '0.6rem' }}>
                  Correct{result!.reward > 0 && !previousAnswer ? ` · +${result!.reward} ⟡` : ''}
                </p>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
                <p className="font-karla font-700 uppercase tracking-[0.12em] text-[#f87171]" style={{ fontSize: '0.6rem' }}>
                  Not quite
                </p>
              </>
            )}
          </div>
          <p className="font-karla text-[#a0a09a]" style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
            {quiz.explanation}
          </p>
        </div>
      )}

      {/* Timed out */}
      {timedOut && (
        <div className="rounded-xl px-5 py-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <div className="flex items-center gap-2 mb-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            <p className="font-karla font-700 uppercase tracking-[0.12em] text-[#f87171]" style={{ fontSize: '0.6rem' }}>
              Time&apos;s up · No reward
            </p>
          </div>
          <p className="font-karla text-[#a0a09a]" style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
            {quiz.explanation}
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && !revealed && (
        <p className="font-karla text-[#6a6764] text-center" style={{ fontSize: '0.78rem' }}>
          Checking answer…
        </p>
      )}
    </div>
    </>
  )
}
