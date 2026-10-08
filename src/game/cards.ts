import { Hand } from 'pokersolver'

export const RANKS = '23456789TJQKA'
export const SUITS = ['s', 'h', 'd', 'c'] as const
export type Suit = typeof SUITS[number]
export type Card = `${string}${Suit}`
export type Random = () => number

export const secureRandom: Random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32

export function createDeck(): Card[] {
  return [...RANKS].flatMap(rank => SUITS.map(suit => `${rank}${suit}` as Card))
}

export function shuffle<T>(items: readonly T[], random: Random = secureRandom): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// pokersolver supports 5–7 cards and handles kickers, wheels and board ties.
export function evaluate(cards: readonly Card[]) {
  if (cards.length < 5 || cards.length > 7 || new Set(cards).size !== cards.length) {
    throw new Error('Для оценки нужны 5–7 различных карт.')
  }
  return Hand.solve([...cards])
}

export function compareHands(first: readonly Card[], second: readonly Card[]): 0 | 1 | 'tie' {
  const hands = [evaluate(first), evaluate(second)]
  const winners = Hand.winners(hands)
  return winners.length === 2 ? 'tie' : winners[0] === hands[0] ? 0 : 1
}

export const suitSymbols: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
export const cardText = (card: Card) => `${card[0] === 'T' ? '10' : card[0]}${suitSymbols[card[1] as Suit]}`
export const trackerCard = (card: Card) => card[0] === 'T' ? `T${card[1]}` : card
