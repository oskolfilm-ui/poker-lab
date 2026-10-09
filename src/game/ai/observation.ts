import type { GameState } from '../engine'
import type { HandObservation } from './profile'

// Completed-hand projection contains public actions and results only.
export function handObservation(hand: Pick<GameState, 'events' | 'dealer' | 'board' | 'result'>): HandObservation {
  if (!hand.result) throw new Error('Модель обновляется только после завершения руки.')
  return { dealer: hand.dealer, sawFlop: hand.board.length >= 3, showdown: hand.result.reason === 'showdown', winners: [...hand.result.winners],
    actions: hand.events.flatMap(event => event.type === 'action' ? [{ player: event.player, street: event.street, type: event.action, raiseBy: event.raiseBy, amount: event.amount }] : []) }
}
