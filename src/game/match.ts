import { nextHand, other, startHand, type GameState, type PlayerIndex } from './engine'
import type { RakeConfig } from './rake'

export interface HandContext { sessionId: string; matchId: string }

export function matchWinner(game: Pick<GameState, 'players' | 'result'>): PlayerIndex | null {
  if (!game.result) return null
  if (game.players[1].stack === 0 && game.players[0].stack > 0) return 0
  if (game.players[0].stack === 0 && game.players[1].stack > 0) return 1
  return null
}

export function advanceHand(game: GameState, rakeConfig: RakeConfig | undefined = game.rakeConfig): GameState {
  if (!game.result) throw new Error('Сначала завершите текущую раздачу.')
  return matchWinner(game) === null ? nextHand(game, rakeConfig) : startHand({
    number: game.number + 1, dealer: other(game.dealer), stacks: [200, 200], rakeConfig,
  })
}
