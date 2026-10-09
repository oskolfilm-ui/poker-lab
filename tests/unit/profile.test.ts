import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { confirmedDeviation, emptyProfile, observeHand, rateEstimate, type HandObservation, type ObservedAction } from '../../src/game/ai/profile'
import { handObservation } from '../../src/game/ai/observation'
import { HistoryDatabase, completedHand, readHeroProfile, readDifficulty, saveDifficulty, saveHand, resetMatchScore, readStatistics } from '../../src/history/store'
import { applyAction, startHand, type GameState } from '../../src/game/engine'
import { finishedMatch } from '../fixtures/match'
const databases: HistoryDatabase[] = []
const database = (name = crypto.randomUUID()) => { const db = new HistoryDatabase(name); databases.push(db); return db }
afterEach(async () => { for (const db of databases.splice(0)) await db.delete() })
const a = (player: 0 | 1, type: ObservedAction['type'], raiseBy = 0, street: ObservedAction['street'] = 'preflop', amount = type === 'fold' || type === 'check' ? 0 : 5): ObservedAction => ({ player, type, raiseBy, street, amount })
const observation = (actions: ObservedAction[], extras: Partial<HandObservation> = {}): HandObservation => ({ actions, dealer: 0, sawFlop: false, showdown: false, winners: [1], ...extras })
const folded = () => applyAction(startHand(), 0, { type: 'fold' })

describe('Public-action Hero model', () => {
  it('counts opportunities separately from hands and blinds are not voluntary', () => {
    const profile = observeHand(emptyProfile(), handObservation(folded()))
    expect(profile.hands).toBe(1)
    expect(profile.metrics.vpip).toEqual({ hits: 0, opportunities: 1 })
    expect(profile.metrics.pfr.hits).toBe(0)
    expect(profile.metrics.threeBet.opportunities).toBe(0)
    expect(profile.metrics.cbet.opportunities).toBe(0)
    const defended = observeHand(profile, observation([a(1,'raise',4),a(0,'call')], { dealer: 1 }))
    expect(defended.metrics.threeBet).toEqual({ hits: 0, opportunities: 1 })
    expect(defended.metrics.foldBBToSteal).toEqual({ hits: 0, opportunities: 1 })
    expect(defended.metrics.vpip.hits).toBe(1)
  })
  it('recognizes 3-bets, folds to 3-bets, 4-bets and folds to 4-bets', () => {
    let profile = observeHand(emptyProfile(), observation([a(0,'raise',4),a(1,'raise',12),a(0,'fold')]))
    expect(profile.metrics.foldToThreeBet).toEqual({ hits: 1, opportunities: 1 })
    expect(profile.metrics.fourBet).toEqual({ hits: 0, opportunities: 1 })
    profile = observeHand(profile, observation([a(0,'raise',4),a(1,'raise',12),a(0,'raise',30),a(1,'call')]))
    expect(profile.metrics.fourBet).toEqual({ hits: 1, opportunities: 2 })
    profile = observeHand(profile, observation([a(1,'raise',4),a(0,'raise',12),a(1,'raise',30),a(0,'fold')], { dealer: 1 }))
    expect(profile.metrics.threeBet).toEqual({ hits: 1, opportunities: 1 })
    expect(profile.metrics.foldToFourBet).toEqual({ hits: 1, opportunities: 1 })
  })
  it('records c-bets only with a real opportunity and excludes donk bets', () => {
    const pre = [a(0,'raise',4),a(1,'call')]
    let profile = observeHand(emptyProfile(), observation([...pre,a(1,'check',0,'flop'),a(0,'bet',6,'flop'),a(1,'fold',0,'flop')], { sawFlop: true }))
    expect(profile.metrics.cbet).toEqual({ hits: 1, opportunities: 1 })
    profile = observeHand(profile, observation([...pre,a(1,'bet',6,'flop'),a(0,'call',0,'flop')], { sawFlop: true }))
    expect(profile.metrics.cbet).toEqual({ hits: 1, opportunities: 1 })
    profile = observeHand(profile, observation([a(0,'call'),a(1,'raise',6),a(0,'call'),a(1,'bet',8,'flop'),a(0,'fold',0,'flop')], { sawFlop: true }))
    expect(profile.metrics.foldToCbet).toEqual({ hits: 1, opportunities: 1 })
    expect(profile.metrics.aggression).toEqual({ hits: 1, opportunities: 3 })
  })
  it('uses raiseBy rather than the all-in label, and handles split showdowns', () => {
    const profile = observeHand(emptyProfile(), observation([a(1,'allin',195),a(0,'allin',0)], { sawFlop: true, showdown: true, winners: [0,1] }))
    expect(profile.metrics.vpip.hits).toBe(1); expect(profile.metrics.pfr.hits).toBe(0)
    expect(profile.metrics.threeBet).toEqual({ hits: 0, opportunities: 1 })
    expect(profile.metrics.wtsd.hits).toBe(1); expect(profile.metrics.wonShowdown.hits).toBe(.5)
  })
  it('does not adapt to sparse or statistically inconclusive observations', () => {
    const profile = emptyProfile()
    profile.metrics.threeBet = { hits: 5, opportunities: 5 }
    expect(confirmedDeviation(profile,'threeBet')).toBe(0)
    profile.metrics.threeBet = { hits: 12, opportunities: 100 }
    expect(confirmedDeviation(profile,'threeBet')).toBe(0)
    profile.metrics.threeBet = { hits: 60, opportunities: 100 }
    expect(confirmedDeviation(profile,'threeBet')).toBeGreaterThan(0)
    expect(confirmedDeviation(profile,'threeBet')).toBeLessThan(.3)
    const estimate = rateEstimate(profile,'threeBet')
    expect(estimate.mean).toBeLessThan(estimate.raw!)
    expect(estimate.low).toBeLessThan(.6); expect(estimate.high).toBeGreaterThan(.6)
    expect(() => handObservation(startHand())).toThrow()
  })
  it('observation projection ignores stored hole cards, deck and showdown cards', () => {
    const game = finishedMatch()
    const before = handObservation(game)
    Object.defineProperty(game, 'deck', { get: () => { throw new Error('Deck accessed') } })
    Object.defineProperty(game, 'players', { get: () => { throw new Error('Cards accessed') } })
    expect(handObservation(game)).toEqual(before)
    expect(JSON.stringify(before)).not.toMatch(/hole|deck|cards/)
  })
})

describe('Persistent AI settings and statistics', () => {
  it('updates history/profile/score atomically and only once across concurrent saves', async () => {
    const db = database(), game = finishedMatch(), context = { sessionId: 's1', matchId: 'm1' }
    await Promise.all([saveHand(game,context,db),saveHand(game,context,db)])
    const profile = await readHeroProfile(db)
    expect(profile.hands).toBe(1)
    expect(await readStatistics('s1',db)).toMatchObject({ totalHands: 1, heroWins: 1 })
    db.close(); await db.open()
    await saveHand(game,{ sessionId: 's2', matchId: 'm2' },db)
    expect(await readHeroProfile(db)).toEqual(profile)
    await resetMatchScore(db)
    expect(await readHeroProfile(db)).toEqual(profile)
    await saveHand(folded(),{ sessionId: 's2', matchId: 'm2' },db)
    expect((await readHeroProfile(db)).hands).toBe(2)
  })
  it('rolls back the model with history on failure, then retries exactly once', async () => {
    const db = database(), game = folded()
    const fail = () => { throw new Error('disk failure') }
    db.profiles.hook('creating',fail)
    await expect(saveHand(game,undefined,db)).rejects.toThrow('disk failure')
    expect(await db.hands.count()).toBe(0); expect((await readHeroProfile(db)).hands).toBe(0)
    db.profiles.hook('creating').unsubscribe(fail)
    await saveHand(game,undefined,db); await saveHand(game,undefined,db)
    expect((await readHeroProfile(db)).hands).toBe(1)
  })
  it('migrates v2 public actions once, preserving all original hands and scores', async () => {
    const name = crypto.randomUUID(), old = new Dexie(name)
    old.version(2).stores({ hands: 'id, startedAt, endedAt', statistics:'id', sessions:'id', matches:'id, finalHandId' })
    const hands = [completedHand(folded()),completedHand(finishedMatch())]
    await old.table('hands').bulkPut(hands)
    await old.table('statistics').put({ id:'global', totalHands:2, heroWins:7, aiWins:3 }); old.close()
    const db = database(name)
    expect((await readHeroProfile(db)).hands).toBe(2)
    expect(await readStatistics('new',db)).toMatchObject({ totalHands:2, heroWins:7, aiWins:3 })
    expect(await db.hands.toArray()).toEqual(expect.arrayContaining(hands))
    db.close(); await db.open()
    await saveHand(hands[0] as GameState,undefined,db)
    expect((await readHeroProfile(db)).hands).toBe(2)
  })
  it('persists difficulty independently of matches, sessions and scoreboard resets', async () => {
    const db = database()
    expect(await readDifficulty(db)).toBe('Strong Reg')
    await saveDifficulty('Nemesis',db); db.close(); await db.open()
    await saveHand(folded(),undefined,db); await resetMatchScore(db)
    expect(await readDifficulty(db)).toBe('Nemesis')
    expect(await db.hands.count()).toBe(1)
  })
})
