import { analyzeHand, CODES, DECK, startingStrength, texture } from './hand'
import type { Card } from '../cards'
import type { DecisionView } from './view'
import { confirmedDeviation, type HeroProfile } from './profile'

export interface RangeCombo { hole: [Card, Card]; codes: [number, number]; weight: number; continues: number }
export interface OpponentRange { combos: RangeCombo[]; cumulative: number[]; total: number }
const sigmoid = (value: number) => 1 / (1 + Math.exp(-value))
export function buildRange(view: DecisionView, aware: boolean, profile?: HeroProfile): OpponentRange {
  const excluded = new Set([...view.hole, ...view.board]), remaining = DECK.filter(card => !excluded.has(card))
  const combos: RangeCombo[] = [], cumulative: number[] = []
  let total = 0
  const looseness = profile ? confirmedDeviation(profile, 'vpip') : 0
  const aggression = profile ? confirmedDeviation(profile, 'aggression') : 0
  const opening = profile ? confirmedDeviation(profile, 'pfr') : 0
  const cbet = profile ? confirmedDeviation(profile, 'cbet') : 0
  const threeBet = profile ? confirmedDeviation(profile, 'threeBet') : 0
  const station = profile ? -Math.min(0, confirmedDeviation(profile, 'foldToCbet')) : 0
  const boardCache = [[], view.board.slice(0, 3), view.board.slice(0, 4), view.board.slice(0, 5)] as Card[][]
  for (let i = 0; i < remaining.length; i++) for (let j = i + 1; j < remaining.length; j++) {
    const hole: [Card, Card] = [remaining[i], remaining[j]]
    const strength = startingStrength(hole)
    const aceBluff = hole[0][1] === hole[1][1] && hole.some(c => c[0] === 'A') && hole.some(c => '2345'.includes(c[0]))
    let weight = 1, raises = 0, postWeight = 1, barrels = 0
    const features = new Map<number, ReturnType<typeof analyzeHand>>()
    const feature = (street: number) => {
      if (!features.has(street)) features.set(street, analyzeHand(hole, boardCache[street]))
      return features.get(street)!
    }
    if (aware) for (const action of view.actions) {
      if (action.street === 'preflop') {
        if (action.player === 'opponent') {
          if (action.raiseBy > 0) {
            const threshold = raises === 0 ? .22 + Math.max(0, action.to / 2 - 3) * .035 - opening * .6
              : raises === 1 ? .86 - threeBet * .45 : .955 - threeBet * .12
            weight *= .015 + .95 * sigmoid((strength - Math.min(.98, threshold)) * (raises > 0 ? 35 : 15))
              + (aceBluff && raises > 0 && raises < 3 ? .12 : 0)
          } else if (action.type === 'call' || (action.type === 'allin' && action.raiseBy === 0)) {
            const threshold = raises <= 1 ? .15 + Math.max(0, action.amount - 3) * .025 - looseness * .5 : raises === 2 ? .67 : .9
            weight *= .025 + sigmoid((strength - threshold) * 15) * (raises === 0 && strength > .95 ? .45 : 1)
          }
        }
        if (action.raiseBy > 0) raises++
        continue
      }
      if (action.player !== 'opponent') continue
      const street = action.street === 'flop' ? 1 : action.street === 'turn' ? 2 : 3
      const made = feature(street), river = street === 3
      const fraction = action.amount / Math.max(1, action.potBefore)
      if (action.raiseBy > 0) {
        barrels++
        const isRaise = action.type === 'raise' || (action.type === 'allin' && action.raiseBy < action.to)
        const strengthValue = made.premium ? .95 : made.twoPair ? .8 : made.topPair || made.overpair ? .62 : made.ownPair ? .32 : .05
        // Retain a bluff component; large raises and later barrels concentrate value.
        const threshold = river ? (isRaise ? .72 : fraction >= .8 ? .55 : .4) : isRaise ? .64 : .32
        const valueLikelihood = sigmoid((strengthValue - threshold) * 12)
        const drawLikelihood = !river && made.drawOuts >= 8 ? (isRaise ? .45 : .7) : 0
        const bluff = Math.max(.01, (river ? isRaise ? .025 : .07 : isRaise ? .06 : .18) + aggression * .35)
        postWeight *= Math.max(bluff, valueLikelihood, drawLikelihood)
        // Barrels are correlated through a persistent bluffing line. Multiplying
        // independent per-street bluff rates would almost erase missed draws.
        // AFq/C-bet do not reveal exact bluffs; retain a bounded mixture only
        // after opportunity counts and intervals confirm excess aggression.
        if (barrels > 1) postWeight = Math.max(postWeight, Math.min(.2, .012 + Math.max(0, aggression) * .45 + Math.max(0, cbet) * .2))
      } else if (action.type === 'call' || action.type === 'allin') {
        postWeight *= made.premium ? .7 : made.twoPair || made.topPair || made.overpair ? .95 : made.ownPair ? .6 + station : made.drawOuts >= 8 ? .8 : .08 + station * 1.5
      } else if (action.type === 'check') postWeight *= made.premium ? .7 : 1 // Preserve slowplays.
    }
    const current = view.board.length >= 3 ? feature(view.board.length - 2) : null
    const continues = current ? Math.min(1, current.premium || current.twoPair ? 1 : current.topPair || current.overpair ? .9 : current.ownPair ? .55 + station : current.drawOuts >= 8 ? .7 : .07 + station) : .2 + strength * .8
    weight = Math.max(1e-8, weight * postWeight)
    total += weight; cumulative.push(total)
    combos.push({ hole, codes: [CODES.get(hole[0])!, CODES.get(hole[1])!], weight, continues })
  }
  return { combos, cumulative, total }
}
export function rangeContext(view: DecisionView) {
  const pre = view.actions.filter(action => action.street === 'preflop' && action.raiseBy > 0)
  const current = view.actions.filter(action => action.street === view.street)
  const lastAggressor = pre.at(-1)?.player ?? null
  const opponentAggression = current.filter(action => action.player === 'opponent' && action.raiseBy > 0)
  return { raises: pre.length, lastAggressor, opponentAggression: opponentAggression.length,
    checked: current.some(action => action.player === 'self' && action.type === 'check'),
    rangeAdvantage: (lastAggressor === 'self' ? .1 : -.06) * (texture(view.board).wetness < .5 ? 1 : .3) }
}
