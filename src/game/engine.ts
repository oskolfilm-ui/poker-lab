import { compareHands, createDeck, evaluate, secureRandom, shuffle, type Card, type Random } from './cards'
import { calculateRake, validRake, type RakeConfig } from './rake'

export type PlayerIndex = 0 | 1
export type Street = 'preflop' | 'flop' | 'turn' | 'river'
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'
export type Action = { type: ActionType; to?: number }
export const BLINDS = { small: 1, big: 2 } as const
export const other = (player: PlayerIndex): PlayerIndex => player === 0 ? 1 : 0
export const streetLabels: Record<Street, string> = { preflop: 'Префлоп', flop: 'Флоп', turn: 'Тёрн', river: 'Ривер' }

export interface Player {
  name: 'Hero' | 'AdaptiveAI'
  stack: number
  initialStack: number
  hole: Card[]
  streetBet: number
  committed: number
}

export type HandEvent =
  | { type: 'blind'; player: PlayerIndex; kind: 'small' | 'big'; amount: number; allIn: boolean }
  | { type: 'action'; player: PlayerIndex; action: ActionType; street: Street; amount: number; to: number; raiseBy: number; allIn: boolean }
  | { type: 'board'; street: Exclude<Street, 'preflop'>; cards: Card[] }
  | { type: 'return'; player: PlayerIndex; amount: number; street: Street }
  | { type: 'showdown'; player: PlayerIndex; cards: Card[]; description: string }
  | { type: 'award'; player: PlayerIndex; amount: number }

export interface HandResult {
  reason: 'fold' | 'showdown'
  winners: PlayerIndex[]
  payouts: [number, number]
  pot: number
  descriptions: [string, string] | null
  rake?: number
}

export interface GameState {
  schemaVersion: 1
  id: string
  number: number
  startedAt: string
  endedAt: string | null
  dealer: PlayerIndex
  players: [Player, Player]
  board: Card[]
  deck: Card[]
  street: Street
  toAct: PlayerIndex | null
  currentBet: number
  minRaise: number
  acted: [boolean, boolean]
  raiseAllowed: [boolean, boolean]
  events: HandEvent[]
  result: HandResult | null
  rakeConfig?: RakeConfig
}

export interface LegalActions {
  actions: ActionType[]
  toCall: number
  callAmount: number
  minTo: number
  maxTo: number
}

export const potSize = (state: GameState) => state.players[0].committed + state.players[1].committed
export const chipsInPlay = (state: GameState) => state.players[0].stack + state.players[1].stack + (state.result ? state.result.rake ?? 0 : potSize(state))

export function legalActions(state: GameState, player: PlayerIndex): LegalActions {
  const actor = state.players[player]
  const opponent = state.players[other(player)]
  const toCall = Math.max(0, state.currentBet - actor.streetBet)
  const maxTo = actor.streetBet + actor.stack
  const minTo = state.currentBet === 0 ? BLINDS.big : state.currentBet + state.minRaise
  const actions: ActionType[] = []
  if (!state.result && state.toAct === player && actor.stack > 0) {
    actions.push('fold', toCall === 0 ? 'check' : 'call')
    if (state.raiseAllowed[player] && opponent.stack > 0 && maxTo >= minTo) {
      actions.push(state.currentBet === 0 ? 'bet' : 'raise')
    }
    if (maxTo <= state.currentBet || (state.raiseAllowed[player] && opponent.stack > 0)) actions.push('allin')
  }
  return { actions, toCall, callAmount: Math.min(toCall, actor.stack), minTo, maxTo }
}

function pay(state: GameState, player: PlayerIndex, amount: number) {
  const actor = state.players[player]
  actor.stack -= amount
  actor.streetBet += amount
  actor.committed += amount
}

function returnUncalled(state: GameState) {
  const difference = state.players[0].streetBet - state.players[1].streetBet
  if (difference === 0) return
  const player: PlayerIndex = difference > 0 ? 0 : 1
  const amount = Math.abs(difference)
  state.players[player].stack += amount
  state.players[player].streetBet -= amount
  state.players[player].committed -= amount
  state.events.push({ type: 'return', player, amount, street: state.street })
}

function finish(state: GameState, folded?: PlayerIndex) {
  if (state.result) return
  returnUncalled(state)
  let winners: PlayerIndex[]
  let descriptions: [string, string] | null = null
  if (folded !== undefined) {
    winners = [other(folded)]
  } else {
    const cards = state.players.map(player => [...player.hole, ...state.board])
    const comparison = compareHands(cards[0], cards[1])
    winners = comparison === 'tie' ? [0, 1] : [comparison]
    descriptions = [evaluate(cards[0]).descr, evaluate(cards[1]).descr]
    for (const player of [0, 1] as const) {
      state.events.push({ type: 'showdown', player, cards: state.players[player].hole, description: descriptions[player] })
    }
  }
  const pot = potSize(state)
  const rake = calculateRake(pot, state.board.length >= 3, state.rakeConfig)
  const distributable = pot - rake
  const payouts: [number, number] = [0, 0]
  for (const player of winners) payouts[player] = Math.floor(distributable / winners.length)
  // The first seat clockwise from the button receives the odd chip.
  if (distributable % winners.length) payouts[other(state.dealer)]++
  for (const player of [0, 1] as const) {
    state.players[player].stack += payouts[player]
    if (payouts[player]) state.events.push({ type: 'award', player, amount: payouts[player] })
  }
  state.result = { reason: folded === undefined ? 'showdown' : 'fold', winners, payouts, pot, descriptions, rake }
  state.toAct = null
  state.endedAt = new Date().toISOString()
}

function dealStreet(state: GameState) {
  const next = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'river' }[state.street] as Exclude<Street, 'preflop'>
  state.deck.pop() // Burn one card before every community street.
  const count = next === 'flop' ? 3 : 1
  for (let i = 0; i < count; i++) state.board.push(state.deck.pop()!)
  state.street = next
  state.events.push({ type: 'board', street: next, cards: [...state.board] })
  for (const player of state.players) player.streetBet = 0
  state.currentBet = 0
  state.minRaise = BLINDS.big
  state.acted = [false, false]
  state.raiseAllowed = [true, true]
  state.toAct = other(state.dealer)
}

function closeStreet(state: GameState, runout: boolean) {
  returnUncalled(state)
  if (runout) {
    while (state.street !== 'river') dealStreet(state)
    finish(state)
  } else if (state.street === 'river') {
    finish(state)
  } else {
    dealStreet(state)
  }
}

function settle(state: GameState, lastActor: PlayerIndex) {
  if (state.players.some(player => player.stack === 0)) {
    const pending = ([0, 1] as const).find(player => state.players[player].stack > 0 && state.players[player].streetBet < state.currentBet)
    if (pending !== undefined) state.toAct = pending
    else closeStreet(state, true)
  } else if (state.acted.every(Boolean) && state.players[0].streetBet === state.players[1].streetBet) {
    closeStreet(state, false)
  } else {
    state.toAct = other(lastActor)
  }
}

export interface StartHandOptions {
  number?: number
  dealer?: PlayerIndex
  stacks?: [number, number]
  random?: Random
  /** A full deck, with the next card at the end; useful for deterministic replay/testing. */
  deck?: Card[]
  id?: string
  startedAt?: string
  rakeConfig?: RakeConfig
}

export function startHand(options: StartHandOptions = {}): GameState {
  if (options.rakeConfig && !validRake(options.rakeConfig)) throw new Error('Некорректная настройка рейка.')
  const stacks = options.stacks ?? [200, 200]
  if (stacks.some(stack => !Number.isSafeInteger(stack) || stack < 1)) throw new Error('Оба игрока должны иметь фишки.')
  const dealer = options.dealer ?? 0
  const deck = options.deck ? [...options.deck] : shuffle(createDeck(), options.random)
  const validCards = new Set(createDeck())
  if (deck.length !== 52 || new Set(deck).size !== 52 || deck.some(card => !validCards.has(card))) throw new Error('Некорректная колода.')
  const makePlayer = (index: PlayerIndex): Player => ({ name: index === 0 ? 'Hero' : 'AdaptiveAI', stack: stacks[index], initialStack: stacks[index], hole: [], streetBet: 0, committed: 0 })
  const state: GameState = {
    schemaVersion: 1,
    id: options.id ?? `${Date.now()}${Math.floor(secureRandom() * 1_000_000).toString().padStart(6, '0')}`,
    number: options.number ?? 1,
    startedAt: options.startedAt ?? new Date().toISOString(),
    endedAt: null,
    dealer,
    players: [makePlayer(0), makePlayer(1)],
    board: [], deck, street: 'preflop', toAct: dealer,
    ...(options.rakeConfig ? { rakeConfig: { ...options.rakeConfig } } : {}),
    currentBet: 0, minRaise: BLINDS.big, acted: [false, false], raiseAllowed: [true, true], events: [], result: null,
  }
  for (let round = 0; round < 2; round++) {
    for (const player of [other(dealer), dealer]) state.players[player].hole.push(state.deck.pop()!)
  }
  for (const player of [dealer, other(dealer)]) {
    const kind = player === dealer ? 'small' : 'big'
    const amount = Math.min(state.players[player].stack, BLINDS[kind])
    pay(state, player, amount)
    state.events.push({ type: 'blind', player, kind, amount, allIn: state.players[player].stack === 0 })
  }
  state.currentBet = Math.max(...state.players.map(player => player.streetBet))
  if (state.players.some(player => player.stack === 0)) settle(state, other(dealer))
  return state
}

/** Pure transition: the input is never mutated. Bet/raise `to` is the TOTAL for this street. */
export function applyAction(input: GameState, player: PlayerIndex, action: Action): GameState {
  const legal = legalActions(input, player)
  if (!legal.actions.includes(action.type)) throw new Error('Это действие сейчас недоступно.')
  if (action.type === 'bet' || action.type === 'raise') {
    if (!Number.isSafeInteger(action.to) || action.to! < legal.minTo || action.to! > legal.maxTo) throw new Error('Недопустимый размер ставки.')
  }
  const state = structuredClone(input)
  const actor = state.players[player]
  let amount = 0
  let raiseBy = 0
  if (action.type === 'call') amount = legal.callAmount
  else if (action.type === 'allin') amount = actor.stack
  else if (action.type === 'bet' || action.type === 'raise') amount = action.to! - actor.streetBet
  if (amount > 0) pay(state, player, amount)
  if (actor.streetBet > state.currentBet) {
    raiseBy = actor.streetBet - state.currentBet
    if (raiseBy >= state.minRaise) {
      state.minRaise = raiseBy
      state.acted = [false, false]
      state.raiseAllowed = [true, true]
    } else if (state.acted[other(player)]) {
      state.raiseAllowed[other(player)] = false
    }
    state.currentBet = actor.streetBet
  }
  state.acted[player] = true
  state.raiseAllowed[player] = false
  state.events.push({ type: 'action', player, action: action.type, street: state.street, amount, to: actor.streetBet, raiseBy, allIn: actor.stack === 0 })
  if (action.type === 'fold') finish(state, player)
  else settle(state, player)
  return state
}

export function nextHand(state: GameState, rakeConfig = state.rakeConfig): GameState {
  if (!state.result) throw new Error('Сначала завершите текущую раздачу.')
  return startHand({ number: state.number + 1, dealer: other(state.dealer), stacks: [state.players[0].stack, state.players[1].stack], rakeConfig })
}
