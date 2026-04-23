'use client'

import { useState, useEffect, useRef } from 'react'
import { payEntryFee, collectWinnings } from './actions'
import {
  type Card, type GS, type Personality,
  WIN_SCORE, ENTRY_FEE, OPPONENTS,
  buildDeck, cardVal, pileScore, maxCard, checkBust, sleep, aiDecide, applyPower,
} from './gameTypes'

// ── Card display ──────────────────────────────────────────────────────────────

const POWER_COLOR: Record<string, string> = {
  kraken: '#a78bfa', anglerfish: '#60a5fa', piranha: '#f87171',
  'whale-shark': '#34d399', hammerhead: '#fb923c', clownfish: '#f0c040',
  'manta-ray': '#c084fc', orca: '#67e8f9',
}
const POWER_LABEL: Record<string, string> = {
  kraken: 'FORCE', anglerfish: 'PEEK', piranha: 'STEAL',
  'whale-shark': 'GUARD', hammerhead: 'SMASH', clownfish: 'DBL',
  'manta-ray': 'CANCEL', orca: 'TWIN',
}

function CardChip({ card, bust }: { card: Card; bust?: boolean }) {
  const val = cardVal(card)
  const color = card.power && !card.powerCancelled ? POWER_COLOR[card.power] : '#f0ede8'
  return (
    <div style={{
      minWidth: 62, width: 62, height: 84,
      background: bust ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.05)',
      border: `1.5px solid ${bust ? '#f87171' : card.power && !card.powerCancelled ? color : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 3,
      padding: '6px 4px', flexShrink: 0,
      opacity: card.powerCancelled ? 0.4 : 1,
      boxShadow: card.power && !card.powerCancelled && !bust ? `0 0 10px ${color}28` : 'none',
    }}>
      {card.power && !card.powerCancelled && (
        <span style={{ fontSize: '0.45rem', letterSpacing: '0.08em', color, fontFamily: 'var(--font-karla)', fontWeight: 700 }}>
          {POWER_LABEL[card.power]}
        </span>
      )}
      {card.powerCancelled && (
        <span style={{ fontSize: '0.45rem', color: '#6a6764', fontFamily: 'var(--font-karla)' }}>CANCEL</span>
      )}
      <span style={{ fontSize: '0.52rem', color: card.powerCancelled ? '#6a6764' : color, fontFamily: 'var(--font-karla)', fontWeight: 600, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word' }}>
        {card.species}
      </span>
      <span style={{ fontSize: card.doubleValue ? '1rem' : '0.85rem', color: card.doubleValue ? '#f0c040' : color, fontFamily: 'var(--font-cinzel)', fontWeight: 700 }}>
        {val}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const INITIAL_GS: GS = {
  deck: [], drawPile: [], playerBank: [], aiBank: [],
  currentTurn: 'player', mustDraw: false,
  playerBankShielded: false, aiBankShielded: false,
  peekCard: null, orcaChoice: null, message: '',
}

export default function DeadMansDraw({ initialDoubloons, hasFreeGame: initialFreeGame }: { initialDoubloons: number; hasFreeGame: boolean }) {
  const [phase, setPhase] = useState<'select' | 'playing' | 'gameover'>('select')
  const [personality, setPersonality] = useState<Personality>('balanced')
  const [selectedOpponent, setSelectedOpponent] = useState<Personality | null>(null)
  const [gs, setGs] = useState<GS>(INITIAL_GS)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [freeGame, setFreeGame] = useState(initialFreeGame)
  const [winner, setWinner] = useState<'player' | 'ai' | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const gsRef = useRef<GS>(gs)
  gsRef.current = gs

  const aiRunning = useRef(false)

  // ── AI turn ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'playing' || gs.currentTurn !== 'ai') return
    if (aiRunning.current) return
    aiRunning.current = true

    async function runAiTurn() {
      await sleep(600)

      while (true) {
        const state = gsRef.current
        if (state.currentTurn !== 'ai' || phase !== 'playing') break

        // Draw a card
        let deck = [...state.deck]
        if (deck.length === 0) deck = buildDeck()

        const card = deck[0]
        const newDeck = deck.slice(1)

        if (checkBust(card, state.drawPile)) {
          setGs(prev => ({ ...prev, deck: newDeck, drawPile: [...prev.drawPile, card], message: `AI drew another ${card.species} — BUSTED!` }))
          await sleep(1400)
          setGs(prev => ({ ...prev, drawPile: [], mustDraw: false, currentTurn: 'player', message: 'AI busted. Your turn.' }))
          break
        }

        let newGs: GS = { ...state, deck: newDeck, drawPile: [...state.drawPile, card], peekCard: null }
        newGs = applyPower(card, newGs)

        // Handle Orca automatically
        if (newGs.orcaChoice) {
          const [c1, c2] = newGs.orcaChoice
          const bustEither = checkBust(c1, newGs.drawPile) || checkBust(c2, newGs.drawPile)
          const keep = !bustEither && cardVal(c1) + cardVal(c2) >= 4
          newGs = { ...newGs, drawPile: keep ? [...newGs.drawPile, c1, c2] : newGs.drawPile, orcaChoice: null,
            message: keep ? `AI keeps ${c1.species} + ${c2.species} from Orca.` : 'AI discards the Orca cards.' }
        }

        setGs(newGs)
        await sleep(800)

        const cur = gsRef.current
        if (cur.mustDraw) continue

        const decision = aiDecide(cur, personality)
        if (decision === 'bank') {
          const newAiBank = [...cur.aiBank, ...cur.drawPile]
          const newScore = pileScore(newAiBank)
          if (newScore >= WIN_SCORE) {
            setGs(prev => ({ ...prev, aiBank: newAiBank, drawPile: [], mustDraw: false }))
            setWinner('ai')
            setPhase('gameover')
          } else {
            setGs(prev => ({
              ...prev, aiBank: newAiBank, drawPile: [],
              mustDraw: false, currentTurn: 'player',
              message: `AI banked ${pileScore(cur.drawPile)}pt. Your turn.`,
            }))
          }
          break
        }
        // else continue drawing
      }

      aiRunning.current = false
    }

    runAiTurn()
  }, [gs.currentTurn, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Player actions ────────────────────────────────────────────────────────

  function drawCard() {
    const state = gsRef.current
    if (state.currentTurn !== 'ai' && !state.orcaChoice) {
      // clear peek if any
      if (state.peekCard) setGs(prev => ({ ...prev, peekCard: null }))
    }
    if (state.currentTurn !== 'player' || aiRunning.current) return
    if (state.orcaChoice) return

    let deck = [...state.deck]
    if (deck.length === 0) deck = buildDeck()
    const card = deck[0]
    const newDeck = deck.slice(1)

    if (checkBust(card, state.drawPile)) {
      setGs(prev => ({ ...prev, deck: newDeck, drawPile: [...prev.drawPile, card], message: `Bust! You drew another ${card.species}.`, peekCard: null }))
      setTimeout(() => {
        setGs(prev => ({ ...prev, drawPile: [], mustDraw: false, currentTurn: 'ai', message: "AI's turn..." }))
      }, 1400)
      return
    }

    let newGs: GS = { ...state, deck: newDeck, drawPile: [...state.drawPile, card], peekCard: null }
    newGs = applyPower(card, newGs)

    // Auto-dismiss Anglerfish peek after 2s
    if (newGs.peekCard) {
      setGs(newGs)
      setTimeout(() => setGs(prev => ({ ...prev, peekCard: null })), 2000)
      return
    }

    setGs(newGs)
  }

  function bank() {
    const state = gsRef.current
    if (state.mustDraw || state.currentTurn !== 'player' || state.drawPile.length === 0 || state.orcaChoice) return

    const newPlayerBank = [...state.playerBank, ...state.drawPile]
    const newScore = pileScore(newPlayerBank)

    if (newScore >= WIN_SCORE) {
      setGs(prev => ({ ...prev, playerBank: newPlayerBank, drawPile: [], mustDraw: false }))
      collectWinnings(personality).then(res => {
        if (!('error' in res)) setDoubloons(res.newDoubloons)
      })
      setWinner('player')
      setPhase('gameover')
      return
    }

    setGs(prev => ({
      ...prev, playerBank: newPlayerBank, drawPile: [],
      mustDraw: false, currentTurn: 'ai',
      message: `You banked ${pileScore(state.drawPile)}pt. AI's turn.`,
    }))
  }

  function orcaKeep() {
    const state = gsRef.current
    if (!state.orcaChoice) return
    const [c1, c2] = state.orcaChoice
    const newPile = [...state.drawPile, c1, c2]
    // Check bust for either card
    const bust1 = checkBust(c1, state.drawPile)
    const bust2 = !bust1 && checkBust(c2, [...state.drawPile, c1])
    if (bust1 || bust2) {
      const busted = bust1 ? c1 : c2
      setGs(prev => ({ ...prev, drawPile: newPile, orcaChoice: null, message: `Bust! ${busted.species} was already in the pile.` }))
      setTimeout(() => {
        setGs(prev => ({ ...prev, drawPile: [], mustDraw: false, currentTurn: 'ai', message: "AI's turn..." }))
      }, 1400)
      return
    }
    setGs(prev => ({ ...prev, drawPile: newPile, orcaChoice: null, message: `Kept ${c1.species} + ${c2.species}.` }))
  }

  function orcaDiscard() {
    setGs(prev => ({ ...prev, orcaChoice: null, message: 'Orca cards discarded.' }))
  }

  // ── Start game ────────────────────────────────────────────────────────────

  async function handleStart() {
    if (!selectedOpponent) return
    setStarting(true)
    setStartError(null)
    const result = await payEntryFee()
    if ('error' in result) {
      setStartError(result.error)
      setStarting(false)
      return
    }
    setDoubloons(result.newDoubloons)
    if ('wasFree' in result && result.wasFree) setFreeGame(false)
    setPersonality(selectedOpponent)
    setGs({ ...INITIAL_GS, deck: buildDeck(), message: 'Draw your first card.' })
    setWinner(null)
    setPhase('playing')
    setStarting(false)
  }

  function playAgain() {
    setSelectedOpponent(null)
    setPhase('select')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const playerScore = pileScore(gs.playerBank)
  const aiScore = pileScore(gs.aiBank)
  const drawPileScore = pileScore(gs.drawPile)
  const opp = OPPONENTS[personality]
  const canBank = gs.currentTurn === 'player' && !gs.mustDraw && gs.drawPile.length > 0 && !gs.orcaChoice && !aiRunning.current

  // Select screen
  if (phase === 'select') {
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="text-center">
          <p className="font-karla text-[#8a8880] text-xs mb-1">Balance</p>
          <p className="font-cinzel font-700 text-[#f0c040] text-xl">{doubloons.toLocaleString()} ⟡</p>
          {freeGame && (
            <p className="font-karla font-600 text-[#34d399] mt-1" style={{ fontSize: '0.75rem' }}>
              Free game available today
            </p>
          )}
        </div>

        {/* How to Play */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '1rem' }}>
          <p className="font-cinzel font-700 text-[#f0ede8] mb-3" style={{ fontSize: '0.85rem' }}>How to Play</p>
          <div className="flex flex-col gap-2.5">
            {[
              { label: 'Draw', text: 'Flip cards one at a time from the deck into your draw pile.' },
              { label: 'Bust', text: 'If you flip a card whose species is already in your draw pile, you BUST — losing every card you drew this turn.' },
              { label: 'Bank', text: `Hit Bank to permanently score your draw pile before you bust. First to ${WIN_SCORE} points wins.` },
              { label: 'Push it', text: 'The more you draw before banking, the more you score — but the higher the bust risk. Stop too early and the AI will outpace you.' },
            ].map(({ label, text }) => (
              <div key={label} className="flex gap-2.5">
                <span className="font-karla font-700 text-[#f0c040] shrink-0" style={{ fontSize: '0.72rem', paddingTop: 1 }}>{label}</span>
                <span className="font-karla text-[#8a8880]" style={{ fontSize: '0.75rem', lineHeight: 1.55 }}>{text}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '0.875rem', paddingTop: '0.875rem' }}>
            <p className="font-karla font-600 text-[#9a9488] mb-2" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Power Fish</p>
            <div className="flex flex-col gap-1.5">
              {[
                { name: 'Kraken', effect: 'Forces you to keep drawing — cannot bank until resolved.' },
                { name: 'Manta Ray', effect: 'Cancels the previous card\'s power (including Kraken).' },
                { name: 'Piranha', effect: 'Steals the highest-value card from the opponent\'s bank.' },
                { name: 'Hammerhead', effect: 'Destroys the highest-value card in the opponent\'s bank.' },
                { name: 'Whale Shark', effect: 'Shields your bank from the next Piranha or Hammerhead.' },
                { name: 'Clownfish', effect: 'Doubles the point value of the previous card in the draw pile.' },
                { name: 'Anglerfish', effect: 'Reveals the next card in the deck for 2 seconds.' },
                { name: 'Orca', effect: 'Draws 2 cards simultaneously — keep both or discard both.' },
              ].map(({ name, effect }) => (
                <div key={name} className="flex gap-2">
                  <span className="font-karla font-600 text-[#c8c4bc] shrink-0" style={{ fontSize: '0.7rem', minWidth: 90 }}>{name}</span>
                  <span className="font-karla text-[#6a6764]" style={{ fontSize: '0.7rem', lineHeight: 1.5 }}>{effect}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {(Object.entries(OPPONENTS) as [Personality, typeof OPPONENTS[Personality]][]).map(([key, op]) => (
            <button
              key={key}
              onClick={() => setSelectedOpponent(key)}
              style={{
                background: selectedOpponent === key ? 'rgba(240,192,64,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${selectedOpponent === key ? '#f0c040' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 14, padding: '1rem 1.25rem',
                textAlign: 'left', cursor: 'pointer', width: '100%',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#9a9488]" style={{ fontSize: '0.6rem' }}>{op.difficulty}</p>
                  <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginTop: 2 }}>{op.name}</p>
                  <p className="font-karla text-[#8a8880]" style={{ fontSize: '0.75rem', marginTop: 2 }}>{op.label} — {key === 'cautious' ? 'banks early' : key === 'balanced' ? 'plays the odds' : 'keeps drawing'}</p>
                </div>
                <div className="text-right">
                  <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.7rem' }}>Win</p>
                  <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '0.95rem' }}>{op.payout} ⟡</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {startError && <p className="font-karla text-[#f87171] text-sm text-center">{startError}</p>}

        <button
          onClick={handleStart}
          disabled={!selectedOpponent || starting || (!freeGame && doubloons < ENTRY_FEE)}
          className="btn-gold w-full disabled:opacity-30"
        >
          {starting ? 'Entering…' : freeGame ? 'Enter Free' : `Enter · ${ENTRY_FEE} ⟡`}
        </button>

        <p className="font-karla text-center text-[#6a6764]" style={{ fontSize: '0.7rem' }}>
          First to {WIN_SCORE} points wins. Push your luck — bank before you bust.
        </p>
      </div>
    )
  }

  // Gameover screen
  if (phase === 'gameover') {
    const won = winner === 'player'
    return (
      <div className="flex flex-col gap-5 w-full items-center text-center">
        <div style={{
          background: won ? 'rgba(240,192,64,0.07)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${won ? 'rgba(240,192,64,0.25)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 14, padding: '1.5rem', width: '100%',
        }}>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.3rem', marginBottom: '0.4rem' }}>
            {won ? 'Victory!' : 'Defeated.'}
          </p>
          <p className="font-karla text-[#8a8880]" style={{ fontSize: '0.8rem' }}>
            You: {playerScore}pt · {opp.name}: {aiScore}pt
          </p>
          {won ? (
            <p className="font-karla font-600 text-[#f0c040]" style={{ fontSize: '0.9rem', marginTop: '0.75rem' }}>
              +{opp.payout} ⟡ · Balance: {doubloons.toLocaleString()} ⟡
            </p>
          ) : (
            <p className="font-karla text-[#8a8880]" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
              −{ENTRY_FEE} ⟡ · Balance: {doubloons.toLocaleString()} ⟡
            </p>
          )}
        </div>
        <button onClick={playAgain} className="btn-gold w-full">Play Again</button>
      </div>
    )
  }

  // Playing screen
  return (
    <div className="flex flex-col gap-4 w-full">

      {/* Scores */}
      <div className="flex gap-3">
        {[
          { label: 'You', score: playerScore, shielded: gs.playerBankShielded },
          { label: opp.name, score: aiScore, shielded: gs.aiBankShielded },
        ].map(({ label, score, shielded }) => (
          <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <p className="font-karla font-600 uppercase tracking-[0.10em] text-[#9a9488]" style={{ fontSize: '0.55rem' }}>
              {label}{shielded ? ' · SHIELDED' : ''}
            </p>
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.2rem', lineHeight: 1 }}>
              {score}<span className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.7rem' }}> / {WIN_SCORE}</span>
            </p>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(score / WIN_SCORE * 100, 100)}%`, background: '#f0c040', borderRadius: 99, transition: 'width 0.4s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Message */}
      {gs.message ? (
        <p className="font-karla text-[#c8c4bc] text-center" style={{ fontSize: '0.8rem', minHeight: '1.2rem' }}>{gs.message}</p>
      ) : <div style={{ minHeight: '1.2rem' }} />}

      {/* Draw pile */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="font-karla font-600 uppercase tracking-[0.10em] text-[#9a9488]" style={{ fontSize: '0.58rem' }}>
            Draw Pile
          </p>
          {gs.drawPile.length > 0 && (
            <p className="font-karla text-[#8a8880]" style={{ fontSize: '0.7rem' }}>
              {drawPileScore}pt potential
            </p>
          )}
        </div>
        <div
          style={{
            display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6,
            minHeight: 92,
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '0.5rem',
          }}
        >
          {gs.drawPile.length === 0 ? (
            <p className="font-karla text-[#4a4845] m-auto" style={{ fontSize: '0.75rem' }}>No cards drawn yet</p>
          ) : (
            gs.drawPile.map(card => <CardChip key={card.id} card={card} />)
          )}
        </div>
      </div>

      {/* Orca choice */}
      {gs.orcaChoice && gs.currentTurn === 'player' && (
        <div style={{ background: 'rgba(103,232,249,0.06)', border: '1px solid rgba(103,232,249,0.2)', borderRadius: 12, padding: '0.875rem' }}>
          <p className="font-karla font-600 text-center text-[#67e8f9]" style={{ fontSize: '0.75rem', marginBottom: '0.6rem' }}>Orca — keep both or discard both?</p>
          <div className="flex gap-3 justify-center mb-3">
            {gs.orcaChoice.map(card => <CardChip key={card.id} card={card} />)}
          </div>
          <div className="flex gap-2">
            <button onClick={orcaKeep} className="btn-gold flex-1" style={{ fontSize: '0.8rem', padding: '0.5rem' }}>Keep Both</button>
            <button onClick={orcaDiscard} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#8a8880', fontFamily: 'var(--font-karla)', fontWeight: 600, fontSize: '0.8rem', padding: '0.5rem', cursor: 'pointer' }}>Discard Both</button>
          </div>
        </div>
      )}

      {/* Peek reveal */}
      {gs.peekCard && gs.currentTurn === 'player' && (
        <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
          <p className="font-karla text-[#60a5fa]" style={{ fontSize: '0.72rem', marginBottom: '0.4rem' }}>Anglerfish peek — next card:</p>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.9rem' }}>{gs.peekCard.species} · {gs.peekCard.value}pt</p>
        </div>
      )}

      {/* Deck + actions */}
      <div className="flex gap-3 items-center">
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '0.5rem 0.875rem', textAlign: 'center' }}>
          <p className="font-karla font-600 uppercase tracking-[0.08em] text-[#6a6764]" style={{ fontSize: '0.5rem' }}>Deck</p>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{gs.deck.length}</p>
        </div>
        <button
          onClick={drawCard}
          disabled={gs.currentTurn !== 'player' || !!gs.orcaChoice || aiRunning.current}
          className="btn-gold flex-1 disabled:opacity-30"
        >
          {gs.currentTurn === 'ai' ? 'AI thinking…' : gs.mustDraw ? 'Draw (forced)' : 'Draw'}
        </button>
        <button
          onClick={bank}
          disabled={!canBank}
          style={{
            flex: 1, padding: '0.75rem', borderRadius: 10,
            background: canBank ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${canBank ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}`,
            color: canBank ? '#f0ede8' : '#3a3835',
            fontFamily: 'var(--font-karla)', fontWeight: 700,
            fontSize: '0.875rem', cursor: canBank ? 'pointer' : 'not-allowed',
          }}
        >
          Bank
        </button>
      </div>

      {gs.mustDraw && gs.currentTurn === 'player' && (
        <p className="font-karla text-center" style={{ color: '#a78bfa', fontSize: '0.72rem' }}>
          Kraken active — you cannot bank this turn.
        </p>
      )}

      <p className="font-karla text-center text-[#6a6764]" style={{ fontSize: '0.68rem' }}>
        First to {WIN_SCORE}pt wins · bust = lose all cards drawn this turn
      </p>
    </div>
  )
}
