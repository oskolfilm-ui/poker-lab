import { createDeck, type Card } from '../../src/game/cards'
import { applyAction, startHand, type PlayerIndex } from '../../src/game/engine'
import type { RakeConfig } from '../../src/game/rake'

function matchStart(winner: PlayerIndex, id?: string, rakeConfig?: RakeConfig) {
  const draws: Card[] = winner === 0
    ? ['2h', 'As', '3h', 'Ad', '4c', '7c', '8d', 'Jh', '5c', 'Qs', '6c', 'Kh']
    : ['As', '2h', 'Ad', '3h', '4c', '7c', '8d', 'Jh', '5c', 'Qs', '6c', 'Kh']
  const deck = [...createDeck().filter(card => !draws.includes(card)), ...draws.reverse()]
  return startHand({ deck, id, rakeConfig })
}

export function finishedMatch(winner: PlayerIndex = 0, id?: string) {
  return applyAction(applyAction(matchStart(winner, id), 0, { type: 'allin' }), 1, { type: 'call' })
}

/** Legal, unfinished hand: Hero limps, AI jams, Hero must decide. */
export function facingMatchAllIn(winner: PlayerIndex = 0, id?: string, rakeConfig?: RakeConfig) {
  return applyAction(applyAction(matchStart(winner, id, rakeConfig), 0, { type: 'call' }), 1, { type: 'allin' })
}
