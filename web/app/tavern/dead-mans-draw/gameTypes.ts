export type Power =
  | 'kraken' | 'anglerfish' | 'piranha' | 'whale-shark'
  | 'hammerhead' | 'clownfish' | 'manta-ray' | 'orca'

export type Personality = 'cautious' | 'balanced' | 'greedy'

export interface Card {
  id: string
  species: string
  value: number
  power: Power | null
  doubleValue?: boolean
  powerCancelled?: boolean
}

export interface GS {
  deck: Card[]
  drawPile: Card[]
  playerBank: Card[]
  aiBank: Card[]
  currentTurn: 'player' | 'ai'
  mustDraw: boolean
  playerBankShielded: boolean
  aiBankShielded: boolean
  peekCard: Card | null
  orcaChoice: [Card, Card] | null
  message: string
}

export const WIN_SCORE = 15
export const ENTRY_FEE = 20

export const OPPONENTS: Record<Personality, { name: string; label: string; difficulty: string; payout: number }> = {
  cautious: { name: 'Goldfish',   label: 'Cautious', difficulty: 'Easy',   payout: 35 },
  balanced: { name: 'Anglerfish', label: 'Balanced', difficulty: 'Medium', payout: 40 },
  greedy:   { name: 'Kraken',     label: 'Greedy',   difficulty: 'Hard',   payout: 50 },
}

const POWER_DEFS: { species: string; value: number; power: Power }[] = [
  { species: 'Kraken',           value: 3, power: 'kraken' },
  { species: 'Anglerfish',       value: 2, power: 'anglerfish' },
  { species: 'Piranha',          value: 3, power: 'piranha' },
  { species: 'Whale Shark',      value: 4, power: 'whale-shark' },
  { species: 'Hammerhead Shark', value: 3, power: 'hammerhead' },
  { species: 'Clownfish',        value: 2, power: 'clownfish' },
  { species: 'Manta Ray',        value: 3, power: 'manta-ray' },
  { species: 'Orca',             value: 2, power: 'orca' },
]

const VANILLA_DEFS: { species: string; value: number }[] = [
  { species: 'Bass',              value: 1 }, { species: 'Eel',             value: 1 },
  { species: 'Flounder',          value: 1 }, { species: 'Goldfish',         value: 1 },
  { species: 'Krill',             value: 1 }, { species: 'Minnow',           value: 1 },
  { species: 'Pufferfish',        value: 2 }, { species: 'Salmon',           value: 2 },
  { species: 'Sardine',           value: 2 }, { species: 'Tuna',             value: 2 },
  { species: 'Beluga Whale',      value: 3 }, { species: 'Blobfish',         value: 3 },
  { species: 'Blue Marlin',       value: 3 }, { species: 'Goblin Shark',     value: 3 },
  { species: 'Koi',               value: 3 }, { species: 'Lionfish',         value: 3 },
  { species: 'Nurse Shark',       value: 3 }, { species: 'Oarfish',          value: 3 },
  { species: 'Sailfish',          value: 3 }, { species: 'Swordfish',        value: 3 },
  { species: 'Tiger Shark',       value: 4 }, { species: 'Blue Whale',       value: 4 },
  { species: 'Catfish',           value: 4 }, { species: 'Giant Squid',      value: 4 },
  { species: 'Great White Shark', value: 5 }, { species: 'Humpback Whale',   value: 5 },
]

export function buildDeck(): Card[] {
  const cards: Card[] = []
  let n = 0
  for (const d of POWER_DEFS) {
    for (let i = 0; i < 4; i++) {
      cards.push({ id: `${d.species}-${i}-${n++}`, species: d.species, value: d.value, power: d.power })
    }
  }
  for (const d of VANILLA_DEFS) {
    cards.push({ id: `${d.species}-${n++}`, species: d.species, value: d.value, power: null })
  }
  return shuffle(cards)
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const cardVal = (c: Card) => (c.doubleValue ? c.value * 2 : c.value)
export const pileScore = (cards: Card[]) => cards.reduce((s, c) => s + cardVal(c), 0)
export const maxCard = (cards: Card[]): Card => cards.reduce((m, c) => cardVal(c) > cardVal(m) ? c : m, cards[0])
export const checkBust = (card: Card, pile: Card[]) => pile.some(c => c.species === card.species)
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export function aiDecide(state: GS, personality: Personality): 'draw' | 'bank' {
  if (state.drawPile.length === 0) return 'draw'
  const speciesInPile = new Set(state.drawPile.map(c => c.species))
  const bustCards = state.deck.filter(c => speciesInPile.has(c.species)).length
  const bustChance = state.deck.length > 0 ? bustCards / state.deck.length : 0
  const drawValue = pileScore(state.drawPile)
  if (personality === 'cautious') return state.drawPile.length >= 2 || drawValue >= 3 ? 'bank' : 'draw'
  if (personality === 'balanced') return bustChance > 0.35 || drawValue >= 6 ? 'bank' : 'draw'
  return bustChance > 0.60 || drawValue >= 10 ? 'bank' : 'draw'
}

export function applyPower(card: Card, state: GS): GS {
  if (!card.power || card.powerCancelled) return state
  const isPlayer = state.currentTurn === 'player'

  switch (card.power) {
    case 'kraken':
      return { ...state, mustDraw: true, message: 'Kraken! Must keep drawing.' }

    case 'anglerfish': {
      const peek = state.deck[0] ?? null
      return { ...state, peekCard: peek, message: peek ? `Anglerfish peeks: next card is ${peek.species} (${peek.value}pt)` : 'Anglerfish peeks — deck is empty.' }
    }

    case 'piranha': {
      const targetBank = isPlayer ? state.aiBank : state.playerBank
      const shielded = isPlayer ? state.aiBankShielded : state.playerBankShielded
      if (targetBank.length === 0) return { ...state, message: 'Piranha — nothing to steal!' }
      if (shielded) {
        return {
          ...state,
          aiBankShielded: isPlayer ? false : state.aiBankShielded,
          playerBankShielded: !isPlayer ? false : state.playerBankShielded,
          message: 'Piranha! The bank is shielded by Whale Shark.',
        }
      }
      const target = maxCard(targetBank)
      if (isPlayer) {
        const newAiBank = state.aiBank.filter(c => c.id !== target.id)
        const newPlayerBank = [...state.playerBank, target]
        return { ...state, aiBank: newAiBank, playerBank: newPlayerBank, message: `Piranha steals ${target.species} (${cardVal(target)}pt) from the AI!` }
      } else {
        const newPlayerBank = state.playerBank.filter(c => c.id !== target.id)
        const newAiBank = [...state.aiBank, target]
        return { ...state, playerBank: newPlayerBank, aiBank: newAiBank, message: `Piranha steals your ${target.species} (${cardVal(target)}pt)!` }
      }
    }

    case 'whale-shark':
      return {
        ...state,
        playerBankShielded: isPlayer ? true : state.playerBankShielded,
        aiBankShielded: !isPlayer ? true : state.aiBankShielded,
        message: isPlayer ? 'Whale Shark shields your bank!' : 'Whale Shark shields the AI bank.',
      }

    case 'hammerhead': {
      const targetBank = isPlayer ? state.aiBank : state.playerBank
      const shielded = isPlayer ? state.aiBankShielded : state.playerBankShielded
      if (targetBank.length === 0) return { ...state, message: 'Hammerhead — nothing to destroy!' }
      if (shielded) {
        return {
          ...state,
          aiBankShielded: isPlayer ? false : state.aiBankShielded,
          playerBankShielded: !isPlayer ? false : state.playerBankShielded,
          message: 'Hammerhead! The bank is shielded.',
        }
      }
      const target = maxCard(targetBank)
      if (isPlayer) {
        const newAiBank = state.aiBank.filter(c => c.id !== target.id)
        return { ...state, aiBank: newAiBank, message: `Hammerhead destroys AI's ${target.species} (${cardVal(target)}pt)!` }
      } else {
        const newPlayerBank = state.playerBank.filter(c => c.id !== target.id)
        return { ...state, playerBank: newPlayerBank, message: `Hammerhead destroys your ${target.species} (${cardVal(target)}pt)!` }
      }
    }

    case 'clownfish': {
      if (state.drawPile.length < 2) return { ...state, message: 'Clownfish — no previous card to double!' }
      const prev = state.drawPile[state.drawPile.length - 2]
      const newPile = state.drawPile.map((c, i) => i === state.drawPile.length - 2 ? { ...c, doubleValue: true } : c)
      return { ...state, drawPile: newPile, message: `Clownfish doubles ${prev.species}'s value!` }
    }

    case 'manta-ray': {
      const newPile = state.drawPile.map((c, i) =>
        i === state.drawPile.length - 2 ? { ...c, powerCancelled: true, doubleValue: false } : c
      )
      return { ...state, drawPile: newPile, mustDraw: false, message: "Manta Ray cancels the previous card's power." }
    }

    case 'orca': {
      if (state.deck.length < 2) return { ...state, message: 'Orca — not enough cards in deck.' }
      const [c1, c2] = [state.deck[0], state.deck[1]]
      return { ...state, deck: state.deck.slice(2), orcaChoice: [c1, c2], message: 'Orca! Keep both cards or discard both?' }
    }
  }
  return state
}
