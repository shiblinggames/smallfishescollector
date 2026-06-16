'use client'

// A Throw of the Bones — the d20 skill-check node. The player picks ONE approach,
// then a d20 tumbles and decelerates onto the server's roll (the result is
// authoritative, the animation just plays toward it). Total = roll + a small Nav
// bonus vs the option's DC. The DC sits on the die track the whole time so the
// suspense is "will it clear the line." Win/miss flavor + reward count-up after.
//
// Odds shown per option are computed live from the player's Nav bonus so the bet
// is informed. The bold option locks if the player can't cover its at-risk coin.

import { useEffect, useRef, useState } from 'react'
import type { RaidDice, RaidDiceOption } from '@/lib/raidMap'
import { rollDiceNode } from './raidMapActions'

const GOLD = '#e8c879'
const GREEN = '#4ade80'
const RED = '#f87171'

function vibrate(p: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(p)
}

// P(d20 + bonus >= dc): the count of faces 1..20 that clear the line, /20.
function successPct(dc: number, bonus: number): number {
  const need = dc - bonus // raw face needed
  const winningFaces = Math.max(0, Math.min(20, 20 - need + 1))
  return Math.round((winningFaces / 20) * 100)
}

function oddsLabel(pct: number): string {
  if (pct >= 75) return 'Likely'
  if (pct >= 55) return 'Even'
  if (pct >= 35) return 'Long shot'
  return 'Desperate'
}

type RollResult = Awaited<ReturnType<typeof rollDiceNode>>

export default function DiceRollNode({
  nodeId, dice, doubloons, navLevel, onResolved,
}: {
  nodeId: string
  dice: RaidDice
  doubloons: number
  navLevel: number
  /** Called once the player has seen the result and taps to continue. */
  onResolved: () => void
}) {
  const bonus = Math.min(dice.maxBonus, Math.floor(navLevel / dice.bonusPerLevels))
  const [phase, setPhase] = useState<'pick' | 'rolling' | 'result'>('pick')
  const [picked, setPicked] = useState<RaidDiceOption | null>(null)
  const [result, setResult] = useState<Extract<RollResult, { roll: number }> | null>(null)
  const [face, setFace] = useState(1)
  const [err, setErr] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current) }, [])

  async function choose(opt: RaidDiceOption) {
    if (phase !== 'pick') return
    vibrate(12)
    setPicked(opt)
    setPhase('rolling')
    setErr(null)

    // Spin the face while the server settles the real roll.
    tickRef.current = setInterval(() => setFace(1 + Math.floor(Math.random() * 20)), 70)

    const res = await rollDiceNode(nodeId, opt.id)
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }

    if ('error' in res) {
      setErr(res.error)
      setPhase('pick'); setPicked(null)
      return
    }

    // Decelerating ratchet onto the authoritative face, then hold + verdict.
    const finalFace = res.roll
    const steps = [60, 75, 95, 120, 155, 200, 260, 340]
    let idx = 0
    const ratchet = () => {
      if (idx >= steps.length) {
        setFace(finalFace)
        vibrate(res.success ? [0, 40, 60, 40] : [0, 120])
        if (res.doubloonsDelta !== 0) window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
        setResult(res)
        setPhase('result')
        return
      }
      // As it slows, bias the shown face toward the final one.
      setFace(idx >= steps.length - 2 ? finalFace : 1 + Math.floor(Math.random() * 20))
      const d = steps[idx++]
      setTimeout(ratchet, d)
    }
    ratchet()
  }

  // ── Result view ──────────────────────────────────────────────────────────
  if (phase === 'result' && result && picked) {
    const win = result.success
    const accent = win ? GREEN : RED
    return (
      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <DieFace value={result.roll} bonus={result.bonus} dc={result.dc} accent={accent} settled />
        <p className="font-cinzel font-700 uppercase tracking-[0.14em]" style={{ marginTop: '0.9rem', fontSize: '0.92rem', color: accent }}>
          {win ? 'The bones favour you' : 'The bones turn cold'}
        </p>
        <p className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.55, color: 'rgba(240,237,232,0.82)', marginTop: '0.45rem' }}>
          {win ? picked.winText : picked.missText}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '0.9rem', flexWrap: 'wrap' }}>
          {result.doubloonsDelta !== 0 && (
            <RewardChip
              text={`${result.doubloonsDelta > 0 ? '+' : ''}${result.doubloonsDelta.toLocaleString()} ⟡`}
              color={result.doubloonsDelta > 0 ? GOLD : RED}
            />
          )}
          {result.navXpDelta > 0 && <RewardChip text={`+${result.navXpDelta.toLocaleString()} Nav XP`} color={GOLD} />}
          {result.doubloonsDelta === 0 && result.navXpDelta === 0 && <RewardChip text="Nothing this time" color="#8a8880" />}
        </div>
        <button
          onClick={onResolved}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', marginTop: '1.1rem', padding: '0.8rem', borderRadius: 12, fontSize: '0.98rem', background: `${GOLD}26`, border: `1px solid ${GOLD}66`, color: GOLD, cursor: 'pointer' }}
        >
          Sail On →
        </button>
      </div>
    )
  }

  // ── Rolling view ───────────────────────────────────────────────────────────
  if (phase === 'rolling' && picked) {
    return (
      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <DieFace value={face} bonus={bonus} dc={picked.dc} accent={GOLD} />
        <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ marginTop: '0.9rem', fontSize: '0.64rem', color: '#8a8880' }}>
          {picked.label} · beat {picked.dc}
        </p>
      </div>
    )
  }

  // ── Pick view ───────────────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: '1rem' }}>
      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>
        Pick your play · d20 + {bonus} to your throw
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dice.options.map(opt => {
          const pct = successPct(opt.dc, bonus)
          const locked = !!opt.requiresDoubloons && doubloons < opt.requiresDoubloons
          return (
            <button
              key={opt.id}
              onClick={() => !locked && choose(opt)}
              disabled={locked}
              style={{
                textAlign: 'left', padding: '0.7rem 0.8rem', borderRadius: 12,
                background: locked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${locked ? 'rgba(255,255,255,0.08)' : `${GOLD}3a`}`,
                cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0ede8' }}>{opt.label}</span>
                <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.58rem', color: locked ? '#8a8880' : GOLD, flexShrink: 0 }}>
                  {locked ? `Need ${opt.requiresDoubloons?.toLocaleString()} ⟡` : `Beat ${opt.dc} · ${oddsLabel(pct)} (${pct}%)`}
                </span>
              </div>
              <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.6)', marginTop: 3, lineHeight: 1.4 }}>
                {opt.description}
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.64rem', color: '#9a9690', marginTop: 5 }}>
                {grantLine('Win', opt.win)} · {grantLine('Miss', opt.miss)}
              </p>
            </button>
          )
        })}
      </div>
      {err && <p className="font-karla" style={{ fontSize: '0.7rem', color: RED, marginTop: '0.6rem', textAlign: 'center' }}>{err}</p>}
    </div>
  )
}

function grantLine(prefix: string, g: { doubloons?: number; navXp?: number }): string {
  const parts: string[] = []
  if (g.doubloons) parts.push(`${g.doubloons > 0 ? '+' : ''}${g.doubloons.toLocaleString()} ⟡`)
  if (g.navXp) parts.push(`+${g.navXp.toLocaleString()} Nav XP`)
  return `${prefix} ${parts.length ? parts.join(', ') : 'nothing'}`
}

function RewardChip({ text, color }: { text: string; color: string }) {
  return (
    <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{
      fontSize: '0.7rem', color, background: `${color}1f`, border: `1px solid ${color}44`,
      borderRadius: 999, padding: '0.32rem 0.72rem',
    }}>
      {text}
    </span>
  )
}

// The d20: a hexagon-ish die face showing the rolled number, the +bonus, and the
// DC marked beside it so the player watches it close on the line.
function DieFace({ value, bonus, dc, accent, settled }: { value: number; bonus: number; dc: number; accent: string; settled?: boolean }) {
  const total = value + bonus
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center',
        clipPath: 'polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)',
        background: `radial-gradient(circle at 50% 35%, ${accent}33, rgba(12,18,28,0.95) 72%)`,
        border: `2px solid ${accent}`,
        boxShadow: settled ? `0 0 26px ${accent}55` : `0 0 16px ${accent}33`,
        transition: 'box-shadow 0.2s',
      }}>
        <span className="font-cinzel font-800" style={{ fontSize: '2.3rem', color: '#f4ecd8', lineHeight: 1, textShadow: `0 0 14px ${accent}88` }}>
          {value}
        </span>
      </div>
      <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#a89e86', fontVariantNumeric: 'tabular-nums' }}>
        {value} {bonus > 0 ? `+ ${bonus}` : ''} = <span style={{ color: accent }}>{total}</span> · vs {dc}
      </p>
    </div>
  )
}
