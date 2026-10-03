// THE PARLOR'S QUESTION BANK FOR THE PORT (Kong, 2026-10-03: "long lasting").
//
// One bank, three sources, every question with a stable id (a hash of its
// words, so a captain's "seen" list survives a rebuild):
//   1. web/content/trivia.json: the web's weeks already written (boards and
//      ladders flattened; capstan phrases kept as phrases).
//   2. content/trivia_fresh.json: the fresh set written for the port and
//      fact-checked question by question (the trivia-bank-800 workflow).
//   3. Our own game: every fish's Log fact with its name veiled (the same veil
//      the treasure hunts use), which water it is fished from, and how rare it
//      is. These are "game" questions; the treasure hunts ask them too, so the
//      Parlor teaches what the hunts want.
//
//   node tools/build-trivia.mjs        (from godot/game)
//
// Writes content/trivia_bank.json: { questions: [...], phrases: [...] }.
// The bank carries the answers; it ships only in the game.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GAME = path.join(HERE, '..')
const WEB = path.join(GAME, '..', '..', 'web')

const id = (s) => crypto.createHash('sha1').update(s.trim().toLowerCase()).digest('hex').slice(0, 12)
const norm = (s) => s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ')

// A fixed shuffle (so a rebuild gives the same options in the same places).
function seeded(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 } }
function hashInt(str) { return parseInt(crypto.createHash('sha1').update(str).digest('hex').slice(0, 8), 16) }

const questions = []
const seen = new Set()
function add(q, source) {
  const key = norm(q.question)
  if (seen.has(key)) return
  if (!Array.isArray(q.options) || q.options.length !== 4) return
  if (new Set(q.options.map(o => o.trim().toLowerCase())).size !== 4) return
  seen.add(key)
  questions.push({ id: id(q.question), source, category: q.category, tier: q.tier, question: q.question, options: q.options, correct_index: q.correct_index, explanation: q.explanation ?? '' })
}

// 1. The web's.
const web = JSON.parse(fs.readFileSync(path.join(WEB, 'content', 'trivia.json'), 'utf8'))
for (const week of web.boards) for (const q of week) add(q, 'web')
for (const lad of web.ladders) for (const q of lad) add({ ...q, category: q.category ?? 'LORE', tier: q.tier ?? 2 }, 'web')
const phrases = []
const seenP = new Set()
for (const set of web.capstan) for (const p of set) if (!seenP.has(p.phrase)) { seenP.add(p.phrase); phrases.push({ id: id(p.phrase), phrase: p.phrase, category: p.category }) }

// 2. The fresh set.
const freshPath = path.join(GAME, 'content', 'trivia_fresh.json')
if (fs.existsSync(freshPath)) {
  const fresh = JSON.parse(fs.readFileSync(freshPath, 'utf8'))
  for (const q of fresh.questions ?? []) add(q, 'fresh')
  for (const p of fresh.phrases ?? []) {
    const ph = String(p.phrase).toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim()
    if (ph && !seenP.has(ph)) { seenP.add(ph); phrases.push({ id: id(ph), phrase: ph, category: p.category }) }
  }
}

// 3. Our own game.
const species = JSON.parse(fs.readFileSync(path.join(GAME, 'content', 'fish_species.json'), 'utf8'))
const WATERS = { shallows: 'The Shallows', open_waters: 'Open Waters', deep: 'The Deep', abyss: 'The Abyss', ancient_deep: 'The Ancient Deep' }
const RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']
const tierOf = (r) => (r <= 2 ? 1 : r === 3 ? 2 : 3)

// The veil: the fish's name out of its own fact (core/clues.gd veil()).
function veil(text, name) {
  const words = name.split(' ')
  const names = [name]
  if (words.length > 1 && words[words.length - 1].length > 3) names.push(words[words.length - 1])
  let out = text
  for (const n of names) {
    const e = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`\\b(the |a |an )?${e}(e?s)?\\b(?= (are|were|have|can|live|lie|grow|feed|hunt|spend))`, 'gi'), 'they')
    out = out.replace(new RegExp(`\\b(the |a |an )?${e}(e?s)?\\b`, 'gi'), 'this fish')
  }
  return out.split('. ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('. ')
}

function placeCorrect(correct, wrong, seedStr) {
  const r = seeded(hashInt(seedStr))
  const at = Math.floor(r() * 4)
  const opts = [...wrong.slice(0, 3)]
  opts.splice(at, 0, correct)
  return { options: opts, correct_index: at }
}

let made = 0
for (const f of species) {
  const fact = (f.fun_fact || f.description || '').trim()
  const rarity = Number(f.bite_rarity ?? 1)
  const water = WATERS[f.habitat]
  if (!water) continue
  // Which fish is this? (Three others from the same water, chosen per fish.)
  if (fact && fact.length > 30) {
    const said = veil(fact, f.name)
    if (!said.toLowerCase().includes(f.name.toLowerCase())) {
      const others = species.filter(o => o.habitat === f.habitat && o.id !== f.id)
        .sort((a, b) => hashInt(f.name + a.name) - hashInt(f.name + b.name))
        .map(o => o.name)
      if (others.length >= 3) {
        const { options, correct_index } = placeCorrect(f.name, others, 'who' + f.name)
        add({ category: 'FISH', tier: tierOf(rarity), question: `Which fish does your Log describe so: "${said}"`, options, correct_index, explanation: `That is the ${f.name}, from ${water}.` }, 'game')
        made++
      }
    }
  }
  // Where is it fished?
  const wrongW = Object.values(WATERS).filter(w => w !== water).sort((a, b) => hashInt(f.name + a) - hashInt(f.name + b))
  {
    const { options, correct_index } = placeCorrect(water, wrongW, 'where' + f.name)
    add({ category: 'CATCH', tier: tierOf(rarity), question: `Where do captains land the ${f.name}?`, options, correct_index, explanation: `The ${f.name} bites in ${water}.` }, 'game')
    made++
  }
  // How rare?
  {
    const right = RARITY[Math.max(0, Math.min(4, rarity - 1))]
    const wrongR = RARITY.filter(x => x !== right).sort((a, b) => hashInt(f.name + 'r' + a) - hashInt(f.name + 'r' + b))
    const { options, correct_index } = placeCorrect(right, wrongR, 'rare' + f.name)
    add({ category: 'CATCH', tier: Math.min(3, tierOf(rarity) + 1), question: `How rare a catch is the ${f.name}?`, options, correct_index, explanation: `The ${f.name} is ${right.toLowerCase()}.` }, 'game')
    made++
  }
}

const by = (s) => questions.filter(q => q.source === s).length
fs.writeFileSync(path.join(GAME, 'content', 'trivia_bank.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), questions, phrases }, null, 0))
console.log(`  trivia bank: ${questions.length} questions (web ${by('web')}, fresh ${by('fresh')}, game ${by('game')}), ${phrases.length} capstan phrases`)
