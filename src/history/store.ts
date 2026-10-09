import Dexie, { type Table } from 'dexie'
import type { GameState, HandResult, PlayerIndex } from '../game/engine'
import { matchWinner, type HandContext } from '../game/match'
import { emptyProfile, observeHand, type HeroProfile } from '../game/ai/profile'
import { handObservation } from '../game/ai/observation'
import { DEFAULT_DIFFICULTY, isDifficulty, type Difficulty } from '../game/ai/levels'

export type CompletedHand = Omit<GameState, 'deck'> & { result: HandResult; endedAt: string; context?: HandContext }
export interface Statistics { id: 'global'; totalHands: number; heroWins: number; aiWins: number }
interface SessionStatistics { id: string; hands: number }
interface MatchRecord { id: string; sessionId: string; finalHandId: string; winner: PlayerIndex; endedAt: string }
export interface StatisticsSnapshot extends Statistics { sessionHands: number }
export const emptyStatistics: Statistics = { id: 'global', totalHands: 0, heroWins: 0, aiWins: 0 }

export class HistoryDatabase extends Dexie {
  hands!: Table<CompletedHand, string>
  statistics!: Table<Statistics, string>
  sessions!: Table<SessionStatistics, string>
  matches!: Table<MatchRecord, string>
  profiles!: Table<HeroProfile, string>
  preferences!: Table<{ id: 'ai'; difficulty: Difficulty }, string>
  constructor(name = 'poker-lab-history') {
    super(name)
    this.version(1).stores({ hands: 'id, startedAt, endedAt' })
    this.version(2).stores({
      hands: 'id, startedAt, endedAt', statistics: 'id', sessions: 'id', matches: 'id, finalHandId',
    }).upgrade(async transaction => {
      // Existing history contributes to the lifetime count, never to a new session.
      await transaction.table('statistics').put({ ...emptyStatistics, totalHands: await transaction.table('hands').count() })
    })
    this.version(3).stores({ profiles: 'id', preferences: 'id' }).upgrade(async transaction => {
      // Reconstruct once, from completed public actions only. No hole cards enter the model.
      let profile = emptyProfile()
      for (const hand of await transaction.table('hands').orderBy('startedAt').toArray() as CompletedHand[]) {
        profile = observeHand(profile, handObservation(hand))
      }
      await transaction.table('profiles').put(profile)
    })
  }
}

export const historyDb = new HistoryDatabase()

export function completedHand(state: GameState, context?: HandContext): CompletedHand {
  if (!state.result || !state.endedAt) throw new Error('Можно сохранить только завершённую раздачу.')
  const { deck: _deck, ...record } = state
  return { ...record, result: state.result, endedAt: state.endedAt, ...(context ? { context } : {}) }
}

export async function saveCompletedHand(hand: CompletedHand, db = historyDb): Promise<string> {
  if (!hand.result || !hand.endedAt) throw new Error('Можно сохранить только завершённую раздачу.')
  return db.transaction('rw', [db.hands, db.statistics, db.sessions, db.matches, db.profiles], async () => {
    // One transaction and unique IDs protect both StrictMode and concurrent tabs.
    if (await db.hands.get(hand.id)) return hand.id
    const stats = await db.statistics.get('global') ?? { ...emptyStatistics, totalHands: await db.hands.count() }
    await db.hands.add(hand)
    await db.profiles.put(observeHand(await readHeroProfile(db), handObservation(hand)))
    stats.totalHands++
    if (hand.context) {
      const { sessionId, matchId } = hand.context
      const session = await db.sessions.get(sessionId) ?? { id: sessionId, hands: 0 }
      await db.sessions.put({ ...session, hands: session.hands + 1 })
      const winner = matchWinner(hand)
      if (winner !== null && !await db.matches.get(matchId)) {
        await db.matches.add({ id: matchId, sessionId, finalHandId: hand.id, winner, endedAt: hand.endedAt })
        if (winner === 0) stats.heroWins++
        else stats.aiWins++
      }
    }
    await db.statistics.put(stats)
    return hand.id
  })
}

export async function readHeroProfile(db = historyDb) { return await db.profiles.get('hero') ?? emptyProfile() }
export async function readDifficulty(db = historyDb): Promise<Difficulty> {
  const value = (await db.preferences.get('ai'))?.difficulty
  return isDifficulty(value) ? value : DEFAULT_DIFFICULTY
}
export async function saveDifficulty(difficulty: Difficulty, db = historyDb) {
  if (!isDifficulty(difficulty)) throw new Error('Неизвестный уровень сложности.')
  await db.preferences.put({ id: 'ai', difficulty })
}

export function saveHand(state: GameState, context?: HandContext, db = historyDb) {
  return saveCompletedHand(completedHand(state, context), db)
}

export function listHands(db = historyDb) {
  return db.hands.orderBy('startedAt').reverse().toArray()
}

export async function readStatistics(sessionId: string, db = historyDb): Promise<StatisticsSnapshot> {
  return db.transaction('r', db.statistics, db.sessions, async () => {
    const stats = await db.statistics.get('global') ?? emptyStatistics
    const session = await db.sessions.get(sessionId)
    return { ...stats, sessionHands: session?.hands ?? 0 }
  })
}

export async function resetMatchScore(db = historyDb) {
  await db.transaction('rw', db.statistics, async () => {
    const stats = await db.statistics.get('global') ?? emptyStatistics
    await db.statistics.put({ ...stats, heroWins: 0, aiWins: 0 })
    // Keep the match ledger: reloading an old winning hand must not restore its point.
  })
}
