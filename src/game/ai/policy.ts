import { secureRandom, type Random } from '../cards'
import type { Action } from '../engine'
import type { DecisionView } from './view'
import { DEFAULT_DIFFICULTY, SETTINGS, type Difficulty } from './levels'
import { analyzeHand, rank, startingStrength, texture } from './hand'
import { buildRange, rangeContext } from './ranges'
import { rangeEquity } from './equity'
import { confirmedDeviation, emptyProfile, type HeroProfile } from './profile'

export interface AIOptions { difficulty?: Difficulty; profile?: HeroProfile }
const bounded = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
function sizeAction(view: DecisionView, target: number, shove = false): Action {
  const { legal } = view
  if (shove && legal.actions.includes('allin')) return { type: 'allin' }
  const type = legal.actions.includes('bet') ? 'bet' : 'raise'
  if (!legal.actions.includes(type)) return { type: legal.toCall ? 'call' : 'check' }
  return { type, to: Math.round(bounded(target, legal.minTo, legal.maxTo)) }
}

export function chooseAction(view: DecisionView, random: Random = secureRandom, options: AIOptions = {}): Action {
  const difficulty = options.difficulty ?? DEFAULT_DIFFICULTY, settings = SETTINGS[difficulty]
  const { legal } = view
  if (!legal.actions.length) throw new Error('ИИ не может ходить вне очереди.')
  const profile = settings.adaptive ? options.profile ?? emptyProfile() : undefined
  const deviation = (metric: Parameters<typeof confirmedDeviation>[1]) => profile ? confirmedDeviation(profile, metric) : 0
  const facing = legal.toCall > 0, canRaise = legal.actions.includes('raise') || legal.actions.includes('bet')
  const passive: Action = { type: facing ? 'call' : 'check' }
  const context = rangeContext(view), strength = startingStrength(view.hole)
  const effectiveBB = view.effectiveStack / 2
  const wheelAce = view.hole[0][1] === view.hole[1][1] && view.hole.some(card => card[0] === 'A') && view.hole.some(card => '2345'.includes(card[0]))
  const contestablePot = view.pot - Math.max(0, legal.toCall - legal.callAmount)
  const odds = legal.callAmount / Math.max(1, contestablePot + legal.callAmount)
  if (view.street === 'preflop') {
    const raises = context.raises, opponentOpen = view.actions.filter(a => a.player === 'opponent' && a.raiseBy > 0).at(-1)?.to ?? 2
    const openFraction = bounded(settings.open + deviation('foldBBToSteal') * .55 - (effectiveBB < 30 ? .06 : 0), .5, .97)
    if (raises === 0 && view.button && facing) {
      if (effectiveBB <= 10 && strength >= (settings.tactical ? .4 : .55)) return sizeAction(view, legal.maxTo, true)
      if (strength >= 1 - openFraction && canRaise) return sizeAction(view, effectiveBB < 25 ? 4 : settings.advanced ? 4 : 5)
      // Lower levels limp some playable hands; deeper tactical levels fold the bottom.
      return !settings.tactical && strength > .2 ? passive : { type: 'fold' }
    }
    if (raises === 0 && !facing) {
      // BB option versus a limp: isolate a playable range, check weaker holdings.
      if (canRaise && strength > (settings.tactical ? .55 : .7)) return sizeAction(view, effectiveBB <= 12 ? legal.maxTo : 8, effectiveBB <= 12)
      return passive
    }
    const commitment = legal.callAmount / Math.max(1, view.stack)
    if (raises >= 3 || commitment > .35 || opponentOpen >= view.effectiveStack * .5) {
      const equity = rangeEquity(view, buildRange(view, settings.rangeAware, profile), random, settings.samples)
      if (equity.equity < odds + settings.margin) return { type: 'fold' }
      if (canRaise && strength > .985 && equity.equity > .68) return sizeAction(view, legal.maxTo, true)
      return passive
    }
    if (raises === 1) {
      const valueThreshold = 1 - settings.threeBet - deviation('threeBet') * .12
      const bluff = settings.tactical && wheelAce && opponentOpen <= 8 && deviation('foldToThreeBet') >= 0 && random() < .3 + deviation('foldToThreeBet')
      if (canRaise && (strength > valueThreshold || bluff)) {
        const target = opponentOpen * (view.inPosition ? 3 : 4)
        return sizeAction(view, target, effectiveBB < 20 && strength > .85)
      }
      const largeRaisePenalty = Math.max(0, opponentOpen / 2 - 2.5) * .06
      const playable = strength > bounded((view.inPosition ? .2 : .25) + largeRaisePenalty + (settings.tactical ? 0 : .12) - deviation('pfr') * .25, .08, .93)
      const price = legal.callAmount / Math.max(1, view.effectiveStack)
      return !facing || (playable && (price < .12 || strength > .82)) ? passive : { type: 'fold' }
    }
    if (raises === 2) {
      const threshold = .975 - Math.max(0, deviation('threeBet')) * .15
      const bluff = settings.advanced && wheelAce && deviation('foldToFourBet') > .1 && random() < .35
      if (canRaise && (strength > threshold || bluff)) return sizeAction(view, opponentOpen * 2.25, effectiveBB < 35 && strength > .96)
      const suited = view.hole[0][1] === view.hole[1][1]
      const minimum = .76 + Math.max(0, opponentOpen / view.effectiveStack - .1) * .45 - deviation('threeBet') * .25
      return !facing || (strength > minimum && (suited || strength > .89 || view.inPosition)) ? passive : { type: 'fold' }
    }
    return passive
  }
  const hand = analyzeHand(view.hole, view.board), board = texture(view.board)
  const equity = rangeEquity(view, buildRange(view, settings.rangeAware, profile), random, settings.samples)
  const spr = Math.min(view.stack, view.opponentStack + legal.callAmount) / Math.max(1, contestablePot + legal.callAmount)
  const river = view.street === 'river'
  const realization = river || spr <= 1 ? 1 : view.inPosition ? .98 : hand.drawOuts >= 8 ? .92 : hand.ownPair && !hand.topPair && !hand.overpair ? .84 : .94
  const margin = settings.margin + (settings.advanced ? equity.standardError * .2 : 0)
  const realized = equity.equity * realization
  const foldLeak = deviation('foldToCbet'), aggressionLeak = deviation('aggression')
  const callMargin = bounded(margin - Math.max(0, aggressionLeak) * .12, 0, .12)
  const valueTarget = .57 - Math.max(0, -foldLeak) * .08
  const valueHand = hand.premium || hand.twoPair || hand.topPair || hand.overpair || (settings.advanced && hand.ownPair)
  const strongValue = equity.valueEquity > .78 && (hand.premium || hand.twoPair || (spr < 1.5 && valueHand)) && !hand.boardPlays
  if (facing) {
    // A mathematically locked board splits against every possible holding.
    // The safety margin must never make us surrender a guaranteed split.
    if (hand.lockedBoard) return passive
    const canCall = realized >= odds + callMargin
    if (canRaise && strongValue && (settings.tactical || hand.premium)) {
      // Value check-raise uses the actual line, not a random raise flag.
      const target = view.streetBet + legal.toCall + Math.round((contestablePot + legal.callAmount) * (board.wetness > .5 ? .95 : .75))
      return sizeAction(view, target, spr < 1.2 && equity.valueEquity > .8)
    }
    if (canRaise && settings.tactical && !river && hand.drawOuts >= 12 && context.checked && !view.inPosition) {
      const fraction = .8
      const target = Math.round(bounded(view.streetBet + legal.toCall + fraction * (contestablePot + legal.callAmount), legal.minTo, legal.maxTo))
      // Only chips that the opponent can match are at risk. Their existing bet
      // is already in the pot: a raise is not a fresh bet by both players.
      const investment = Math.min(target - view.streetBet, view.opponentStack + legal.toCall)
      const opponentExtra = Math.max(0, investment - legal.toCall)
      const foldEquity = bounded(.3 + foldLeak * .7 - context.opponentAggression * .03, .1, .55)
      const raiseEV = foldEquity * contestablePot + (1 - foldEquity) * (equity.valueEquity * (contestablePot + investment + opponentExtra) - investment)
      const callEV = realized * (contestablePot + legal.callAmount) - legal.callAmount
      if (raiseEV > Math.max(0, callEV) && random() < .5) return sizeAction(view, target)
    }
    return canCall ? passive : { type: 'fold' }
  }
  if (!canRaise) return passive
  if (valueHand && !hand.boardPlays && equity.valueEquity >= valueTarget + margin) {
    const thin = equity.valueEquity < .69
    const fraction = thin ? .33 : board.wetness > .5 || foldLeak < -.1 ? .85 : .65
    if (settings.tactical && spr > 4 && !view.inPosition && hand.ownPair && !hand.topPair && !hand.overpair && !hand.twoPair && !hand.premium) return passive
    return sizeAction(view, view.streetBet + Math.round(view.pot * fraction), spr < 1 && strongValue)
  }
  // Preserve showdown value; bluffs come from draws, useful blockers or a
  // dry-board continuation line. No unrestricted "13% bet any two" branch.
  const hasShowdownValue = hand.ownPair || hand.boardPlays
  const dryCbet = context.lastAggressor === 'self' && board.wetness < .4 && context.opponentAggression === 0
  const plausibleBluff = !hasShowdownValue && (hand.drawOuts >= 8 || hand.nutBlocker || hand.backdoor || dryCbet)
  if (settings.tactical && plausibleBluff) {
    const fraction = hand.drawOuts >= 8 || river ? .65 : .33
    const folds = bounded(.32 + context.rangeAdvantage + (view.inPosition ? .05 : 0) - board.wetness * .12 + foldLeak * .9, .08, .7)
    const bet = Math.min(view.stack, view.opponentStack, Math.max(2, Math.round(view.pot * fraction)))
    const bluffEV = folds * view.pot + (1 - folds) * (equity.valueEquity * (view.pot + 2 * bet) - bet)
    const frequency = hand.drawOuts >= 8 ? .7 : river ? hand.nutBlocker ? .3 : 0 : dryCbet ? .5 + foldLeak * .5 : .25
    if (bluffEV > 0 && random() < frequency) return sizeAction(view, view.streetBet + bet)
  }
  return passive
}

// Exposed for audit assertions, never asks for GameState or hidden cards.
export function preflopClassDescription(view: DecisionView) {
  return { strength: startingStrength(view.hole), highRank: Math.max(...view.hole.map(rank)), effectiveBB: view.effectiveStack / 2 }
}
