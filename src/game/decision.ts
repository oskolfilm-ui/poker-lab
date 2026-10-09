import { legalActions, potSize, type GameState, type PlayerIndex } from './engine'

export function potOdds(game: GameState, player: PlayerIndex | null = game.toAct): number {
  if (game.result || player === null) return 0
  const { toCall, callAmount } = legalActions(game, player)
  if (!callAmount) return 0
  // A short-stack call cannot win the uncalled excess that will be refunded.
  const contestablePot = potSize(game) - Math.max(0, toCall - callAmount)
  return callAmount / (contestablePot + callAmount) * 100
}
