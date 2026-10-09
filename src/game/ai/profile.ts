import type { ActionType, PlayerIndex, Street } from '../engine'

export const METRICS = {
  vpip: { label: 'VPIP', prior: .65, min: 30 }, pfr: { label: 'PFR', prior: .45, min: 30 },
  threeBet: { label: '3-bet', prior: .12, min: 40 }, foldToThreeBet: { label: 'Fold to 3-bet', prior: .45, min: 30 },
  fourBet: { label: '4-bet', prior: .12, min: 30 }, foldToFourBet: { label: 'Fold to 4-bet', prior: .55, min: 30 },
  cbet: { label: 'C-bet', prior: .6, min: 30 }, foldToCbet: { label: 'Fold to C-bet', prior: .45, min: 30 },
  aggression: { label: 'AFq', prior: .4, min: 80 }, foldBBToSteal: { label: 'Fold BB to steal', prior: .35, min: 40 },
  wtsd: { label: 'WTSD', prior: .3, min: 40 }, wonShowdown: { label: 'W$SD', prior: .5, min: 30 },
} as const
export type Metric = keyof typeof METRICS
export interface Rate { hits: number; opportunities: number }
export interface HeroProfile { id: 'hero'; version: 1; hands: number; metrics: Record<Metric, Rate> }
export interface ObservedAction { player: PlayerIndex; street: Street; type: ActionType; raiseBy: number; amount: number }
export interface HandObservation { actions: ObservedAction[]; dealer: PlayerIndex; sawFlop: boolean; showdown: boolean; winners: PlayerIndex[] }
export function emptyProfile(): HeroProfile {
  return { id: 'hero', version: 1, hands: 0, metrics: Object.fromEntries(Object.keys(METRICS).map(key => [key, { hits: 0, opportunities: 0 }])) as HeroProfile['metrics'] }
}
export function observeHand(profile: HeroProfile, hand: HandObservation): HeroProfile {
  const result = structuredClone(profile)
  result.hands++
  const count = (metric: Metric, hit: boolean | number) => { result.metrics[metric].opportunities++; result.metrics[metric].hits += Number(hit) }
  const pre = hand.actions.filter(a => a.street === 'preflop')
  count('vpip', pre.some(a => a.player === 0 && a.amount > 0))
  count('pfr', pre.some(a => a.player === 0 && a.raiseBy > 0))
  let raises = 0, opener: PlayerIndex | null = null, lastRaiser: PlayerIndex | null = null
  const recorded = new Set<Metric>()
  const once = (metric: Metric, hit: boolean) => { if (!recorded.has(metric)) { count(metric, hit); recorded.add(metric) } }
  for (const action of pre) {
    if (action.player === 0) {
      if (raises === 1 && lastRaiser === 1) once('threeBet', action.raiseBy > 0)
      if (raises === 2 && opener === 0 && lastRaiser === 1) {
        once('foldToThreeBet', action.type === 'fold'); once('fourBet', action.raiseBy > 0)
      }
      if (raises === 3 && opener === 1 && lastRaiser === 1) once('foldToFourBet', action.type === 'fold')
      if (hand.dealer === 1 && raises === 1 && opener === 1) once('foldBBToSteal', action.type === 'fold')
    }
    if (action.raiseBy > 0) { if (raises === 0) opener = action.player; raises++; lastRaiser = action.player }
  }
  let flopAggression = false, opponentFirstFlopAction = true, heroFirstFlopAction = true, awaitingCbetResponse = false
  for (const action of hand.actions.filter(a => a.street !== 'preflop')) {
    if (action.player === 0 && action.type !== 'check') count('aggression', action.raiseBy > 0)
    if (action.street !== 'flop') continue
    if (action.player === 0) {
      if (heroFirstFlopAction && lastRaiser === 0 && !flopAggression) once('cbet', action.raiseBy > 0)
      heroFirstFlopAction = false
      if (awaitingCbetResponse) { once('foldToCbet', action.type === 'fold'); awaitingCbetResponse = false }
    } else {
      if (opponentFirstFlopAction && lastRaiser === 1 && !flopAggression && action.raiseBy > 0) awaitingCbetResponse = true
      opponentFirstFlopAction = false
    }
    if (action.raiseBy > 0) flopAggression = true
  }
  if (hand.sawFlop) count('wtsd', hand.showdown)
  if (hand.showdown) count('wonShowdown', hand.winners.includes(0) ? 1 / hand.winners.length : 0)
  return result
}
export function rateEstimate(profile: HeroProfile, metric: Metric) {
  const { hits, opportunities: n } = profile.metrics[metric]
  const prior = METRICS[metric].prior, priorWeight = 30
  const mean = (hits + prior * priorWeight) / (n + priorWeight)
  if (!n) return { mean, raw: null, opportunities: n, low: 0, high: 1, sufficient: false }
  const p = hits / n, z = 1.96, denominator = 1 + z * z / n
  const center = (p + z * z / (2 * n)) / denominator
  const margin = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator
  return { mean, raw: p, opportunities: n, low: Math.max(0, center - margin), high: Math.min(1, center + margin), sufficient: n >= METRICS[metric].min }
}
// Adapt only when the opportunity count and Wilson interval support a leak.
// Shrinkage and bounded adjustments avoid overreacting to a few unusual hands.
export function confirmedDeviation(profile: HeroProfile, metric: Metric): number {
  const estimate = rateEstimate(profile, metric), prior = METRICS[metric].prior
  if (!estimate.sufficient || (estimate.low <= prior && estimate.high >= prior)) return 0
  return Math.max(-.3, Math.min(.3, estimate.mean - prior)) * estimate.opportunities / (estimate.opportunities + 60)
}
