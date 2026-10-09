import type { CompletedHand } from './store'

export interface ResultPoint {
  handId: string
  hands: number
  endedAt: string
  profitBB: number
  netBB: number
  bb100: number
}

/** Realized profit, including posted blinds and returned uncalled bets.
 * Match restarts are deposits, never winnings: compare each hand's own stacks.
 * Fixed training stakes are 1/2, so one big blind is two chips.
 */
export function heroResults(records: readonly CompletedHand[], sessionId?: string): ResultPoint[] {
  const unique = new Map(records.filter(hand => hand.result && hand.endedAt).map(hand => [hand.id, hand]))
  const hands = [...unique.values()]
    .filter(hand => sessionId === undefined || hand.context?.sessionId === sessionId)
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt) || a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
  let netBB = 0
  return hands.map((hand, index) => {
    const profitBB = (hand.players[0].stack - hand.players[0].initialStack) / 2
    netBB += profitBB
    return { handId: hand.id, hands: index + 1, endedAt: hand.endedAt, profitBB, netBB, bb100: netBB * 100 / (index + 1) }
  })
}
