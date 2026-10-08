import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, ChevronRight, CircleAlert, History as HistoryIcon, Layers3, LayoutGrid, RefreshCw, ShieldCheck, Spade, TrendingUp, X } from 'lucide-react'
import { applyAction, nextHand, startHand, streetLabels, type Action, type GameState } from './game/engine'
import { chooseAction, decisionView } from './game/ai'
import { PokerTable } from './components/PokerTable'
import { ActionPanel, SessionResetButton } from './components/ActionPanel'
import { History, eventText } from './components/History'
import { useHistory } from './hooks/useHistory'

const SESSION_KEY = 'poker-lab-session-v1'
function initialGame(): GameState {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as GameState | null
    if (stored?.schemaVersion === 1 && stored.players.length === 2 && stored.players.every(player => Number.isSafeInteger(player.stack) && player.stack >= 0) && Array.isArray(stored.deck) && Array.isArray(stored.events)) return stored
  } catch { /* A fresh session is safe when browser storage is unavailable. */ }
  return startHand()
}

function ResetDialog({ onClose, onConfirm, unfinished }: { onClose: () => void; onConfirm: () => void; unfinished: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="reset-dialog" onCancel={onClose} aria-labelledby="reset-title"><button className="dialog-close icon-button" onClick={onClose} aria-label="Закрыть"><X size={19} /></button><div className="reset-symbol"><RefreshCw size={24} /></div><h2 id="reset-title">Начнём с чистого стека?</h2><p>У каждого игрока снова будет 200 фишек.{unfinished ? ' Незавершённая раздача не попадёт в историю.' : ''} Сохранённые руки останутся в истории.</p><div><button className="secondary-button" autoFocus onClick={onClose}>Продолжить игру</button><button className="primary-button" onClick={onConfirm}>Новая сессия</button></div></dialog>
}

export default function App() {
  const [game, setGame] = useState<GameState>(initialGame)
  const [view, setView] = useState<'practice' | 'history'>('practice')
  const [resetOpen, setResetOpen] = useState(false)
  const [error, setError] = useState('')
  const [sessionWarning, setSessionWarning] = useState(false)
  const { hands, status, retry } = useHistory(game)
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(game)) } catch { setSessionWarning(true) }
  }, [game])
  useEffect(() => {
    if (game.toAct !== 1 || game.result) return
    const snapshot = game
    const timeout = window.setTimeout(() => {
      try {
        const action = chooseAction(decisionView(snapshot, 1))
        setGame(current => current === snapshot ? applyAction(current, 1, action) : current)
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить ход ИИ.') }
    }, 1000)
    return () => window.clearTimeout(timeout)
  }, [game])
  const act = (action: Action) => {
    try { setGame(applyAction(game, 0, action)); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие.') }
  }
  const beginNext = () => {
    try { setGame(nextHand(game)); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось начать раздачу.') }
  }
  const net = (game.result ? game.players[0].stack : game.players[0].initialStack) - 200
  const finishedCount = game.number - (game.result ? 0 : 1)
  const recent = game.events.filter(event => event.type !== 'blind').slice(-3)
  const changeView = (next: 'practice' | 'history') => setView(next)
  return <>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={() => changeView('practice')} aria-label="POKER LAB — тренировка"><span className="brand-mark"><Spade size={23} fill="currentColor" /></span><span>POKER<span>LAB</span></span><span className="brand-divider" /></button><nav aria-label="Главная навигация"><button className={view === 'practice' ? 'selected' : ''} onClick={() => changeView('practice')}><LayoutGrid size={16} />Тренировка</button><button className={view === 'history' ? 'selected' : ''} onClick={() => changeView('history')}><HistoryIcon size={17} />История рук{hands.length > 0 && <span className="nav-count">{hands.length}</span>}</button></nav><div className="header-status"><span className="tiny-dot green" />Ваше пространство для практики</div><button className="profile" aria-label="Игрок Hero" title="Hero · локальная сессия">H</button></div></header>
    <main className="app-main">
      {(error || status === 'error' || sessionWarning) && <div className="error-banner" role="alert"><CircleAlert size={18} /><span>{error || (status === 'error' ? 'IndexedDB недоступна: история пока не сохранена в базе. Руки доступны для экспорта; повторите сохранение.' : 'Браузер не позволяет восстановить сессию после перезагрузки. История в IndexedDB сохраняется отдельно.')}</span>{status === 'error' && <button onClick={retry}>Повторить сохранение</button>}{error && <button onClick={() => setError('')} aria-label="Закрыть сообщение"><X size={16} /></button>}</div>}
      {view === 'practice' ? <>
        <section className="section-heading"><div><div className="eyebrow"><span />МЕНЬШЕ СЛУЧАЙНОСТИ. БОЛЬШЕ ПРАКТИКИ.</div><h1>Покер — это решения<span>.</span></h1><p>Один на один с ИИ. Ваш темп. Пространство для роста.</p></div><div className="practice-badge"><span className="practice-badge-icon"><ShieldCheck size={21} /></span><div>Свободная практика<span>Без реальных денег</span></div></div></section>
        <section className="session-stats" aria-label="Статистика сессии"><div className="session-label"><span className="stat-icon"><TrendingUp size={19} /></span><div>Текущая сессия<span>Hero vs AdaptiveAI</span></div></div><div className="stat"><span>Результат</span><strong className={net < 0 ? 'text-negative' : 'text-positive'}>{net > 0 ? '+' : ''}{net}<small> фишек</small></strong></div><div className="stat"><span>Сыграно рук</span><strong>{finishedCount.toString().padStart(2, '0')}<small> раздач</small></strong></div><div className="stat"><span>Блайнды</span><strong>1 / 2<small> NL Hold’em</small></strong></div><SessionResetButton onClick={() => setResetOpen(true)} /></section>
        <section className="game-layout" aria-label="Покерный тренажёр"><div className="table-column"><div className="table-heading"><div><span className="table-tab"><Layers3 size={16} />Heads-up</span><span className="table-heading-secondary">2 игрока · 100 BB старт</span></div><div className="hand-number">Раздача <strong>#{String(game.number).padStart(3, '0')}</strong><span className="tiny-dot" />{streetLabels[game.street]}</div></div><PokerTable game={game} /><div className="table-activity" aria-live="polite"><span className="activity-label">ЗА СТОЛОМ</span><div>{recent.length ? recent.map((event, index) => <span key={`${game.id}-${game.events.length}-${index}`} className={index === recent.length - 1 ? 'latest-event' : ''}>{eventText(event)}</span>) : <span>Блайнды поставлены. Карты розданы — можно начинать.</span>}</div></div><div className="table-bottom"><span><ShieldCheck size={14} />{status === 'saving' ? 'Сохраняем историю…' : status === 'error' ? 'История ожидает сохранения' : 'История рук сохраняется автоматически'}</span><button className="text-button" onClick={() => changeView('history')}>Открыть историю<ArrowUpRight size={14} /></button></div></div><ActionPanel game={game} onAction={act} onNext={beginNext} onReset={() => setResetOpen(true)} saving={status === 'saving'} /></section>
        <div className="practice-bottom"><div><span className="small-spade">♠</span><p><strong>Практика сегодня. Уверенность за столом завтра.</strong>Играйте, пробуйте разные линии и находите свой подход.</p></div><span><Check size={13} />Локально в вашем браузере</span></div>
      </> : <History hands={hands} loading={status === 'loading'} onPractice={() => changeView('practice')} />}
    </main>
    <footer className="site-footer"><span>POKER LAB<span className="footer-version">v0.1</span></span><span>Создано для осознанной игры.</span><span>TRAINING ONLY<ChevronRight size={12} /></span></footer>
    {resetOpen && <ResetDialog unfinished={!game.result} onClose={() => setResetOpen(false)} onConfirm={() => { setGame(startHand()); setResetOpen(false); setError('') }} />}
  </>
}
