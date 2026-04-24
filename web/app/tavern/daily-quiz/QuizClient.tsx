'use client'

import { useState } from 'react'
import { submitQuizAnswer, type SubmitResult } from './actions'
import type { QuizData } from './generate'

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

  const revealed = result !== null

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
    setLoading(false)
  }

  function optionStyle(index: number): React.CSSProperties {
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
    <div className="px-6 max-w-xl mx-auto pb-24 sm:pb-12 pt-8">
      {/* Topic pill */}
      {quiz.topic && (
        <p className="sg-eyebrow mb-4" style={{ color: '#9a9488' }}>
          {quiz.topic.charAt(0).toUpperCase() + quiz.topic.slice(1)}
        </p>
      )}

      {/* Question */}
      <h1 className="font-cinzel font-700 text-[#f0ede8] mb-8" style={{ fontSize: '1.15rem', lineHeight: 1.45 }}>
        {quiz.question}
      </h1>

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
            {revealed && i === result!.correctIndex && (
              <svg className="ml-auto shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            )}
            {revealed && i === selected && !result!.correct && i !== result!.correctIndex && (
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

      {/* Loading state */}
      {loading && !revealed && (
        <p className="font-karla text-[#6a6764] text-center" style={{ fontSize: '0.78rem' }}>
          Checking answer…
        </p>
      )}
    </div>
  )
}
