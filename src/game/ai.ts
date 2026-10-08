import { compareHands, createDeck, RANKS, secureRandom, shuffle, type Card, type Random } from './cards'
import { legalActions, other, potSize, type Action, type GameState, type LegalActions, type PlayerIndex, type Street } from './engine'

export interface DecisionView {
  hole: Card[]
  board: Card[]
  street: Street
  pot: number
  streetBet: number
  opponentStack: number
  legal: LegalActions
}

// The strategy receives only information available to its own seat.
// Hero's cards and the real deck are deliberately absent from this boundary.
export function decisionView(state: GameState, player: PlayerIndex): DecisionView {
  return {
    hole: [...state.players[player].hole], board: [...state.board], street: state.street,
    pot: potSize(state), streetBet: state.players[player].streetBet,
    opponentStack: state.players[other(player)].stack,
    legal: legalActions(state, player),
  }
}

export function estimateEquity(view: Pick<DecisionView, 'hole' | 'board'>, random: Random = secureRandom, samples = 100): number {
  const known = new Set([...view.hole, ...view.board])
  const remaining = createDeck().filter(card => !known.has(card))
  let score = 0
  for (let i = 0; i < samples; i++) {
    const deck = shuffle(remaining, random)
    const opponent = deck.splice(0, 2)
    const board = [...view.board, ...deck.slice(0, 5 - view.board.length)]
    const result = compareHands([...view.hole, ...board], [...opponent, ...board])
    score += result === 'tie' ? 0.5 : result === 0 ? 1 : 0
  }
  return score / samples
}

export function chooseAction(view: DecisionView, random: Random = secureRandom): Action {
  const { legal } = view
  if (legal.actions.length === 0) throw new Error('ИИ не может ходить вне очереди.')
  const equity = estimateEquity(view, random)
  const roll = random()
  const sizingAction = legal.actions.includes('bet') ? 'bet' : 'raise'
  const canSize = legal.actions.includes(sizingAction)
  const raise = (): Action => {
    const target = view.street === 'preflop'
      ? Math.max(6, legal.toCall * 3 + view.streetBet)
      : view.streetBet + legal.toCall + Math.round((view.pot + legal.toCall) * (equity > 0.75 ? 0.75 : 0.55))
    return { type: sizingAction, to: Math.min(legal.maxTo, Math.max(legal.minTo, target)) }
  }
  const ranks = view.hole.map(card => RANKS.indexOf(card[0]))
  const weakestPreflop = view.street === 'preflop' && ranks[0] !== ranks[1] && Math.max(...ranks) < 8 && Math.abs(ranks[0] - ranks[1]) > 3 && view.hole[0][1] !== view.hole[1][1]
  if (legal.toCall > 0) {
    const potOdds = legal.callAmount / (view.pot + legal.callAmount)
    if ((equity < potOdds + 0.06 && roll > 0.08) || (weakestPreflop && roll < 0.6)) return { type: 'fold' }
    if (canSize && ((equity > 0.65 && roll < 0.65) || (legal.toCall <= 2 && equity > 0.47 && roll < 0.3))) return raise()
    return { type: 'call' }
  }
  if (canSize && ((equity > 0.55 && roll < 0.7) || roll < 0.13)) return raise()
  return { type: 'check' }
}
