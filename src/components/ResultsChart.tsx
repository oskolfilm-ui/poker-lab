import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import type { CompletedHand } from '../history/store'
import { heroResults } from '../history/results'

export const formatResult = (value: number) => `${value > 0 ? '+' : ''}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}`
const height = 280, left = 80, right = 24, top = 24, bottom = 40

export function ResultsChart({ hands, sessionId, loading }: { hands: CompletedHand[]; sessionId: string; loading: boolean }) {
  const [scope, setScope] = useState<'session' | 'all'>('session')
  const [selected, setSelected] = useState<number | null>(null)
  const [width, setWidth] = useState(900)
  const plot = useRef<SVGSVGElement>(null)
  const titleId = useId()
  const points = useMemo(() => heroResults(hands, scope === 'session' ? sessionId : undefined), [hands, sessionId, scope])
  const last = points.at(-1)
  useEffect(() => {
    if (!plot.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))))
    observer.observe(plot.current)
    return () => observer.disconnect()
  }, [!!last])
  const active = points[Math.min(selected ?? points.length - 1, points.length - 1)]
  // Include the zero baseline; avoid a collapsed axis for break-even hands.
  let low = 0, high = 0
  for (const point of points) { low = Math.min(low, point.bb100); high = Math.max(high, point.bb100) }
  const padding = Math.max((high - low) * 0.1, 1)
  low -= padding; high += padding
  const x = (index: number) => points.length <= 1 ? (left + width - right) / 2 : left + index / (points.length - 1) * (width - left - right)
  const y = (value: number) => top + (high - value) / (high - low) * (height - top - bottom)
  // Bound rendering work, but keep exact totals and every hand accessible via the slider.
  const stride = Math.max(1, Math.ceil(points.length / 1200))
  const path = points.filter((_, index) => index % stride === 0 || index === points.length - 1).map(point => `${x(point.hands - 1)},${y(point.bb100)}`).join(' ')
  return <section className="results-panel" aria-labelledby={titleId} data-testid="results-chart">
    <div className="results-heading"><div><h2 id={titleId}><TrendingUp size={24} />Результаты Hero</h2><p>Средний чистый результат на 100 завершённых раздач</p></div><div className="chart-scope" role="group" aria-label="Период графика"><button aria-pressed={scope === 'session'} onClick={() => { setScope('session'); setSelected(null) }}>Текущая сессия</button><button aria-pressed={scope === 'all'} onClick={() => { setScope('all'); setSelected(null) }}>Всё время</button></div></div>
    <div className="chart-summary"><div><span>Результат</span><strong data-testid="result-bb100" className={(last?.bb100 ?? 0) < 0 ? 'text-negative' : 'text-positive'}>{last ? formatResult(last.bb100) : '—'}<small> bb/100</small></strong></div><div><span>Чистый выигрыш</span><strong data-testid="result-net-bb">{last ? formatResult(last.netBB) : '—'}<small> BB</small></strong></div><div><span>Завершено раздач</span><strong data-testid="result-hands">{points.length}</strong></div></div>
    {last ? <>
      <svg ref={plot} className="results-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`График bb/100: ${points.length} завершённых раздач, итог ${formatResult(last.bb100)} bb/100`} onPointerMove={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        const index = Math.round(((event.clientX - rect.left) / rect.width * width - left) / (width - left - right) * (points.length - 1))
        setSelected(Math.max(0, Math.min(points.length - 1, index)))
      }} onPointerLeave={() => setSelected(null)}>
        {[high, (high + low) / 2, low].map((value, index) => <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid" /><text x={left - 10} y={y(value) + 5} textAnchor="end">{new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}</text></g>)}
        <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="chart-zero" />
        <polyline points={path} fill="none" className="chart-line" />
        {active && <><line x1={x(active.hands - 1)} x2={x(active.hands - 1)} y1={top} y2={height - bottom} className="chart-cursor" /><circle cx={x(active.hands - 1)} cy={y(active.bb100)} r={5} className="chart-point" /></>}
        <text x={left} y={height - 12}>1</text><text x={width - right} y={height - 12} textAnchor="end">{points.length} раздач</text>
      </svg>
      <div className="chart-detail" data-testid="result-detail">Раздача {active.hands}: {formatResult(active.profitBB)} BB · накопленный результат {formatResult(active.bb100)} bb/100</div>
      <input className="chart-slider" type="range" aria-label="Раздача на графике" min={1} max={Math.max(1, points.length)} value={active.hands} disabled={points.length === 1} onChange={event => setSelected(Number(event.target.value) - 1)} aria-valuetext={`Раздача ${active.hands}, ${formatResult(active.bb100)} bb/100`} />
    </> : <p className="chart-empty">{loading ? 'Загружаем сохранённые раздачи…' : 'Завершите раздачу — здесь появится график.'}</p>}
    <p className="chart-note">(Стек после раздачи − стек до раздачи) / 2 BB. Сумма результатов в BB / число раздач × 100. Незавершённые руки и пополнение стеков в новом матче не учитываются. На малой выборке результат сильно колеблется.</p>
  </section>
}
