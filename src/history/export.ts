import { trackerCard } from '../game/cards'
import { other, type HandEvent } from '../game/engine'
import type { CompletedHand } from './store'

export const TRAINING_NOTICE = '# POKER LAB — TRAINING ONLY. These are simulated hands, not real PokerStars games.\n# Unofficial PokerStars-style text export. Hand2Note 4 compatibility is UNVERIFIED pending a real import test.\n# Chips have no monetary value. No rake.\n'

const cards = (values: readonly string[]) => `[${values.map(value => trackerCard(value as Parameters<typeof trackerCard>[0])).join(' ')}]`
const dateUTC = (value: string) => new Date(value).toISOString().slice(0, 19).replace('T', ' ').replaceAll('-', '/') + ' UTC'

export function exportHand(hand: CompletedHand): string {
  const names = hand.players.map(player => player.name)
  const button = hand.dealer + 1
  const lines = [
    `PokerStars Hand #${hand.id}: Hold'em No Limit (1/2) - ${dateUTC(hand.startedAt)} [POKER LAB TRAINING]`,
    `Table 'POKER LAB TRAINING' 2-max Seat #${button} is the button`,
    ...hand.players.map((player, index) => `Seat ${index + 1}: ${player.name} (${player.initialStack} in chips)`),
  ]
  for (const event of hand.events.filter(event => event.type === 'blind')) {
    if (event.type === 'blind') lines.push(`${names[event.player]}: posts ${event.kind} blind ${event.amount}${event.allIn ? ' and is all-in' : ''}`)
  }
  lines.push('*** HOLE CARDS ***', `Dealt to Hero ${cards(hand.players[0].hole)}`)
  let showdown = false
  for (const event of hand.events) {
    if (event.type === 'action') {
      const prefix = `${names[event.player]}: `
      const suffix = event.allIn ? ' and is all-in' : ''
      if (event.action === 'fold') lines.push(prefix + 'folds')
      else if (event.action === 'check') lines.push(prefix + 'checks')
      else if (event.action === 'call' || (event.action === 'allin' && event.raiseBy === 0)) lines.push(prefix + `calls ${event.amount}${suffix}`)
      else if (event.raiseBy === event.to) lines.push(prefix + `bets ${event.amount}${suffix}`)
      else lines.push(prefix + `raises ${event.raiseBy} to ${event.to}${suffix}`)
    } else if (event.type === 'board') {
      if (event.street === 'flop') lines.push(`*** FLOP *** ${cards(event.cards)}`)
      else lines.push(`*** ${event.street.toUpperCase()} *** ${cards(event.cards.slice(0, -1))} ${cards(event.cards.slice(-1))}`)
    } else if (event.type === 'return') {
      lines.push(`Uncalled bet (${event.amount}) returned to ${names[event.player]}`)
    } else if (event.type === 'showdown') {
      if (!showdown) { lines.push('*** SHOW DOWN ***'); showdown = true }
      lines.push(`${names[event.player]}: shows ${cards(event.cards)} (${event.description})`)
    } else if (event.type === 'award') {
      lines.push(`${names[event.player]} collected ${event.amount} from pot`)
    }
  }
  lines.push('*** SUMMARY ***', `Total pot ${hand.result.pot} | Rake 0`)
  if (hand.board.length) lines.push(`Board ${cards(hand.board)}`)
  const fold = hand.events.find((event): event is Extract<HandEvent, { type: 'action' }> => event.type === 'action' && event.action === 'fold')
  for (const index of [0, 1] as const) {
    const position = index === hand.dealer ? '(button) (small blind)' : '(big blind)'
    const prefix = `Seat ${index + 1}: ${names[index]} ${position}`
    if (hand.result.reason === 'showdown') {
      lines.push(`${prefix} showed ${cards(hand.players[index].hole)} and ${hand.result.payouts[index] ? `won (${hand.result.payouts[index]})` : 'lost'} with ${hand.result.descriptions![index]}`)
    } else if (index === fold?.player) {
      lines.push(`${prefix} folded ${fold.street === 'preflop' ? 'before Flop' : `on the ${fold.street === 'flop' ? 'Flop' : fold.street === 'turn' ? 'Turn' : 'River'}`}`)
    } else {
      lines.push(`${prefix} collected (${hand.result.payouts[index]})`)
    }
  }
  return lines.join('\n') + '\n'
}

export function exportHands(hands: readonly CompletedHand[]): string {
  return TRAINING_NOTICE + '\n' + [...hands].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map(exportHand).join('\n')
}

export function downloadHands(hands: readonly CompletedHand[]) {
  if (!hands.length) return
  const blob = new Blob([exportHands(hands)], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `poker-lab-training-${new Date().toISOString().slice(0, 10)}${hands.length === 1 ? `-${hands[0].id}` : ''}.txt`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function handNet(hand: CompletedHand, player: 0 | 1 = 0) {
  return hand.players[player].stack - hand.players[player].initialStack
}

export function positionLabel(dealer: 0 | 1, player: 0 | 1 = 0) {
  return player === dealer ? 'BTN / SB' : player === other(dealer) ? 'BB' : ''
}
