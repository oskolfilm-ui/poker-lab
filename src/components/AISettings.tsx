import type { Difficulty } from '../game/ai/levels'
import { DifficultySelect } from './DifficultySelect'
import { METRICS, rateEstimate, confirmedDeviation, type HeroProfile, type Metric } from '../game/ai/profile'

const descriptions: Record<Difficulty, string> = {
  Beginner: 'Простая стратегия и консервативные решения.',
  Regular: 'Диапазоны соперника, позиция и размеры ставок.',
  'Strong Reg': 'Защита блайндов, полублефы и чек-рейзы.',
  Expert: 'Более точная оценка эквити, тонкое вэлью и контроль банка.',
  Nemesis: 'Стратегия Expert с адаптацией к подтверждённым тенденциям Hero.',
}
export function AISettings({ difficulty, profile, disabled, error, onChange }: {
  difficulty: Difficulty; profile: HeroProfile; disabled: boolean; error: string; onChange: (value: Difficulty) => void
}) {
  const leaks = Object.keys(METRICS).filter(key => confirmedDeviation(profile, key as Metric) !== 0).length
  return <section className="ai-settings" aria-label="Настройки AdaptiveAI">
    <div className="difficulty-control"><label htmlFor="ai-difficulty">Сложность AdaptiveAI</label>
      <DifficultySelect id="ai-difficulty" label="Сложность AdaptiveAI" difficulty={difficulty} disabled={disabled} onChange={onChange} />
      <p className="difficulty-timing">Выбор применяется к следующему решению ИИ, в том числе в текущей раздаче.</p>
      <p>{descriptions[difficulty]}</p>{error && <p role="alert" className="text-negative">{error}</p>}
    </div>
    <details className="hero-model"><summary>Модель Hero · <span data-testid="profile-hands">{profile.hands}</span> рук</summary>
      <p>{difficulty === 'Nemesis' ? `Подтверждённых отклонений: ${leaks}. Адаптация ограничена размером выборки.` : 'Статистика накапливается на всех уровнях. Адаптация к Hero включается на Nemesis.'}</p>
      <div className="model-grid">{Object.entries(METRICS).map(([key, metric]) => {
        const estimate = rateEstimate(profile, key as Metric)
        return <div key={key}><strong>{metric.label}</strong><span>{estimate.raw === null ? '—' : `${(estimate.raw * 100).toFixed(1)}%`}</span><small>{estimate.opportunities} возможностей{!estimate.sufficient && ` · нужно ${metric.min}`}</small><small>{estimate.opportunities > 0 ? `95% ДИ: ${(estimate.low * 100).toFixed(0)}–${(estimate.high * 100).toFixed(0)}%` : 'Недостаточно данных'}</small></div>
      })}</div><p>AFq = (bets + raises) / (bets + raises + calls + folds) после флопа. Чеки исключены. Модель использует публичные действия, а не закрытые карты.</p>
    </details>
  </section>
}
