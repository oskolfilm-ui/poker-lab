import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, ChevronRight, CircleAlert, History as HistoryIcon, Layers3, LayoutGrid, ShieldCheck, Spade, TrendingUp, X } from 'lucide-react'
import { applyAction, startHand, type Action, type GameState } from './game/engine'
import { advanceHand, matchWinner, type HandContext } from './game/match'
import { decisionView } from './game/ai/view'
import type { AIRequest, AIResponse } from './game/ai/protocol'
import { AISettings } from './components/AISettings'
import { useDifficulty } from './hooks/useDifficulty'
import { PokerTable } from './components/PokerTable'
import { MatchScoreboard } from './components/MatchScoreboard'
import { ResultsChart } from './components/ResultsChart'
import { ActionPanel, SessionResetButton } from './components/ActionPanel'
import { ConfirmDialog } from './components/ConfirmDialog'
import { History, eventText } from './components/History'
import { useHistory } from './hooks/useHistory'
import { useAutoAdvance } from './hooks/useAutoAdvance'
import { resetMatchScore } from './history/store'

const SESSION_KEY = 'poker-lab-session-v1'
const CONTEXT_KEY = 'poker-lab-context-v1'
interface Session { game: GameState; context: HandContext; paused: boolean }
const newContext = (): HandContext => ({ sessionId: crypto.randomUUID(), matchId: crypto.randomUUID() })
function initialSession(): Session {
  let game = startHand()
  let context = newContext()
  let paused = false
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as GameState | null
    if (stored?.schemaVersion === 1 && stored.players.length === 2 && stored.players.every(player => Number.isSafeInteger(player.stack) && player.stack >= 0) && Array.isArray(stored.deck) && Array.isArray(stored.events)) game = stored
    const metadata = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) ?? 'null')
    if (metadata && typeof metadata.sessionId === 'string' && typeof metadata.matchId === 'string') {
      context = { sessionId: metadata.sessionId, matchId: metadata.matchId }; paused = metadata.paused === true
    }
  } catch { /* A fresh session is safe when browser storage is unavailable. */ }
  return { game, context, paused }
}

export default function App() {
  const [session, setSession] = useState<Session>(initialSession)
  const { game, context, paused } = session
  const [view, setView] = useState<'practice' | 'history'>('practice')
  const [dialog, setDialog] = useState<'session' | 'score' | null>(null)
  const [resettingScore, setResettingScore] = useState(false)
  const [error, setError] = useState('')
  const [sessionWarning, setSessionWarning] = useState(false)
  const { hands, statistics, profile: heroProfile, status, savedHandId, retry } = useHistory(game, context)
  const ai = useDifficulty()
  const saved = !!game.result && status === 'saved' && savedHandId === game.id
  const winner = matchWinner(game)
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(game))
      sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ ...context, paused }))
    } catch { setSessionWarning(true) }
  }, [game, context, paused])
  useEffect(() => {
    if (game.toAct !== 1 || game.result || dialog || !ai.ready) return
    const snapshot = game
    let worker: Worker | undefined
    const timeout = window.setTimeout(() => {
      try {
        worker = new Worker(new URL('./game/ai.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<AIResponse>) => {
          worker?.terminate()
          try {
            if ('error' in event.data) throw new Error(event.data.error)
            const updated = applyAction(snapshot, 1, event.data.action)
            setSession(current => current.game === snapshot ? { ...current, game: updated } : current)
          } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить ход ИИ.') }
        }
        worker.onerror = () => { worker?.terminate(); setError('Не удалось загрузить стратегию ИИ. Перезагрузите страницу.') }
        worker.postMessage({ view: decisionView(snapshot, 1), difficulty: ai.difficulty, profile: heroProfile } satisfies AIRequest)
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить ход ИИ.') }
    }, 1000)
    return () => { window.clearTimeout(timeout); worker?.terminate() }
  }, [game, dialog, ai.ready, ai.difficulty, heroProfile])
  const act = (action: Action) => {
    try { setSession({ ...session, game: applyAction(game, 0, action) }); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие.') }
  }
  const beginNext = () => {
    if (!saved) return
    try {
      const updated = advanceHand(game)
      setSession(current => current.game.id !== game.id ? current : {
        ...current, game: updated,
        context: winner === null ? current.context : { ...current.context, matchId: crypto.randomUUID() },
      })
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось начать раздачу.') }
  }
  const seconds = useAutoAdvance(game.id, !!game.result, !paused && view === 'practice' && !dialog && !error, saved, beginNext)
  const clearScore = async () => {
    setResettingScore(true)
    try { await resetMatchScore(); setDialog(null) }
    catch { setError('Не удалось сбросить счёт матчей в IndexedDB. Попробуйте ещё раз.') }
    finally { setResettingScore(false) }
  }
  const net = (game.result ? game.players[0].stack : game.players[0].initialStack) - 200
  const recent = game.events.filter(event => event.type !== 'blind').slice(-3)
  const scoreboard = <MatchScoreboard statistics={statistics} winner={winner} paused={paused} canReset={status === 'saved' && !resettingScore} onPause={() => setSession(current => ({ ...current, paused: !current.paused }))} onReset={() => setDialog('score')} />
  return <>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={() => setView('practice')} aria-label="POKER LAB — тренировка"><span className="brand-mark"><Spade size={23} fill="currentColor" /></span><span>POKER<span>LAB</span></span><span className="brand-divider" /></button><nav aria-label="Главная навигация"><button className={view === 'practice' ? 'selected' : ''} onClick={() => setView('practice')}><LayoutGrid size={18} />Тренировка</button><button className={view === 'history' ? 'selected' : ''} onClick={() => setView('history')}><HistoryIcon size={18} />История рук{hands.length > 0 && <span className="nav-count">{hands.length}</span>}</button></nav><div className="header-status"><span className="tiny-dot green" />Ваше пространство для практики</div><button className="profile" aria-label="Игрок Hero" title="Hero · локальная сессия">H</button></div></header>
    <main className="app-main">
      {(error || status === 'error' || sessionWarning) && <div className="error-banner" role="alert"><CircleAlert size={20} /><span>{error || (status === 'error' ? 'IndexedDB недоступна: история и статистика ожидают сохранения. Автопереход остановлен; руки доступны для экспорта.' : 'Браузер не позволяет восстановить сессию после перезагрузки. История в IndexedDB сохраняется отдельно.')}</span>{status === 'error' && <button onClick={retry}>Повторить сохранение</button>}{error && <button onClick={() => setError('')} aria-label="Закрыть сообщение"><X size={18} /></button>}</div>}
      {view === 'practice' && <section className="section-heading"><div><div className="eyebrow"><span />МЕНЬШЕ СЛУЧАЙНОСТИ. БОЛЬШЕ ПРАКТИКИ.</div><h1>Покер — это решения<span>.</span></h1><p>Один на один с ИИ. Ваш темп. Пространство для роста.</p></div><div className="practice-badge"><span className="practice-badge-icon"><ShieldCheck size={24} /></span><div>Свободная практика<span>Без реальных денег</span></div></div></section>}
      <section className="session-stats" aria-label="Статистика раздач">
        <div className="session-label"><span className="stat-icon"><TrendingUp size={22} /></span><div>Текущая сессия<span>Hero vs AdaptiveAI</span></div></div>
        <div className="stat"><span>Всего раздач</span><strong data-testid="total-hands">{statistics.totalHands}</strong></div>
        <div className="stat"><span>Раздач в сессии</span><strong data-testid="session-hands">{statistics.sessionHands}</strong></div>
        <div className="stat"><span>Результат Hero в матче</span><strong className={net < 0 ? 'text-negative' : 'text-positive'}>{net > 0 ? '+' : ''}{net}<small> фишек</small></strong></div>
        <SessionResetButton disabled={!!game.result && !saved} onClick={() => setDialog('session')} />
      </section>
      {view === 'practice' ? <>
        <AISettings difficulty={ai.difficulty} profile={heroProfile} disabled={!ai.ready || ai.saving} error={ai.error} onChange={value => void ai.change(value)} />
        <div className="play-surface">{scoreboard}
        <section className="game-layout" aria-label="Покерный тренажёр"><div className="table-column"><div className="table-heading"><div><span className="table-tab"><Layers3 size={19} />Heads-up</span><span className="table-heading-secondary">2 игрока · 100 BB старт</span></div><div className="hand-number">Раздача <strong>#{String(game.number).padStart(3, '0')}</strong></div></div><PokerTable game={game} difficulty={ai.difficulty} /><div className="table-activity" aria-live="polite"><span className="activity-label">ЗА СТОЛОМ</span><div>{recent.length ? recent.map((event, index) => <span key={`${game.id}-${game.events.length}-${index}`} className={index === recent.length - 1 ? 'latest-event' : ''}>{eventText(event)}</span>) : <span>Блайнды поставлены. Карты розданы — можно начинать.</span>}</div></div><div className="table-bottom"><span><ShieldCheck size={17} />{status === 'saving' ? 'Сохраняем историю и статистику…' : status === 'error' ? 'История ожидает сохранения' : 'История рук сохраняется автоматически'}</span><button className="text-button" onClick={() => setView('history')}>Открыть историю<ArrowUpRight size={17} /></button></div></div><ActionPanel difficulty={ai.difficulty} game={game} onAction={act} onNext={beginNext} saving={!saved} paused={paused} seconds={seconds} /></section></div>
        <div className="practice-bottom"><div><span className="small-spade">♠</span><p><strong>Практика сегодня. Уверенность за столом завтра.</strong>Играйте, пробуйте разные линии и находите свой подход.</p></div><span><Check size={16} />Локально в вашем браузере</span></div>
      </> : <>{scoreboard}<History hands={hands} loading={status === 'loading'} onPractice={() => setView('practice')} /></>}
      <ResultsChart hands={hands} sessionId={context.sessionId} loading={status === 'loading'} />
    </main>
    <footer className="site-footer"><span>POKER LAB<span className="footer-version">v{__APP_VERSION__} · {__BUILD_REVISION__.slice(0, 7)}</span></span><span>Создано для осознанной игры.</span><span>TRAINING ONLY<ChevronRight size={16} /></span></footer>
    {dialog === 'session' && <ConfirmDialog title="Начнём новую сессию?" description={`У каждого игрока снова будет 200 фишек, счётчик раздач в сессии обнулится.${!game.result ? ' Незавершённая раздача не попадёт в историю.' : ''} Общий счёт матчей, всего раздач и история сохранятся.`} confirmLabel="Новая сессия" onClose={() => setDialog(null)} onConfirm={() => { setSession({ game: startHand(), context: newContext(), paused }); setDialog(null); setError('') }} />}
    {dialog === 'score' && <ConfirmDialog title="Сбросить общий счёт матчей?" description="Счёт HERO : AI станет 0 : 0. История рук, оба счётчика раздач и текущий матч сохранятся." confirmLabel="Сбросить счёт" busy={resettingScore} onClose={() => setDialog(null)} onConfirm={() => void clearScore()} />}
  </>
}
