import { describe, expect, it } from 'vitest'
import { applyAction, startHand } from '../../src/game/engine'
import { potOdds } from '../../src/game/decision'

describe('Acting player pot odds', () => {
  it('uses the player whose turn it is and returns zero for checks or finished hands', () => {
    let game = startHand()
    expect(potOdds(game)).toBe(25)
    game = applyAction(game, 0, { type: 'call' })
    expect(potOdds(game)).toBe(0)
    game = applyAction(game, 1, { type: 'raise', to: 6 })
    expect(potOdds(game)).toBeCloseTo(100 / 3)
    expect(potOdds(applyAction(game, 0, { type: 'fold' }))).toBe(0)
  })
  it('excludes refunded excess from the pot when a caller has a short stack', () => {
    let game = startHand({ stacks: [10, 390] })
    game = applyAction(game, 0, { type: 'call' })
    game = applyAction(game, 1, { type: 'raise', to: 100 })
    expect(potOdds(game)).toBe(40) // 8 to call for the contestable final pot of 20.
    game = applyAction(game, 0, { type: 'call' })
    expect(game.result?.pot).toBe(20)
  })
})
