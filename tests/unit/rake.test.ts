import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { applyAction, chipsInPlay, legalActions, startHand } from '../../src/game/engine'
import { createDeck, type Card } from '../../src/game/cards'
import { DEFAULT_RAKE, calculateRake } from '../../src/game/rake'
import { completedHand, HistoryDatabase, saveCompletedHand } from '../../src/history/store'
import { exportHand } from '../../src/history/export'
import { heroResults } from '../../src/history/results'
import { advanceHand } from '../../src/game/match'

const draws: Card[] = ['2h', 'As', '3h', 'Ad', '4c', '7c', '8d', 'Jh', '5c', 'Qs', '6c', 'Kh']
function start(rakeConfig = DEFAULT_RAKE) { return startHand({ rakeConfig, deck: [...createDeck().filter(card => !draws.includes(card)), ...[...draws].reverse()] }) }

describe('Rake settlement', () => {
  it('uses 5%, floors whole chips, caps at 2 BB and follows No flop, no drop', () => {
    expect(calculateRake(100, true, DEFAULT_RAKE)).toBe(4)
    expect(calculateRake(50, true, DEFAULT_RAKE)).toBe(2)
    expect(calculateRake(19, true, DEFAULT_RAKE)).toBe(0)
    expect(calculateRake(400, false, DEFAULT_RAKE)).toBe(0)
    expect(calculateRake(400, true, { ...DEFAULT_RAKE, enabled: false })).toBe(0)
    expect(calculateRake(40, false, { ...DEFAULT_RAKE, noFlopNoDrop: false })).toBe(2)
  })
  it('returns uncalled bets before rake and never charges preflop folds by default', () => {
    const game = applyAction(applyAction(start(), 0, { type: 'allin' }), 1, { type: 'fold' })
    expect(game.result).toMatchObject({ pot: 4, rake: 0, payouts: [4, 0] })
    expect(game.players.map(player => player.stack)).toEqual([202, 198])
    let post = applyAction(applyAction(start(), 0, { type: 'raise', to: 20 }), 1, { type: 'call' })
    post = applyAction(applyAction(post, 1, { type: 'allin' }), 0, { type: 'fold' })
    expect(post.result).toMatchObject({ pot: 40, rake: 2, payouts: [0, 38] })
    expect(post.players.map(player => player.stack)).toEqual([180, 218])
    expect(chipsInPlay(post)).toBe(400)
  })
  it('charges runouts once, pays net pot, and persists/exports/statistically counts net stacks without another deduction', async () => {
    const game = applyAction(applyAction(start(), 0, { type: 'allin' }), 1, { type: 'call' })
    expect(game.board).toHaveLength(5)
    expect(game.result).toMatchObject({ pot: 400, rake: 4, payouts: [396, 0] })
    expect(game.players.map(player => player.stack)).toEqual([396, 0])
    expect(() => applyAction(game, 0, { type: 'check' })).toThrow()
    expect(chipsInPlay(game)).toBe(400)
    const db = new HistoryDatabase(`rake-${crypto.randomUUID()}`)
    try {
      const record = completedHand(game, { sessionId: 'rake-session', matchId: 'rake-match' })
      await saveCompletedHand(record, db); await saveCompletedHand(record, db)
      db.close(); await db.open(); await saveCompletedHand(record, db)
      const stored = (await db.hands.toArray())[0]
      expect(await db.hands.count()).toBe(1)
      expect(stored.players[0].stack).toBe(396)
      expect(exportHand(stored)).toContain('Total pot 400 | Rake 4')
      expect(exportHand(stored)).toContain('Hero collected 396 from pot')
      expect(heroResults([stored])[0]).toMatchObject({ netBB: 98, bb100: 9800 })
      expect(advanceHand(game).rakeConfig).toEqual(DEFAULT_RAKE)
    } finally { await db.delete() }
  })
  it('splits the net pot and awards an odd chip after deducting rake', () => {
    const royal: Card[] = ['2h', '4d', '3h', '5d', '6c', 'As', 'Ks', 'Qs', '7c', 'Js', '8c', 'Ts']
    let game = startHand({ rakeConfig: DEFAULT_RAKE, deck: [...createDeck().filter(card => !royal.includes(card)), ...royal.reverse()] })
    game = applyAction(applyAction(game, 0, { type: 'raise', to: 30 }), 1, { type: 'call' })
    while (!game.result) game = applyAction(game, game.toAct!, { type: legalActions(game, game.toAct!).toCall ? 'call' : 'check' })
    expect(game.result).toMatchObject({ pot: 60, rake: 3, payouts: [28, 29] })
    expect(game.players.map(player => player.stack)).toEqual([198, 199])
    expect(chipsInPlay(game)).toBe(400)
  })
})
