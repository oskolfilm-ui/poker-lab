import type { Card } from '../cards'
import { legalActions, other, potSize, type GameState, type LegalActions, type PlayerIndex, type Street, type ActionType } from '../engine'

export interface PublicAction {
  player: 'self' | 'opponent'; street: Street; type: ActionType
  amount: number; to: number; raiseBy: number; potBefore: number
}
export interface DecisionView {
  hole: Card[]; board: Card[]; street: Street; pot: number; streetBet: number
  stack: number; opponentStack: number; effectiveStack: number
  button: boolean; inPosition: boolean; legal: LegalActions; actions: PublicAction[]
}

// The only adapter allowed to see engine state. Never forwards another seat's
// hole cards, the deck, showdown cards, or references into the engine state.
export function decisionView(state: GameState, player: PlayerIndex): DecisionView {
  let publicPot = 0
  const actions: PublicAction[] = []
  for (const event of state.events) {
    if (event.type === 'blind') publicPot += event.amount
    if (event.type === 'return') publicPot -= event.amount
    if (event.type === 'action') {
      actions.push({ player: event.player === player ? 'self' : 'opponent', street: event.street,
        type: event.action, amount: event.amount, to: event.to, raiseBy: event.raiseBy, potBefore: publicPot })
      publicPot += event.amount
    }
  }
  const self = state.players[player], opponent = state.players[other(player)]
  return { hole: [...self.hole], board: [...state.board], street: state.street, pot: potSize(state), streetBet: self.streetBet,
    stack: self.stack, opponentStack: opponent.stack, effectiveStack: Math.min(self.initialStack, opponent.initialStack),
    button: state.dealer === player, inPosition: state.dealer === player,
    legal: legalActions(state, player), actions }
}
