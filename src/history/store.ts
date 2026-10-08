import Dexie, { type Table } from 'dexie'
import type { GameState, HandResult } from '../game/engine'

export type CompletedHand = Omit<GameState, 'deck'> & { result: HandResult; endedAt: string }

export class HistoryDatabase extends Dexie {
  hands!: Table<CompletedHand, string>
  constructor(name = 'poker-lab-history') {
    super(name)
    this.version(1).stores({ hands: 'id, startedAt, endedAt' })
  }
}

export const historyDb = new HistoryDatabase()

export function completedHand(state: GameState): CompletedHand {
  if (!state.result || !state.endedAt) throw new Error('Можно сохранить только завершённую раздачу.')
  const { deck: _deck, ...record } = state
  return { ...record, result: state.result, endedAt: state.endedAt }
}

export async function saveHand(state: GameState) {
  // Primary-key put is idempotent across reloads and React StrictMode effects.
  return historyDb.hands.put(completedHand(state))
}

export function listHands() {
  return historyDb.hands.orderBy('startedAt').reverse().toArray()
}
