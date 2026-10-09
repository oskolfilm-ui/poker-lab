import { secureRandom, type Random } from '../cards'
import { CODES, DECK, rankCode } from './hand'
import type { DecisionView } from './view'
import { buildRange, type OpponentRange } from './ranges'

export function rangeEquity(view: Pick<DecisionView, 'hole' | 'board'>, range: OpponentRange, random: Random, samples: number) {
  const known = new Set([...view.hole, ...view.board]), available = DECK.filter(card => !known.has(card)).map(card => CODES.get(card)!)
  const own = view.hole.map(card => CODES.get(card)!), board = view.board.map(card => CODES.get(card)!)
  let wins = 0, squares = 0, calledWins = 0, callWeight = 0
  for (let sample = 0; sample < samples; sample++) {
    const target = random() * range.total
    let low = 0, high = range.cumulative.length - 1
    while (low < high) { const mid = (low + high) >>> 1; if (range.cumulative[mid] < target) low = mid + 1; else high = mid }
    const opponent = range.combos[low], runout = [...board]
    const drawPool = available.filter(card => !opponent.codes.includes(card))
    while (runout.length < 5) {
      const index = Math.min(drawPool.length - 1, Math.floor(random() * drawPool.length))
      runout.push(drawPool[index]); drawPool[index] = drawPool[drawPool.length - 1]; drawPool.pop()
    }
    const selfRank = rankCode([...own, ...runout]), opponentRank = rankCode([...opponent.codes, ...runout])
    const score = selfRank < opponentRank ? 1 : selfRank === opponentRank ? .5 : 0
    wins += score; squares += score * score
    calledWins += score * opponent.continues; callWeight += opponent.continues
  }
  const equity = wins / samples
  return { equity, valueEquity: callWeight ? calledWins / callWeight : equity,
    standardError: Math.sqrt(Math.max(0, squares / samples - equity * equity) / samples), samples }
}
export function estimateEquity(view: Pick<DecisionView, 'hole' | 'board'>, random: Random = secureRandom, samples = 128) {
  const uniform = buildRange({ ...view, actions: [] } as unknown as DecisionView, false)
  return rangeEquity(view, uniform, random, samples).equity
}
