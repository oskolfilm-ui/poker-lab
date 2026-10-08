import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../game/engine'
import { completedHand, historyDb, listHands, type CompletedHand } from '../history/store'

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

export function useHistory(game: GameState) {
  const pending = useRef<CompletedHand[]>(readPending())
  const [hands, setHands] = useState<CompletedHand[]>(pending.current)
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [retryCount, setRetryCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    if (game.result) {
      pending.current = mergeHands(pending.current, [completedHand(game)])
      writePending(pending.current)
      setHands(previous => mergeHands(previous, pending.current))
    }
    const batch = [...pending.current]
    setStatus(batch.length ? 'saving' : 'loading')
    async function sync() {
      try {
        for (const hand of batch) await historyDb.hands.put(hand)
        const stored = await listHands()
        const savedIds = new Set(batch.map(hand => hand.id))
        pending.current = pending.current.filter(hand => !savedIds.has(hand.id))
        writePending(pending.current)
        if (!cancelled) { setHands(mergeHands(stored, pending.current)); setStatus('saved') }
      } catch {
        if (!cancelled) { setHands(previous => mergeHands(previous, pending.current)); setStatus('error') }
      }
    }
    void sync()
    return () => { cancelled = true }
  }, [game.id, game.result, retryCount])
  return { hands, status, retry: () => setRetryCount(count => count + 1) }
}
