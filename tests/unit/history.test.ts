import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { applyAction, legalActions, startHand, type GameState } from '../../src/game/engine'
import { completedHand, HistoryDatabase } from '../../src/history/store'
import { exportHands, handNet } from '../../src/history/export'

const databases: HistoryDatabase[] = []
afterEach(async () => { for (const db of databases.splice(0)) await db.delete() })

describe('IndexedDB history', () => {
  it('stores completed hands durably, deduplicates reloads, and does not retain the deck', async () => {
    const db = new HistoryDatabase(`test-${crypto.randomUUID()}`)
    databases.push(db)
    const state = applyAction(startHand(), 0, { type: 'fold' })
    const record = completedHand(state)
    await db.hands.put(record)
    await db.hands.put(record)
    expect(await db.hands.count()).toBe(1)
    db.close()
    await db.open()
    expect(await db.hands.get(record.id)).toEqual(record)
    expect(record).not.toHaveProperty('deck')
    expect(() => completedHand(startHand())).toThrow()
  })
})

describe('PokerStars-style TRAINING export', () => {
  it('clearly marks training, includes blinds, refunds and correct totals on a fold', () => {
    const game = applyAction(startHand({ id: '123456', startedAt: '2026-10-08T10:00:00.000Z' }), 0, { type: 'fold' })
    const text = exportHands([completedHand(game)])
    expect(text).toContain('not real PokerStars games')
    expect(text).toContain('compatibility is UNVERIFIED')
    expect(text).toContain("PokerStars Hand #123456: Hold'em No Limit (1/2)")
    expect(text).toContain('[POKER LAB TRAINING]')
    expect(text).toContain('2026/10/08 10:00:00 UTC')
    expect(text).toContain('Hero: posts small blind 1')
    expect(text).toContain('AdaptiveAI: posts big blind 2')
    expect(text).toContain('Uncalled bet (1) returned to AdaptiveAI')
    expect(text).toContain('Total pot 2 | Rake 0')
    expect(text).toContain('Seat 1: Hero (button) (small blind) folded before Flop')
    expect(text).not.toContain('AdaptiveAI: shows')
    expect(handNet(completedHand(game))).toBe(-1)
  })
  it('exports exact raise increments, capped calls, runouts and showdown', () => {
    let game = startHand({ stacks: [300, 100] })
    game = applyAction(game, 0, { type: 'raise', to: 8 })
    game = applyAction(game, 1, { type: 'allin' })
    expect(() => applyAction(game, 0, { type: 'allin' })).toThrow()
    game = applyAction(game, 0, { type: 'call' })
    const text = exportHands([completedHand(game)])
    expect(text).toContain('Hero: raises 6 to 8')
    expect(text).toContain('AdaptiveAI: raises 92 to 100 and is all-in')
    expect(text).toContain('Hero: calls 92')
    expect(text).toContain('*** SHOW DOWN ***')
    expect(text).toContain('Total pot 200 | Rake 0')
  })
  it('exports both visible hands and all four betting streets on a showdown', () => {
    let game: GameState = startHand()
    while (!game.result) {
      const legal = legalActions(game, game.toAct!)
      game = applyAction(game, game.toAct!, { type: legal.toCall ? 'call' : 'check' })
    }
    const text = exportHands([completedHand(game)])
    expect(text).toContain('*** FLOP ***')
    expect(text).toContain('*** TURN ***')
    expect(text).toContain('*** RIVER ***')
    expect(text).toContain('*** SHOW DOWN ***')
    expect(text).toContain('Hero: shows')
    expect(text).toContain('AdaptiveAI: shows')
    expect(text).toContain('Total pot 4 | Rake 0')
    expect(text.match(/\*\*\* SUMMARY \*\*\*/g)).toHaveLength(1)
  })
})
