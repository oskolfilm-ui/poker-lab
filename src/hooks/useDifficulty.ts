import { useEffect, useState } from 'react'
import { DEFAULT_DIFFICULTY, type Difficulty } from '../game/ai/levels'
import { readDifficulty, saveDifficulty } from '../history/store'

export function useDifficulty() {
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void readDifficulty().then(value => { if (active) setDifficulty(value) })
      .catch(() => { if (active) setError('Не удалось загрузить уровень сложности. Используется Strong Reg.') })
      .finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])
  const change = async (value: Difficulty) => {
    setSaving(true)
    try { await saveDifficulty(value); setDifficulty(value); setError('') }
    catch { setError('Не удалось сохранить уровень сложности. Попробуйте ещё раз.') }
    finally { setSaving(false) }
  }
  return { difficulty, ready, saving, error, change }
}
