import { Pause, Play, RotateCcw } from 'lucide-react'
import type { PlayerIndex } from '../game/engine'
import type { StatisticsSnapshot } from '../history/store'

interface Props {
  statistics: StatisticsSnapshot
  winner: PlayerIndex | null
  paused: boolean
  canReset: boolean
  onPause: () => void
  onReset: () => void
}

export function MatchScoreboard({ statistics, winner, paused, canReset, onPause, onReset }: Props) {
  return <section className="match-scoreboard" aria-label="Общий счёт матчей">
    <div className="score-main"><span className="score-label">ПОБЕДЫ В МАТЧАХ</span><div className="match-score" data-testid="match-score" aria-live="polite"><span>HERO</span><strong>{statistics.heroWins} : {statistics.aiWins}</strong><span>AI</span></div></div>
    <p className="match-status" role="status">{winner !== null ? `${winner === 0 ? 'Hero' : 'AdaptiveAI'} выиграл матч!` : paused ? 'Автопереход на паузе' : 'Следующая раздача автоматически'}<span>{winner !== null ? 'Следующий матч — со стеками 200 / 200' : 'Блайнды 1 / 2 · новый матч 200 / 200'}</span></p>
    <div className="score-controls"><button className="secondary-button pause-button" aria-pressed={paused} aria-label={paused ? 'Продолжить автоигру' : 'Пауза автоигры'} onClick={onPause}>{paused ? <Play size={20} /> : <Pause size={20} />}<span>{paused ? 'Продолжить' : 'Пауза'}</span></button><button className="icon-button score-reset" disabled={!canReset} aria-label="Сбросить счёт матчей" title="Сбросить счёт матчей" onClick={onReset}><RotateCcw size={21} /></button></div>
  </section>
}
