import { Bot, UserRound, Check, Trophy } from 'lucide-react'
import { Card } from './Card'
import { potSize, streetLabels, type GameState, type PlayerIndex } from '../game/engine'

export function ChipStack({ amount, subtle = false }: { amount: number; subtle?: boolean }) {
  return <div className={`chip-bet ${subtle ? 'subtle' : ''}`}><span className="chip-stack" aria-hidden="true"><i /><i /><i /></span><span>{amount}</span></div>
}

function Seat({ game, index }: { game: GameState; index: PlayerIndex }) {
  const player = game.players[index]
  const active = game.toAct === index
  const won = !!game.result?.winners.includes(index)
  const reveal = index === 0 || game.result?.reason === 'showdown'
  const lastAction = [...game.events].reverse().find(event => event.type === 'action' && event.player === index)
  const labels = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' }
  const status = game.result ? (won ? 'Победитель' : 'Раздача завершена') : active ? (index === 0 ? 'Ваш ход' : 'Принимает решение…') : player.stack === 0 ? 'All-in' : lastAction?.type === 'action' ? labels[lastAction.action] : index === game.dealer ? 'Малый блайнд' : 'Большой блайнд'
  return <div className={`seat seat-${index === 0 ? 'hero' : 'ai'} ${active ? 'active' : ''} ${won ? 'winner' : ''}`}>
    <div className="seat-cards">{player.hole.map((card, key) => <Card key={key} card={card} hidden={!reveal} />)}</div>
    <div className="seat-info">
      <div className="seat-avatar">{won ? <Trophy size={21} /> : index === 0 ? <UserRound size={22} /> : <Bot size={23} />}</div>
      <div className="seat-text"><div className="seat-name">{player.name}{index === 0 && <span>вы</span>}</div><div className="seat-stack"><strong data-testid={`stack-${index}`}>{player.stack}</strong><span>СТЕК · {(player.stack / 2).toLocaleString('ru-RU')} BB</span></div></div>
      {index === game.dealer && <span className="dealer" title="Button / Small Blind" aria-label={`${player.name}: Button / Small Blind`}>D</span>}
    </div>
    <div className={`seat-status ${active ? 'live' : ''}`}>{active && index === 1 ? <span className="thinking-dots"><i /><i /><i /></span> : won ? <Check size={12} /> : <span className="status-dot" />}{status}</div>
    <div className="seat-bet" aria-label={`${player.name}: текущая ставка`}><span className="bet-caption">СТАВКА</span><div data-testid={`bet-${index}`}><ChipStack amount={game.result ? 0 : player.streetBet} /></div></div>
  </div>
}

export function PokerTable({ game }: { game: GameState }) {
  const pot = game.result?.pot ?? potSize(game)
  return <div className="table-scene">
    <div className="table-grain" />
    <div className="table-corner"><span className="live-dot" /> PRACTICE TABLE <span>01</span></div>
    <div className="table-format">NO-LIMIT HOLD’EM <span>1 / 2</span></div>
    <div className="felt"><div className="felt-line" /><div className="felt-brand">POKER LAB</div></div>
    <Seat game={game} index={1} />
    <div className="community">
      <div className="pot-label">{game.result ? 'POT · ИТОГ' : 'POT'}</div>
      <div className="pot-amount"><span className="pot-chip" /><strong data-testid="pot">{pot}</strong><span>фишек</span></div>
      <div className="community-cards" aria-label="Общие карты">{Array.from({ length: 5 }, (_, index) => <Card key={index} card={game.board[index]} placeholder={!game.board[index]} />)}</div>
      <div className="street-label">{game.result ? (game.result.reason === 'fold' ? 'Победа без вскрытия' : 'Вскрытие') : streetLabels[game.street]}<span>·</span>{game.board.length}/5 карт</div>
    </div>
    <Seat game={game} index={0} />
    <div className="table-footnote">Тренировочная игра<span>Без реальных денег</span></div>
  </div>
}
