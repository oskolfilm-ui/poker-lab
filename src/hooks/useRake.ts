import { useState } from 'react'
import { DEFAULT_RAKE, validRake, type RakeConfig } from '../game/rake'

const KEY = 'poker-lab-rake-v1'
export function readRake(): RakeConfig {
  try { const config: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (validRake(config)) return config }
  catch { /* A default applies when settings cannot be read. */ }
  return { ...DEFAULT_RAKE }
}
export function useRake() {
  const [config, setConfig] = useState(readRake)
  const [error, setError] = useState('')
  const change = (value: RakeConfig) => {
    if (!validRake(value)) return
    setConfig(value)
    try { localStorage.setItem(KEY, JSON.stringify(value)); setError('') }
    catch { setError('Настройка действует в этой вкладке, но не сохранена после закрытия браузера.') }
  }
  return { config, change, error }
}
