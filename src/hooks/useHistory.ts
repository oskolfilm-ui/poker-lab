import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import type { GameState } from '../game/engine'
import type { HandContext } from '../game/match'
import { completedHand, emptyStatistics, historyDb, listHands, readStatistics, readHeroProfile, saveCompletedHand, type CompletedHand, type StatisticsSnapshot } from '../history/store'
import { emptyProfile } from '../game/ai/profile'

const PENDING_KEY = 'poker-lab-pending-v1'
function readPending(): CompletedHand[] {
  try {
    const records = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '[]') as CompletedHand[]
    return Array.isArray(records) ? records.filter(record => record.schemaVersion === 1 && record.result && record.endedAt) : []
  } catch { return [] }
}
function writePending(records: CompletedHand[]) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(records)) } catch { /* In-memory queue remains available. */ }
}
function mergeHands(...groups: CompletedHand[][]) {
  return [...new Map(groups.flat().map(hand => [hand.id, hand])).values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function useHistory(game: GameState, context: HandContext) {
  const pending = useRef<CompletedHand[]>(readPending())
  const [hands, setHands] = useState<CompletedHand[]>(pending.current)
  const [statistics, setStatistics] = useState<StatisticsSnapshot>({ ...emptyStatistics, sessionHands: 0 })
  const [profile, setProfile] = useState(emptyProfile)
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [savedHandId, setSavedHandId] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    let subscription: { unsubscribe: () => void } | undefined
    void historyDb.open().then(() => {
      if (cancelled) return
      subscription = liveQuery(async () => ({ hands: await listHands(), statistics: await readStatistics(context.sessionId), profile: await readHeroProfile() })).subscribe({
        next: snapshot => {
          setHands(mergeHands(snapshot.hands, pending.current)); setStatistics(snapshot.statistics)
          // The model changes only when a unique completed hand is added.
          // Keep its identity stable on unrelated reads to avoid cancelling AI work.
          setProfile(previous => previous.hands === snapshot.profile.hands ? previous : snapshot.profile)
        },
        error: () => setStatus('error'),
      })
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true; subscription?.unsubscribe() }
  }, [context.sessionId, retryCount])
  useEffect(() => {
    let cancelled = false
    if (game.result) {
      pending.current = mergeHands(pending.current, [completedHand(game, context)])
      writePending(pending.current)
      setHands(previous => mergeHands(previous, pending.current))
    }
    const batch = [...pending.current]
    setStatus(batch.length ? 'saving' : 'loading')
    async function sync() {
      try {
        // Explicit open retries Dexie's failed automatic opening after storage recovers.
        await historyDb.open()
        for (const hand of batch) await saveCompletedHand(hand)
        const stored = await listHands()
        const stats = await readStatistics(context.sessionId)
        const model = await readHeroProfile()
        const savedIds = new Set(batch.map(hand => hand.id))
        pending.current = pending.current.filter(hand => !savedIds.has(hand.id))
        writePending(pending.current)
        if (!cancelled) {
          setHands(mergeHands(stored, pending.current)); setStatistics(stats)
          setProfile(previous => previous.hands === model.hands ? previous : model)
          setSavedHandId(game.result ? game.id : null); setStatus('saved')
        }
      } catch {
        if (!cancelled) { setHands(previous => mergeHands(previous, pending.current)); setStatus('error') }
      }
    }
    void sync()
    return () => { cancelled = true }
  }, [game.id, game.result, context.sessionId, context.matchId, retryCount])
  return { hands, statistics, profile, status, savedHandId, retry: () => setRetryCount(count => count + 1) }
}
