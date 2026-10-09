import { createDeck, type Card } from '../../src/game/cards'
import { applyAction, startHand, type PlayerIndex } from '../../src/game/engine'

export function finishedMatch(winner: PlayerIndex = 0, id?: string) {
  const draws: Card[] = winner === 0
    ? ['2h', 'As', '3h', 'Ad', '4c', '7c', '8d', 'Jh', '5c', 'Qs', '6c', 'Kh']
    : ['As', '2h', 'Ad', '3h', '4c', '7c', '8d', 'Jh', '5c', 'Qs', '6c', 'Kh']
  const deck = [...createDeck().filter(card => !draws.includes(card)), ...draws.reverse()]
  return applyAction(applyAction(startHand({ deck, id }), 0, { type: 'allin' }), 1, { type: 'call' })
}
