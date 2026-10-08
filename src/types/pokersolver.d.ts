declare module 'pokersolver' {
  export class Hand {
    readonly descr: string
    readonly rank: number
    readonly name: string
    static solve(cards: string[], game?: string): Hand
    static winners(hands: Hand[]): Hand[]
  }
}
