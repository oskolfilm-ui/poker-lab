import { cardText, suitSymbols, type Card as PlayingCard, type Suit } from '../game/cards'

export function Card({ card, hidden = false, small = false, placeholder = false }: { card?: PlayingCard; hidden?: boolean; small?: boolean; placeholder?: boolean }) {
  if (placeholder) return <div className={`playing-card placeholder ${small ? 'small' : ''}`} aria-hidden="true"><span>♠</span></div>
  if (hidden || !card) return <div className={`playing-card card-back ${small ? 'small' : ''}`} aria-label="Закрытая карта"><span>♠</span></div>
  const suit = card[1] as Suit
  const rank = card[0] === 'T' ? '10' : card[0]
  return <div className={`playing-card ${suit === 'h' || suit === 'd' ? 'red' : 'black'} ${small ? 'small' : ''}`} aria-label={cardText(card)}>
    <div className="card-corner"><strong>{rank}</strong><span>{suitSymbols[suit]}</span></div>
    <span className="card-suit">{suitSymbols[suit]}</span>
    <div className="card-corner lower"><strong>{rank}</strong><span>{suitSymbols[suit]}</span></div>
  </div>
}
