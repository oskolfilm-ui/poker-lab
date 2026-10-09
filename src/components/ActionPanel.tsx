import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, ChevronRight, CircleHelp, Coins, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { legalActions, potSize, streetLabels, type Action, type GameState } from '../game/engine'
import { positionLabel } from '../history/export'
import { matchWinner } from '../game/match'
import { potOdds } from '../game/decision'

export function ActionPanel({ game, onAction, onNext, saving, paused, seconds }: { game: GameState; onAction: (action: Action) => void; onNext: () => void; saving: boolean; paused: boolean; seconds: number | null }) {
  const legal = legalActions(game, 0)
  const decision = legalActions(game, game.toAct ?? 0)
  const [size, setSize] = useState('6')
  useEffect(() => {
    setSize(String(Math.min(legal.maxTo, Math.max(legal.minTo, game.street === 'preflop' ? 6 : Math.round(potSize(game) * 0.6)))))
  }, [game.id, game.street, game.toAct, game.currentBet, legal.minTo, legal.maxTo])
  const ready = game.toAct === 0 && !game.result
  const sizingType = game.currentBet === 0 ? 'bet' : 'raise'
  const canSize = legal.actions.includes(sizingType)
  const amount = Number(size)
  const sizeValid = size !== '' && Number.isSafeInteger(amount) && amount >= legal.minTo && amount <= legal.maxTo
  const winner = matchWinner(game)
  const net = game.players[0].stack - game.players[0].initialStack
  const preset = (fraction: number) => {
    const target = game.players[0].streetBet + legal.toCall + Math.round((potSize(game) + legal.toCall) * fraction)
    setSize(String(Math.min(legal.maxTo, Math.max(legal.minTo, target))))
  }
  return <aside className="control-column">
    <div className="table-facts" aria-label="Текущее решение">
      <div className="street-fact"><span>ТЕКУЩАЯ УЛИЦА</span><strong data-testid="current-street">{game.street.toUpperCase()}</strong></div>
      <p>{game.result ? 'Раздача завершена' : `Решение: ${game.toAct === 0 ? 'Hero' : 'AdaptiveAI'}`}</p>
      <div className="decision-facts"><div><span>Pot Odds</span><strong data-testid="pot-odds">{!game.result && decision.callAmount ? `${potOdds(game).toFixed(1)}%` : '0%'}</strong></div><div><span>До колла</span><strong data-testid="to-call">{game.result ? 0 : decision.callAmount}<small> фишек</small></strong></div></div>
    </div>
    <div className="decision-panel">
      <div className="panel-eyebrow"><span className={`tiny-dot ${ready ? 'green' : ''}`} />{game.result ? 'РАЗДАЧА ЗАВЕРШЕНА' : ready ? 'ВАШ ХОД' : 'ХОД ADAPTIVEAI'}<span>{positionLabel(game.dealer)}</span></div>
      {game.result ? <>
        <div className={`result-icon ${net >= 0 ? 'positive' : ''}`}><Sparkles size={27} /></div>
        <h2>{winner !== null ? `${winner === 0 ? 'Hero' : 'AdaptiveAI'} выиграл матч!` : game.result.winners.length === 2 ? 'Банк разделён' : game.result.winners.includes(0) ? 'Хорошая раздача!' : 'Опыт в копилку'}</h2>
        <p className="decision-description">{game.result.winners.length === 2 ? 'Одинаковые комбинации на вскрытии.' : game.result.reason === 'fold' ? `${game.result.winners.includes(0) ? 'AdaptiveAI' : 'Hero'} сбросил карты.` : `Банк забирает ${game.result.winners.includes(0) ? 'Hero' : 'AdaptiveAI'}.`}</p>
        {game.result.descriptions && <div className="winning-hand">{game.result.descriptions[game.result.winners[0]]}</div>}
        <div className={`result-net ${net >= 0 ? 'text-positive' : 'text-negative'}`}>{net > 0 ? '+' : ''}{net}<span>фишек за раздачу</span></div>
        <button className="primary-button next-hand" disabled={saving} onClick={onNext}>{saving ? 'Сохраняем раздачу…' : winner !== null ? 'Следующий матч' : 'Следующая раздача'}<ArrowRight size={20} /></button>
        <p className="next-note" aria-live="polite" data-testid="auto-next">{saving ? 'Ждём сохранения истории и статистики' : paused ? 'Автопереход на паузе. Можно продолжить вручную.' : seconds !== null ? `${winner !== null ? 'Новый матч' : 'Следующая раздача'} через ${seconds} с` : 'Автопереход остановлен'}</p>
        <p className="next-note">{winner !== null ? 'Новый матч: стеки 200 / 200. Сессия продолжается.' : 'Button и блайнды сменятся автоматически'}</p>
      </> : <>
        <h2>{ready ? 'Ваше решение' : 'Немного терпения'}</h2>
        <p className="decision-description">{ready ? legal.toCall > 0 ? `Для продолжения уравняйте ${legal.callAmount} ${legal.callAmount === 1 ? 'фишку' : 'фишек'} или повысьте ставку.` : 'Можно пропустить ход или сделать ставку.' : 'Соперник оценивает свою руку и размер банка.'}</p>
        <div className="bet-label"><label htmlFor="bet-size">{sizingType === 'raise' ? 'Raise to · всего на улице' : 'Размер ставки'}</label><button className="all-in-button" disabled={!legal.actions.includes('allin')} onClick={() => onAction({ type: 'allin' })}>All-in<ArrowUpRight size={12} /></button></div>
        <div className={`bet-input ${!canSize ? 'disabled' : ''}`}><Coins size={19} /><input id="bet-size" aria-label="Размер ставки в фишках" type="number" inputMode="numeric" min={legal.minTo} max={legal.maxTo} step="1" value={size} disabled={!canSize} onChange={event => setSize(event.target.value)} onBlur={() => { if (!sizeValid) setSize(String(legal.minTo)) }} /><span>фишек</span></div>
        <input className="bet-slider" aria-label="Ползунок размера ставки" type="range" min={legal.minTo} max={Math.max(legal.minTo, legal.maxTo)} step="1" value={sizeValid ? amount : legal.minTo} disabled={!canSize} onChange={event => setSize(event.target.value)} />
        <div className="slider-labels"><span>Мин. {legal.minTo}</span><span>{legal.maxTo} max</span></div>
        <div className="bet-presets">{[0.5, 0.75, 1].map((value, index) => <button key={value} disabled={!canSize} onClick={() => preset(value)}>{['½ банка', '¾ банка', 'Банк'][index]}</button>)}</div>
        <div className="action-buttons"><button className="fold-button" disabled={!ready} onClick={() => onAction({ type: 'fold' })}>Fold</button><button className="call-button" disabled={!ready} onClick={() => onAction({ type: legal.toCall ? 'call' : 'check' })}>{legal.toCall ? <>Call <span>{legal.callAmount}</span></> : 'Check'}</button></div>
        <button className="primary-button raise-button" disabled={!canSize || !sizeValid} onClick={() => onAction({ type: sizingType, to: amount })}>{sizingType === 'bet' ? 'Bet' : 'Raise to'} {sizeValid ? amount : '—'}<ArrowUpRight size={19} /></button>
        <div className="decision-footer"><ShieldCheck size={13} />{ready ? `${streetLabels[game.street]} · только легальные действия` : 'Действия станут доступны в ваш ход'}</div>
      </>}
    </div>
    <div className="opponent-panel"><div className="opponent-title"><div className="ai-icon">✳</div><div><strong>AdaptiveAI</strong><span>Ваш партнёр по практике</span></div><span className="online-dot" /></div><div className="strategy-tag">Базовая стратегия <span>v0.1</span></div><p>Оценивает силу своей руки и шансы банка. Не видит ваши карты.</p></div>
    <div className="practice-tip"><CircleHelp size={16} /><p><strong>Каждое решение имеет значение.</strong>Размер ставки указан в фишках. Для рейза — итоговая ставка на текущей улице.</p></div>
  </aside>
}

export function SessionResetButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button className="text-button reset-button" disabled={disabled} onClick={onClick}><RotateCcw size={18} />Новая сессия<ChevronRight size={17} /></button>
}
