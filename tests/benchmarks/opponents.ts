import { evaluate, RANKS, type Card, type Random } from '../../src/game/cards'
import type { Action } from '../../src/game/engine'
import type { DecisionView } from '../../src/game/ai/view'

// Independently written reference policies: none imports candidate range,
// equity, hand analysis, sizing, profile, or decision code.
export const OPPONENTS = ['tight-value', 'calling-station', 'pressure', 'balanced'] as const
export type Opponent = typeof OPPONENTS[number]
function preflop(hole: Card[]) {
  const [a, b] = hole.map(c => RANKS.indexOf(c[0]) + 2).sort((x, y) => y - x)
  return a === b ? 0.42 + a / 25 : (a + b) / 32 + (hole[0][1] === hole[1][1] ? .08 : 0) - Math.max(0, a - b - 2) * .035
}
function postflop(view: DecisionView) {
  const rank = evaluate([...view.hole, ...view.board]).name
  const pair = view.hole[0][0] === view.hole[1][0] || view.hole.some(h => view.board.some(b => b[0] === h[0]))
  const top = Math.max(...view.board.map(c => RANKS.indexOf(c[0])))
  const topPair = view.hole.some(c => RANKS.indexOf(c[0]) === top) || (view.hole[0][0] === view.hole[1][0] && RANKS.indexOf(view.hole[0][0]) > top)
  const suits = [...view.hole, ...view.board].map(c => c[1])
  const draw = view.board.length < 5 && ['s', 'h', 'd', 'c'].some(s => suits.filter(x => x === s).length === 4 && view.hole.some(c => c[1] === s))
  const value = ['Straight Flush', 'Four of a Kind', 'Full House', 'Flush', 'Straight', 'Three of a Kind', 'Two Pair'].includes(rank)
  return { pair, topPair, draw, value }
}
function sized(view: DecisionView, target: number): Action {
  const type = view.legal.actions.includes('bet') ? 'bet' : 'raise'
  return view.legal.actions.includes(type) ? { type, to: Math.round(Math.min(view.legal.maxTo, Math.max(view.legal.minTo, target))) }
    : { type: view.legal.toCall ? 'call' : 'check' }
}
export function referenceAction(kind: Opponent, view: DecisionView, random: Random): Action {
  const facing = view.legal.toCall > 0
  const passive: Action = { type: facing ? 'call' : 'check' }
  const aggressive = view.legal.actions.includes('bet') || view.legal.actions.includes('raise')
  if (view.street === 'preflop') {
    const strength = preflop(view.hole), cost = view.legal.callAmount
    const premium = strength > .89
    if (kind === 'calling-station') {
      if (premium && aggressive) return sized(view, Math.max(8, view.streetBet + cost * 3))
      return cost <= 12 || strength > .6 ? passive : { type: 'fold' }
    }
    if (kind === 'pressure') {
      if (aggressive && (cost <= 6 || premium || (cost <= 20 && random() < .4))) return sized(view, Math.max(6, view.streetBet + cost * 3))
      return !facing || strength > .5 || cost <= 4 ? passive : { type: 'fold' }
    }
    const opened = view.actions.some(a => a.raiseBy > 0)
    const playable = strength > (kind === 'tight-value' ? .61 : .45)
    if (aggressive && (premium || (!opened && view.button && playable))) return sized(view, premium && cost > 2 ? view.streetBet + cost * 3 : 5)
    if (!facing) return passive
    if (cost > 25 && !premium) return { type: 'fold' }
    return playable && cost <= (premium ? 200 : kind === 'tight-value' ? 8 : 14) ? passive : { type: 'fold' }
  }
  const hand = postflop(view)
  const odds = view.legal.callAmount / Math.max(1, view.pot + view.legal.callAmount)
  if (kind === 'calling-station') {
    if (hand.value && aggressive && random() < .6) return sized(view, view.streetBet + view.legal.toCall + .7 * (view.pot + view.legal.toCall))
    return !facing || hand.pair || hand.draw || hand.value || odds < .15 ? passive : { type: 'fold' }
  }
  if (kind === 'tight-value') {
    if (aggressive && (hand.value || hand.topPair)) return sized(view, view.streetBet + view.legal.toCall + .85 * (view.pot + view.legal.toCall))
    return !facing || hand.value || (hand.topPair && odds < .35) || (hand.draw && odds < .25) ? passive : { type: 'fold' }
  }
  if (kind === 'pressure') {
    if (aggressive && (!facing || hand.value || hand.draw || random() < .3)) return sized(view, view.streetBet + view.legal.toCall + .75 * (view.pot + view.legal.toCall))
    return !facing || hand.pair || hand.value || hand.draw || (odds < .2 && random() < .5) ? passive : { type: 'fold' }
  }
  if (aggressive && (hand.value || (!facing && (hand.topPair || hand.draw || random() < .22)))) return sized(view, view.streetBet + view.legal.toCall + .55 * (view.pot + view.legal.toCall))
  return !facing || hand.value || (hand.topPair && odds < .4) || (hand.pair && odds < .25) || (hand.draw && odds < .24) ? passive : { type: 'fold' }
}
