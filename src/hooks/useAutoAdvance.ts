import { useEffect, useRef, useState } from 'react'

export function useAutoAdvance(handId: string, completed: boolean, enabled: boolean, saved: boolean, onNext: () => void) {
  const callback = useRef(onNext)
  const [seconds, setSeconds] = useState<number | null>(null)
  useEffect(() => { callback.current = onNext }, [onNext])
  useEffect(() => {
    if (!completed || !enabled || !saved) { setSeconds(null); return }
    const started = Date.now()
    setSeconds(3)
    const interval = window.setInterval(() => setSeconds(Math.max(1, Math.ceil((3000 - (Date.now() - started)) / 1000))), 1000)
    const timeout = window.setTimeout(() => callback.current(), 3000)
    return () => { window.clearInterval(interval); window.clearTimeout(timeout) }
  }, [handId, completed, enabled, saved])
  return seconds
}
