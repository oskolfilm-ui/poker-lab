import phe from 'phe'
import { createDeck, RANKS, type Card } from '../cards'

export const DECK = createDeck()
export const CODES = new Map(DECK.map(card => [card, phe.cardCode(card[0], card[1])]))
export const fastRank = (cards: readonly Card[]) => phe.evaluateCardCodes(cards.map(card => CODES.get(card)!))
export const rankCode = (codes: number[]) => phe.evaluateCardCodes(codes)
export const rank = (card: Card) => RANKS.indexOf(card[0]) + 2
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const STRAIGHTS = Array.from({ length: 10 }, (_, i) => 31 << (i + 1))
const rankMask = (cards: readonly Card[]) => cards.reduce((mask, card) => mask | (1 << rank(card)) | (card[0] === 'A' ? 2 : 0), 0)
export function handClass(hole: readonly Card[]) {
  const [a, b] = [...hole].sort((x, y) => rank(y) - rank(x))
  return a[0] + b[0] + (a[0] === b[0] ? '' : a[1] === b[1] ? 's' : 'o')
}
// Transparent HU chart ordering, not a solved equilibrium range. Combination
// weights (6/4/12) give percentiles over 1,326 actual starting combinations.
function chartScore(a: number, b: number, suited: boolean) {
  if (a === b) return 45 + a * 4.5
  return a * 3 + b * 1.5 + (suited ? 7 : 0) + (a === 14 ? 4 : 0) + (a === 14 && b <= 5 && suited ? 6 : 0)
    - Math.max(0, a - b - 1) * 2 + (a - b === 1 ? 4 : 0)
}
const classes: { key: string; score: number; combos: number }[] = []
for (let a = 2; a <= 14; a++) for (let b = 2; b <= a; b++) {
  const base = RANKS[a - 2] + RANKS[b - 2]
  for (const suited of a === b ? [false] : [true, false]) classes.push({ key: base + (a === b ? '' : suited ? 's' : 'o'), score: chartScore(a, b, suited), combos: a === b ? 6 : suited ? 4 : 12 })
}
classes.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
let preceding = 0
const percentiles = new Map(classes.map(entry => { const strength = 1 - (preceding + entry.combos / 2) / 1326; preceding += entry.combos; return [entry.key, strength] }))
export function startingStrength(hole: readonly Card[]) { return percentiles.get(handClass(hole))! }
export function texture(board: readonly Card[]) {
  const ranks = board.map(rank), suitCounts = ['s', 'h', 'd', 'c'].map(suit => board.filter(card => card[1] === suit).length)
  const maxSuit = Math.max(0, ...suitCounts)
  let connected = 0
  for (let low = 1; low <= 10; low++) connected = Math.max(connected, new Set(ranks.map(r => r === 14 && low === 1 ? 1 : r).filter(r => r >= low && r < low + 5)).size)
  return { paired: new Set(ranks).size < ranks.length, maxSuit, connected, high: Math.max(0, ...ranks),
    wetness: clamp((maxSuit >= 3 ? .65 : maxSuit === 2 ? .25 : 0) + Math.max(0, connected - 2) * .2) }
}
export function analyzeHand(hole: readonly Card[], board: readonly Card[]) {
  const all = [...hole, ...board]
  const evaluated = board.length >= 3 ? fastRank(all) : 7462
  const category = [10, 166, 322, 1599, 1609, 2467, 3325, 6185, 7462].findIndex(limit => evaluated <= limit)
  const pairedHole = hole[0][0] === hole[1][0]
  const pairedRanks = hole.filter(card => board.some(b => b[0] === card[0])).map(rank)
  const high = Math.max(0, ...board.map(rank))
  const topPair = pairedRanks.includes(high), overpair = pairedHole && rank(hole[0]) > high
  const ownPair = pairedHole || pairedRanks.length > 0
  const boardRank = board.length === 5 ? fastRank(board) : 0
  const boardPlays = board.length === 5 && evaluated === boardRank
  const suitMaximum = Math.max(...['s','h','d','c'].map(suit => board.filter(card => card[1] === suit).length))
  const quad = board.find(card => board.filter(other => other[0] === card[0]).length === 4)
  const kicker = quad ? board.find(card => card[0] !== quad[0]) : undefined
  const lockedBoard = board.length === 5 && (boardRank === 1 || (boardRank === 1600 && suitMaximum <= 2)
    || (quad && kicker && (rank(kicker) === 14 || (rank(quad) === 14 && rank(kicker) === 13))))
  let flushOuts = 0, nutBlocker = false, backdoor = false
  for (const suit of ['s', 'h', 'd', 'c']) {
    const count = all.filter(card => card[1] === suit).length
    if (hole.some(card => card[1] === suit)) {
      if (board.length < 5 && count === 4) flushOuts = 9
      if (board.length === 3 && count === 3) backdoor = true
    }
    if (board.filter(card => card[1] === suit).length >= 2 && hole.some(card => card[0] === 'A' && card[1] === suit)) nutBlocker = true
  }
  let straightOuts = 0
  if (board.length < 5 && category > 4) {
    const allMask = rankMask(all), boardMask = rankMask(board)
    let outMask = 0
    for (const sequence of STRAIGHTS) {
      const missing = sequence & ~allMask
      // One missing rank, with a private card contributing to the straight.
      if (missing && !(missing & (missing - 1)) && (sequence & allMask & ~boardMask)) outMask |= missing
    }
    if (outMask & 2) outMask = (outMask & ~2) | (1 << 14)
    for (let candidate = 2; candidate <= 14; candidate++) if (outMask & (1 << candidate)) straightOuts += 4
  }
  const drawOuts = board.length < 5 ? Math.min(15, flushOuts + straightOuts - (flushOuts ? straightOuts / 4 : 0)) : 0
  const premium = category <= 5 && !boardPlays && (category !== 5 || ownPair)
  const twoPair = category === 6 && ownPair && !boardPlays
  return { category, topPair, overpair, ownPair, boardPlays, lockedBoard: !!lockedBoard, premium, twoPair, drawOuts, backdoor, nutBlocker,
    value: premium ? .95 : twoPair ? .8 : overpair ? .72 : topPair ? .64 : ownPair ? .42 : .12 }
}
