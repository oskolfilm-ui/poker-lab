import { describe, expect, it } from 'vitest'
import { compareHands, createDeck, evaluate, type Card } from '../../src/game/cards'
import { applyAction, chipsInPlay, legalActions, nextHand, other, potSize, startHand, type Action, type GameState } from '../../src/game/engine'
import { chooseAction, decisionView } from '../../src/game/ai'

function seeded(seed = 42) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
}
function act(game: GameState, type: Action['type'], to?: number) {
  return applyAction(game, game.toAct!, { type, to })
}
function checkDown(input: GameState) {
  let game = input
  while (!game.result) game = act(game, legalActions(game, game.toAct!).toCall ? 'call' : 'check')
  return game
}
function rig(draws: Card[]) {
  return [...createDeck().filter(card => !draws.includes(card)), ...[...draws].reverse()]
}

describe('Heads-up betting engine', () => {
  it('posts 1/2, deals unique cards, and acts SB/Button first', () => {
    const game = startHand({ random: seeded() })
    expect(game.players.map(player => player.stack)).toEqual([199, 198])
    expect(game.players.map(player => player.streetBet)).toEqual([1, 2])
    expect(game.toAct).toBe(game.dealer)
    expect(potSize(game)).toBe(3)
    expect(new Set([...game.deck, ...game.players.flatMap(player => player.hole)]).size).toBe(52)
    expect(chipsInPlay(game)).toBe(400)
  })
  it('does not skip the BB option after a limp; BB acts first postflop', () => {
    let game = act(startHand(), 'call')
    expect(game.street).toBe('preflop')
    expect(game.toAct).toBe(1)
    expect(legalActions(game, 1).actions).toContain('raise')
    game = act(game, 'check')
    expect(game.street).toBe('flop')
    expect(game.board).toHaveLength(3)
    expect(game.toAct).toBe(1)
    expect(game.players.map(player => player.streetBet)).toEqual([0, 0])
    expect(game.currentBet).toBe(0)
  })
  it('rotates the button and positions while retaining the stacks', () => {
    const finished = act(startHand({ dealer: 0 }), 'fold')
    const next = nextHand(finished)
    expect(next.dealer).toBe(1)
    expect(next.toAct).toBe(1)
    expect(next.number).toBe(2)
    expect(next.players.map(player => player.initialStack)).toEqual([199, 201])
    expect(next.players.map(player => player.streetBet)).toEqual([2, 1])
    expect(act(act(next, 'call'), 'check').toAct).toBe(0)
  })
  it('returns the uncalled big blind on an SB fold', () => {
    const game = act(startHand(), 'fold')
    expect(game.result?.pot).toBe(2)
    expect(game.players.map(player => player.stack)).toEqual([199, 201])
    expect(game.events).toContainEqual({ type: 'return', player: 1, amount: 1, street: 'preflop' })
    expect(chipsInPlay(game)).toBe(400)
  })
  it('uses raise-to totals and the last FULL raise to calculate the next minimum', () => {
    let game = act(startHand(), 'raise', 6)
    expect(game.players[0].stack).toBe(194)
    expect(game.minRaise).toBe(4)
    expect(legalActions(game, 1).minTo).toBe(10)
    expect(() => act(game, 'raise', 9)).toThrow()
    game = act(game, 'raise', 14)
    expect(game.minRaise).toBe(8)
    expect(legalActions(game, 0).minTo).toBe(22)
    game = act(game, 'call')
    expect(game.street).toBe('flop')
    expect(potSize(game)).toBe(28)
    expect(game.players.map(player => player.stack)).toEqual([186, 186])
  })
  it('enforces opening bet minimum and updates the raise increment', () => {
    let game = act(act(startHand(), 'call'), 'check')
    expect(legalActions(game, 1).minTo).toBe(2)
    expect(() => act(game, 'bet', 1)).toThrow()
    game = act(game, 'bet', 7)
    expect(legalActions(game, 0).minTo).toBe(14)
    expect(game.minRaise).toBe(7)
  })
  it('rejects out-of-turn, fractional, oversized, and unavailable actions without mutation', () => {
    const game = startHand()
    const original = structuredClone(game)
    expect(() => applyAction(game, 1, { type: 'call' })).toThrow()
    expect(() => act(game, 'check')).toThrow()
    expect(() => act(game, 'bet', 10)).toThrow()
    expect(() => act(game, 'raise', 4.5)).toThrow()
    expect(() => act(game, 'raise', 201)).toThrow()
    expect(() => act(game, 'raise', NaN)).toThrow()
    expect(game).toEqual(original)
    const completed = act(game, 'fold')
    expect(() => act(completed, 'call')).toThrow()
    expect(() => nextHand(game)).toThrow()
  })
  it('returns unmatched all-in chips and runs the full board', () => {
    let game = act(startHand({ stacks: [300, 100] }), 'allin')
    expect(legalActions(game, 1).callAmount).toBe(98)
    game = act(game, 'call')
    expect(game.board).toHaveLength(5)
    expect(game.result?.pot).toBe(200)
    expect(game.events).toContainEqual({ type: 'return', player: 0, amount: 200, street: 'preflop' })
    expect(game.players[0].stack).toBeGreaterThanOrEqual(200)
    expect(chipsInPlay(game)).toBe(400)
  })
  it('short all-in does not reset the full-raise increment or permit a dry side-pot raise', () => {
    let game = act(startHand({ stacks: [390, 10] }), 'raise', 8)
    expect(game.minRaise).toBe(6)
    game = act(game, 'allin')
    expect(game.currentBet).toBe(10)
    expect(game.minRaise).toBe(6)
    expect(game.raiseAllowed[0]).toBe(false)
    expect(legalActions(game, 0).actions).toEqual(['fold', 'call'])
    game = act(game, 'call')
    expect(game.result?.pot).toBe(20)
    expect(chipsInPlay(game)).toBe(400)
  })
  it('allows an incomplete opening all-in, but no additional betting against it', () => {
    let game = act(act(startHand({ stacks: [397, 3] }), 'call'), 'check')
    expect(game.players[1].stack).toBe(1)
    expect(legalActions(game, 1).actions).not.toContain('bet')
    game = act(game, 'allin')
    expect(legalActions(game, 0).actions).toEqual(['fold', 'call'])
    game = act(game, 'call')
    expect(game.result?.pot).toBe(6)
    expect(chipsInPlay(game)).toBe(400)
  })
  it('handles an all-in posted as a short blind without requiring a nonexistent action', () => {
    const game = startHand({ stacks: [399, 1], dealer: 0 })
    expect(game.result?.pot).toBe(2)
    expect(game.board).toHaveLength(5)
    expect(chipsInPlay(game)).toBe(400)
    const shortSB = startHand({ stacks: [1, 399], dealer: 0 })
    expect(shortSB.result?.pot).toBe(2)
    expect(shortSB.events.some(event => event.type === 'return' && event.player === 1 && event.amount === 1)).toBe(true)
  })
  it('burns cards, completes all streets, and resolves the winner', () => {
    const draws: Card[] = ['Ks', 'As', 'Kd', 'Ad', '2c', '3c', '4d', '7h', '5c', '8s', '6c', 'Jh']
    const game = checkDown(startHand({ deck: rig(draws) }))
    expect(game.players[0].hole).toEqual(['As', 'Ad'])
    expect(game.board).toEqual(['3c', '4d', '7h', '8s', 'Jh'])
    expect(game.result?.winners).toEqual([0])
    expect(game.players.map(player => player.stack)).toEqual([202, 198])
    expect(game.events.filter(event => event.type === 'board').map(event => event.street)).toEqual(['flop', 'turn', 'river'])
  })
  it('splits a board-played royal flush', () => {
    const draws: Card[] = ['2h', '4d', '3h', '5d', '6c', 'As', 'Ks', 'Qs', '7c', 'Js', '8c', 'Ts']
    const game = checkDown(startHand({ deck: rig(draws) }))
    expect(game.result?.winners).toEqual([0, 1])
    expect(game.result?.payouts).toEqual([2, 2])
    expect(game.players.map(player => player.stack)).toEqual([200, 200])
  })
  it('rejects broken decks and starting stacks, and cannot continue with a busted player', () => {
    expect(() => startHand({ stacks: [0, 400] })).toThrow()
    expect(() => startHand({ stacks: [1.5, 398.5] })).toThrow()
    expect(() => startHand({ deck: Array(52).fill('As') })).toThrow()
    const game = startHand({ stacks: [1, 399], dealer: 0, deck: rig(['As', '2h', 'Ad', '3h', '4c', '7c', '8d', 'Jh', '5c', 'Qs', '6c', 'Kh']) })
    expect(game.players[0].stack).toBe(0)
    expect(() => nextHand(game)).toThrow()
  })
  it('conserves every chip and terminates 700 randomized legal hands', () => {
    const random = seeded(1901)
    const seenStreets = new Set<string>()
    for (let trial = 0; trial < 700; trial++) {
      const first = 1 + Math.floor(random() * 399)
      let game = startHand({ stacks: [first, 400 - first], dealer: trial % 2 as 0 | 1, random })
      let actions = 0
      while (!game.result && actions++ < 300) {
        seenStreets.add(game.street)
        const player = game.toAct!
        const legal = legalActions(game, player)
        expect(legal.actions.length).toBeGreaterThan(0)
        const type = legal.actions[Math.floor(random() * legal.actions.length)]
        const to = legal.minTo + Math.floor(random() * (legal.maxTo - legal.minTo + 1))
        game = applyAction(game, player, { type, to })
        expect(chipsInPlay(game)).toBe(400)
        for (const seat of game.players) {
          expect(seat.stack).toBeGreaterThanOrEqual(0)
          expect(seat.committed).toBeGreaterThanOrEqual(0)
          expect(Number.isSafeInteger(seat.stack)).toBe(true)
        }
        const visible = [...game.players.flatMap(seat => seat.hole), ...game.board]
        expect(new Set(visible).size).toBe(visible.length)
      }
      expect(game.result).not.toBeNull()
      expect(game.players[0].stack + game.players[1].stack).toBe(400)
      expect(game.result!.payouts.reduce((a, b) => a + b)).toBe(game.result!.pot)
    }
    expect(seenStreets.has('river')).toBe(true)
  })
})

describe('trusted hand evaluation', () => {
  it('recognizes an ace-low straight and compares kickers', () => {
    expect(evaluate(['As', '2d', '3c', '4h', '5s', 'Kd', 'Qc']).name).toBe('Straight')
    expect(compareHands(['As', 'Ad', 'Kh', '7s', '6c', '3h', '2d'], ['Ac', 'Ah', 'Qh', '7s', '6c', '3h', '2d'])).toBe(0)
  })
  it('uses the best five cards; a flush beats a straight', () => {
    expect(compareHands(['Ah', 'Jh', '9h', '5h', '2h', 'Ks', 'Qc'], ['As', 'Kd', 'Qh', 'Js', 'Tc', '2c', '3c'])).toBe(0)
    expect(() => evaluate(['As', 'As', '3h', '4h', '5h'])).toThrow()
  })
})

describe('AdaptiveAI baseline', () => {
  it('receives neither Hero cards nor the real deck', () => {
    const game = startHand({ dealer: 1 })
    const view = decisionView(game, 1)
    expect(Object.keys(view).sort()).toEqual(['board', 'hole', 'legal', 'opponentStack', 'pot', 'street', 'streetBet', 'stack', 'effectiveStack', 'button', 'inPosition', 'actions'].sort())
    expect(view.hole).toEqual(game.players[1].hole)
    expect(view).not.toHaveProperty('deck')
    expect(view).not.toHaveProperty('players')
    view.hole.pop()
    expect(game.players[1].hole).toHaveLength(2)
  })
  it('makes legal decisions throughout 8 complete hands', () => {
    const random = seeded(701)
    for (let trial = 0; trial < 8; trial++) {
      let game = startHand({ random, dealer: trial % 2 as 0 | 1 })
      while (!game.result) {
        const player = game.toAct!
        const decision = chooseAction(decisionView(game, player), random)
        expect(legalActions(game, player).actions).toContain(decision.type)
        game = applyAction(game, player, decision)
      }
      expect(chipsInPlay(game)).toBe(400)
      expect(other(game.dealer)).not.toBe(game.dealer)
    }
  }, 20000)
})
