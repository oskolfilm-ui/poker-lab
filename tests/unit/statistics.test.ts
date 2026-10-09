import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { applyAction, startHand } from '../../src/game/engine'
import { advanceHand, matchWinner } from '../../src/game/match'
import { completedHand, HistoryDatabase, readStatistics, resetMatchScore, saveHand } from '../../src/history/store'
import { finishedMatch } from '../fixtures/match'

const databases: HistoryDatabase[] = []
function database() {
  const db = new HistoryDatabase(`stats-${crypto.randomUUID()}`)
  databases.push(db)
  return db
}
const context = { sessionId: 'session-1', matchId: 'match-1' }
const folded = () => applyAction(startHand(), 0, { type: 'fold' })
afterEach(async () => { for (const db of databases.splice(0)) await db.delete() })

describe('Atomic history and statistics', () => {
  it('counts a hand once across concurrent saves, reloads and new sessions', async () => {
    const db = database(), game = folded()
    await Promise.all([saveHand(game, context, db), saveHand(game, context, db)])
    db.close(); await db.open()
    await saveHand(game, { ...context, sessionId: 'new-session' }, db)
    expect(await db.hands.count()).toBe(1)
    expect(await readStatistics(context.sessionId, db)).toMatchObject({ totalHands: 1, sessionHands: 1, heroWins: 0, aiWins: 0 })
    expect((await readStatistics('new-session', db)).sessionHands).toBe(0)
    await saveHand(folded(), { sessionId: 'new-session', matchId: 'new-match' }, db)
    expect(await readStatistics('new-session', db)).toMatchObject({ totalHands: 2, sessionHands: 1 })
  })
  it('awards only completed matches and persists both winners', async () => {
    const db = database()
    await saveHand(folded(), context, db)
    expect(await db.matches.count()).toBe(0)
    await saveHand(finishedMatch(0), context, db)
    await saveHand(finishedMatch(1), { ...context, matchId: 'match-2' }, db)
    db.close(); await db.open()
    expect(await readStatistics(context.sessionId, db)).toMatchObject({ totalHands: 3, sessionHands: 3, heroWins: 1, aiWins: 1 })
    expect(await db.matches.count()).toBe(2)
  })
  it('does not award the same match twice, including after a score reset', async () => {
    const db = database(), terminal = finishedMatch(0)
    await saveHand(terminal, context, db)
    await saveHand(terminal, context, db)
    await saveHand(finishedMatch(0), context, db)
    expect(await readStatistics(context.sessionId, db)).toMatchObject({ heroWins: 1, totalHands: 2 })
    await resetMatchScore(db)
    db.close(); await db.open()
    await saveHand(terminal, context, db)
    expect(await readStatistics(context.sessionId, db)).toMatchObject({ heroWins: 0, aiWins: 0, totalHands: 2, sessionHands: 2 })
    expect(await db.hands.count()).toBe(2)
    expect(await db.matches.count()).toBe(1)
    await saveHand(finishedMatch(1), { ...context, matchId: 'after-reset' }, db)
    expect((await readStatistics(context.sessionId, db)).aiWins).toBe(1)
  })
  it('rolls back history and all counters together on a write failure, then retries safely', async () => {
    const db = database(), terminal = finishedMatch()
    const fail = () => { throw new Error('Simulated storage failure') }
    db.sessions.hook('creating', fail)
    await expect(saveHand(terminal, context, db)).rejects.toThrow('Simulated storage failure')
    expect(await db.hands.count()).toBe(0)
    expect(await db.matches.count()).toBe(0)
    expect(await readStatistics(context.sessionId, db)).toMatchObject({ totalHands: 0, sessionHands: 0, heroWins: 0 })
    db.sessions.hook('creating').unsubscribe(fail)
    await saveHand(terminal, context, db)
    expect(await readStatistics(context.sessionId, db)).toMatchObject({ totalHands: 1, sessionHands: 1, heroWins: 1 })
  })
  it('migrates v1 history without losing hands or counting old wins as new matches', async () => {
    const name = `legacy-${crypto.randomUUID()}`
    const legacy = new Dexie(name)
    legacy.version(1).stores({ hands: 'id, startedAt, endedAt' })
    const old = completedHand(finishedMatch())
    await legacy.table('hands').put(old); legacy.close()
    const db = new HistoryDatabase(name); databases.push(db)
    expect(await readStatistics('new-session', db)).toMatchObject({ totalHands: 1, sessionHands: 0, heroWins: 0, aiWins: 0 })
    await saveHand(finishedMatch(0, old.id), { sessionId: 'new-session', matchId: 'restored-old' }, db)
    expect((await readStatistics('new-session', db)).heroWins).toBe(0)
    expect(await db.hands.get(old.id)).toEqual(old)
  })
})

describe('Match lifecycle', () => {
  it('never mistakes an all-in awaiting a call for a match win', () => {
    const game = applyAction(startHand(), 0, { type: 'allin' })
    expect(game.players[0].stack).toBe(0)
    expect(matchWinner(game)).toBeNull()
    expect(() => advanceHand(game)).toThrow()
  })
  it('retains stacks and rotates the button on an ordinary hand', () => {
    const game = folded(), next = advanceHand(game)
    expect(matchWinner(game)).toBeNull()
    expect(next.players.map(player => player.initialStack)).toEqual(game.players.map(player => player.stack))
    expect(next.dealer).toBe(1)
    expect(next.number).toBe(2)
  })
  it('starts a fresh 200/200 match after either player busts, keeping hand number and button rotation', () => {
    for (const winner of [0, 1] as const) {
      const game = finishedMatch(winner), next = advanceHand(game)
      expect(matchWinner(game)).toBe(winner)
      expect(game.players[winner].stack).toBe(400)
      expect(next.players.map(player => player.initialStack)).toEqual([200, 200])
      expect(next.players.map(player => player.streetBet)).toEqual([2, 1])
      expect(next.dealer).toBe(1)
      expect(next.number).toBe(2)
    }
  })
})
