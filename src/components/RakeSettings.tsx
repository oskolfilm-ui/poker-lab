import type { RakeConfig } from '../game/rake'

export function RakeSettings({ config, current, error, onChange }: { config: RakeConfig; current?: RakeConfig; error: string; onChange: (config: RakeConfig) => void }) {
  const pending = JSON.stringify(config) !== JSON.stringify(current ?? { ...config, enabled: false })
  return <section className="rake-settings" aria-label="Настройки рейка">
    <h2>Рейк</h2>
    <label><input type="checkbox" checked={config.enabled} onChange={event => onChange({ ...config, enabled: event.target.checked })} />Включить рейк</label>
    <label>Рейк, %<input type="number" min="0" max="99.5" step="0.5" value={config.percent} onChange={event => { if (event.target.value) onChange({ ...config, percent: event.target.valueAsNumber }) }} /></label>
    <label>Кэп, BB<input type="number" min="0" max="1000" step="0.5" value={config.capBB} onChange={event => { if (event.target.value) onChange({ ...config, capBB: event.target.valueAsNumber }) }} /></label>
    <label><input type="checkbox" checked={config.noFlopNoDrop} onChange={event => onChange({ ...config, noFlopNoDrop: event.target.checked })} />No flop, no drop</label>
    <p role="status">{pending ? 'Новая настройка применяется со следующей раздачи.' : 'Эта настройка действует в текущей раздаче.'} 1 BB = 2 фишки. Рейк округляется вниз до целой фишки.</p>
    {error && <p role="alert">{error}</p>}
  </section>
}
