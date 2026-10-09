declare module 'phe' {
  const phe: { evaluateCardCodes(cards: number[]): number; evaluateCards(cards: string[]): number; rankCards(cards: string[]): number; cardCode(rank: string, suit: string): number }
  export default phe
}
