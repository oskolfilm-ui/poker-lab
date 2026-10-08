import { useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, ChevronDown, Clock3, Database, Search, Spade } from 'lucide-react'
import { Card } from './Card'
import { cardText } from '../game/cards'
import { streetLabels, type HandEvent } from '../game/engine'
import { downloadHands, handNet, positionLabel } from '../history/export'
import type { CompletedHand } from '../history/store'

export function eventText(event: HandEvent): string {
  const name = 'player' in event ? (event.player === 0 ? 'Hero' : 'AdaptiveAI') : ''
  if (event.type === 'blind') return `${name} · ${event.kind === 'small' ? 'SB' : 'BB'} ${event.amount}${event.allIn ? ' · All-in' : ''}`
  if (event.type === 'board') return `${streetLabels[event.street]} · ${event.cards.map(cardText).join(' ')}`
  if (event.type === 'return') return `${name} · Возврат ${event.amount}`
  if (event.type === 'showdown') return `${name} · ${event.description}`
  if (event.type === 'award') return `${name} · Получает ${event.amount}`
  const label = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise to', allin: 'All-in' }[event.action]
  return `${name} · ${label}${['fold', 'check'].includes(event.action) ? '' : ` ${event.action === 'raise' || event.action === 'allin' ? event.to : event.amount}`}${event.allIn && event.action !== 'allin' ? ' · All-in' : ''}`
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function History({ hands, loading, onPractice }: { hands: CompletedHand[]; loading: boolean; onPractice: () => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const filtered = hands.filter(hand => {
    const matchFilter = filter === 'all' || (filter === 'hero' && handNet(hand) > 0) || (filter === 'ai' && handNet(hand) < 0) || (filter === 'split' && hand.result.winners.length === 2)
    return matchFilter && (`${hand.id} ${hand.number} ${hand.players[0].hole.map(cardText).join(' ')} ${hand.startedAt}`).toLowerCase().includes(query.toLowerCase())
  })
  return <section className="history-view">
    <div className="section-heading history-heading"><div><div className="eyebrow">ВАША ПОКЕРНАЯ БИБЛИОТЕКА</div><h1>Каждая раздача — новый урок<span>.</span></h1><p>Возвращайтесь к решениям, изучайте линии и забирайте историю с собой.</p></div><button className="primary-button export-button" disabled={!hands.length} onClick={() => downloadHands(hands)}><ArrowDownToLine size={17} />Экспорт TXT<span>{hands.length}</span></button></div>
    <div className="history-info"><Database size={19} /><div><strong>История хранится в этом браузере</strong><p>IndexedDB · только завершённые раздачи. Экспортируйте резервную копию перед очисткой данных браузера.</p></div><span className="local-badge">ЛОКАЛЬНО</span></div>
    <div className="history-card">
      <div className="history-toolbar"><h2>История рук <span>{hands.length}</span></h2><div className="history-filters"><label className="search-input"><Search size={16} /><input aria-label="Поиск раздачи" placeholder="Номер, карты или дата" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Фильтр результата" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Все результаты</option><option value="hero">Hero выиграл</option><option value="ai">AdaptiveAI выиграл</option><option value="split">Банк разделён</option></select></div></div>
      {!filtered.length ? <div className="history-empty"><div><Spade size={35} strokeWidth={1.4} /></div><h3>{loading ? 'Загружаем историю…' : hands.length ? 'Раздачи не найдены' : 'Первая раздача ждёт вас'}</h3><p>{hands.length ? 'Попробуйте другой поиск или фильтр.' : 'Завершённые руки автоматически появятся здесь.'}</p>{!hands.length && !loading && <button className="primary-button" onClick={onPractice}>За стол<ArrowUpRight size={17} /></button>}</div> : <>
        <div className="history-row history-columns"><span>РАЗДАЧА / ВРЕМЯ</span><span>ВАША РУКА</span><span>БАНК</span><span>РЕЗУЛЬТАТ</span><span /></div>
        {filtered.map(hand => {
          const net = handNet(hand)
          const open = expanded === hand.id
          return <div className="hand-entry" key={hand.id}><button className={`history-row ${open ? 'expanded' : ''}`} onClick={() => setExpanded(open ? null : hand.id)} aria-expanded={open} aria-label={`Раздача ${hand.number}, ${net > 0 ? '+' : ''}${net} фишек`}>
            <span className="hand-time"><strong>Раздача #{hand.number}<small>{positionLabel(hand.dealer)}</small></strong><span><Clock3 size={11} />{dateFormat.format(new Date(hand.startedAt))}</span></span>
            <span className="history-hole">{hand.players[0].hole.map(card => <Card key={card} card={card} small />)}</span>
            <span className="history-pot">{hand.result.pot}<small> фишек</small></span>
            <span className={`history-result ${net >= 0 ? 'text-positive' : 'text-negative'}`}>{net > 0 ? '+' : ''}{net}<small>{hand.result.winners.length === 2 ? 'Сплит' : net > 0 ? 'Выигрыш' : 'Проигрыш'}</small></span>
            <ChevronDown size={18} className={open ? 'rotated' : ''} />
          </button>{open && <div className="hand-detail"><div className="detail-cards"><div><span className="eyebrow">ОБЩИЕ КАРТЫ</span><div>{hand.board.length ? hand.board.map(card => <Card key={card} card={card} small />) : <p>Раздача завершилась на префлопе</p>}</div></div>{hand.result.reason === 'showdown' && <div><span className="eyebrow">ADAPTIVEAI · ВСКРЫТИЕ</span><div>{hand.players[1].hole.map(card => <Card key={card} card={card} small />)}</div></div>}<button className="text-button" onClick={() => downloadHands([hand])}><ArrowDownToLine size={15} />Экспорт руки</button></div><ol className="event-list">{hand.events.map((event, index) => <li key={index} className={event.type === 'board' ? 'street-event' : ''}><span>{String(index + 1).padStart(2, '0')}</span>{eventText(event)}</li>)}</ol><div className="detail-id">ID: {hand.id} · TRAINING · Rake 0</div></div>}</div>
        })}
      </>}
    </div>
    <div className="export-disclaimer"><span className="format-icon">TXT</span><p><strong>PokerStars-style · тренировочные раздачи</strong>Это симуляция POKER LAB, а не реальные игры PokerStars. Целевой трекер — Hand2Note 4; совместимость не подтверждена до реального теста импорта.</p><span className="unverified-badge">H2N4 · НЕ ПРОВЕРЕНО</span></div>
  </section>
}
