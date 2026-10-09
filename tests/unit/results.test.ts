import { describe, expect, it } from 'vitest'
import { applyAction, legalActions, startHand } from '../../src/game/engine'
import { createDeck, type Card } from '../../src/game/cards'
import { advanceHand } from '../../src/game/match'
import { heroResults } from '../../src/history/results'
import { completedHand, type CompletedHand } from '../../src/history/store'
import { finishedMatch } from '../fixtures/match'

const context = { sessionId: 'session', matchId: 'match' }
const fold = (game = startHand()) => completedHand(applyAction(game, game.toAct!, { type: 'fold' }), context)

describe('Realized Hero bb/100', () => {
  it('includes blinds, refunds and exactly one copy of each completed hand', () => {
    const lost = fold()
    const returned = completedHand(applyAction(applyAction(startHand({ startedAt: '2026-10-09T00:00:01Z' }), 0, { type: 'allin' }), 1, { type: 'fold' }), context)
    lost.endedAt = '2026-10-09T00:00:00Z'; returned.endedAt = '2026-10-09T00:00:02Z'
    const result = heroResults([returned, lost, lost])
    expect(result.map(point => point.profitBB)).toEqual([-0.5, 1])
    expect(result.map(point => point.bb100)).toEqual([-50, 25])
    expect(result.at(-1)?.netBB).toBe(0.5)
  })
  it('uses each initial stack, not 200 or the pot, across ordinary hands and match restarts', () => {
    const first = applyAction(startHand(), 0, { type: 'fold' })
    const second = applyAction(advanceHand(first), 1, { type: 'fold' })
    const third = finishedMatch(0)
    const fourth = applyAction(advanceHand(third), 1, { type: 'fold' })
    const hands = [first, second, third, fourth].map((game, index) => ({ ...completedHand(game, context), endedAt: `2026-10-09T00:00:0${index}Z` }))
    expect(heroResults(hands).map(point => point.profitBB)).toEqual([-0.5, 0.5, 100, 0.5])
    expect(heroResults(hands).at(-1)).toMatchObject({ hands: 4, netBB: 100.5, bb100: 2512.5 })
    expect(heroResults([completedHand(finishedMatch(1), context)])[0].bb100).toBe(-10000)
  })
  it('excludes incomplete hands and filters sessions without losing legacy all-time records', () => {
    const old = { ...fold(), context: undefined }
    const current = fold()
    const other = { ...fold(), context: { sessionId: 'other', matchId: 'other' } }
    const unfinished = startHand() as unknown as CompletedHand
    expect(heroResults([old, current, other, unfinished])).toHaveLength(3)
    expect(heroResults([old, current, other, unfinished], 'session')).toHaveLength(1)
    expect(heroResults([old, current, other], 'fresh')).toEqual([])
  })
  it('preserves break-even results for split pots and unequal starting stacks', () => {
    const draws: Card[] = ['2h', '4d', '3h', '5d', '6c', 'As', 'Ks', 'Qs', '7c', 'Js', '8c', 'Ts']
    let split = startHand({ stacks: [120, 280], deck: [...createDeck().filter(card => !draws.includes(card)), ...draws.reverse()] })
    while (!split.result) split = applyAction(split, split.toAct!, { type: legalActions(split, split.toAct!).toCall ? 'call' : 'check' })
    expect(split.result?.winners).toEqual([0, 1])
    const point = heroResults([completedHand(split)])[0]
    expect(point).toMatchObject({ profitBB: 0, netBB: 0, bb100: 0 })
  })
})
