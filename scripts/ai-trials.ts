import { performance } from 'node:perf_hooks'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { applyAction, chipsInPlay, legalActions, startHand } from '../src/game/engine'
import { chooseAction, decisionView, isDifficulty } from '../src/game/ai'
import { emptyProfile, observeHand, confirmedDeviation, METRICS } from '../src/game/ai/profile'
import { handObservation } from '../src/game/ai/observation'
import { chooseAction as legacyAction } from '../tests/benchmarks/legacy-ai'
import { OPPONENTS, referenceAction } from '../tests/benchmarks/opponents'
import { seeded, mixedSeed, summarize } from '../tests/benchmarks/stats'
import { matchWinner } from '../src/game/match'

const level = process.argv[2] ?? 'Strong Reg'
const hands = Number(process.argv[3] ?? 10000), seed = Number(process.argv[4] ?? 3907149137)
const pilot = process.argv.includes('--pilot')
if (level !== 'Legacy' && !isDifficulty(level)) throw new Error('Unknown level')
if (!Number.isSafeInteger(hands) || hands % 8 !== 0 || (!pilot && hands < 10000)) throw new Error('Full validation requires >=10,000 hands/level, divisible by 8')
const files = ['src/game/ai.ts', ...((await readdir('src/game/ai')).sort().map(name => `src/game/ai/${name}`))]
const sourceHash = createHash('sha256')
for (const file of files) sourceHash.update(file).update(await readFile(file))
const results = [], started = performance.now()
for (const [opponentIndex, opponent] of OPPONENTS.entries()) {
  let profile = emptyProfile(), actions = 0, busts = 0, fullStackWins = 0, adaptations = 0
  const counts: Record<string, number> = {}, profits: number[] = []
  const count = hands / OPPONENTS.length
  for (let hand = 0; hand < count; hand++) {
    const deckRandom = seeded(mixedSeed(seed + opponentIndex * 1000000 + Math.floor(hand / 2)))
    const aiRandom = seeded(mixedSeed(seed + hand * 17 + 193)), peerRandom = seeded(mixedSeed(seed + hand * 31 + 997))
    let game = startHand({ random: deckRandom, dealer: hand % 2 as 0 | 1 })
    let handActions = 0
    while (!game.result) {
      const actor = game.toAct!, view = decisionView(game, actor)
      const action = actor === 0 ? referenceAction(opponent, view, peerRandom) : level === 'Legacy' ? legacyAction(view, aiRandom) : chooseAction(view, aiRandom, { difficulty: level, profile })
      if (!legalActions(game, actor).actions.includes(action.type)) throw new Error(`${level}/${opponent}: illegal ${JSON.stringify(action)}`)
      if (actor === 1) counts[action.type] = (counts[action.type] ?? 0) + 1
      game = applyAction(game, actor, action)
      if (chipsInPlay(game) !== 400 || game.players.some(p => !Number.isSafeInteger(p.stack) || p.stack < 0)) throw new Error('Stack invariant failed')
      if (++handActions > 200) throw new Error('Nonterminating hand')
      actions++
    }
    profits.push((game.players[1].stack - 200) / 2)
    if (game.players[1].stack === 0) busts++
    if (game.players[0].stack === 0) fullStackWins++
    profile = observeHand(profile, handObservation(game))
    if (profile.hands !== hand + 1) throw new Error('Profile counted a hand incorrectly')
    if (Object.keys(METRICS).some(metric => confirmedDeviation(profile, metric as keyof typeof METRICS) !== 0)) adaptations++
    if ((hand + 1) % 500 === 0) console.log(`${level} / ${opponent}: ${hand + 1}/${count}`)
  }
  results.push({ opponent, hands: count, ...summarize(profits), aiBusts: busts, fullStackWins, actions, actionCounts: counts,
    eligibleAdaptationHands: adaptations, finalProfile: profile, profits,
    early: summarize(profits.slice(0, Math.min(500, count))), late: summarize(profits.slice(-Math.min(500, count))) })
}
await mkdir('test-results/ai', { recursive: true })
// A separate continuous-match stress test exercises uneven and shallow stacks.
// These hands are excluded from the fresh-100BB performance estimates above.
let stacks: [number, number] = [200, 200], stressProfile = emptyProfile()
let stressActions = 0, matches = 0, minimumEffectiveStack = 200
const stressHands = pilot ? 100 : 1000, stressRandom = seeded(seed ^ 0x72731)
for (let hand = 0; hand < stressHands; hand++) {
  let game = startHand({ stacks, dealer: hand % 2 as 0 | 1, random: stressRandom })
  minimumEffectiveStack = Math.min(minimumEffectiveStack, ...stacks)
  let actions = 0
  while (!game.result) {
    const actor = game.toAct!, view = decisionView(game, actor)
    const action = actor === 0 ? referenceAction(OPPONENTS[Math.floor(matches / 3) % OPPONENTS.length], view, stressRandom)
      : level === 'Legacy' ? legacyAction(view, stressRandom) : chooseAction(view, stressRandom, { difficulty: level, profile: stressProfile })
    if (!legalActions(game, actor).actions.includes(action.type)) throw new Error('Stress: illegal action')
    game = applyAction(game, actor, action)
    if (chipsInPlay(game) !== 400 || game.players.some(p => p.stack < 0 || !Number.isSafeInteger(p.stack))) throw new Error('Stress: chips lost')
    if (++actions > 200) throw new Error('Stress: nonterminating hand')
    stressActions++
  }
  stressProfile = observeHand(stressProfile, handObservation(game))
  if (matchWinner(game) !== null) { matches++; stacks = [200, 200] }
  else stacks = game.players.map(player => player.stack) as [number, number]
}
if (stressProfile.hands !== stressHands) throw new Error('Stress: profile count mismatch')
const report = { level, pilot, hands, seed, sourceSha256: sourceHash.digest('hex'),
  protocol: 'fresh 100BB; four independent peers; paired identical decks with swapped button/holes; avalanche-mixed deck/AI/peer RNG seeds; fresh profile per peer; same production sample budgets',
  samples: level === 'Legacy' ? 100 : undefined, elapsedSeconds: (performance.now() - started) / 1000,
  illegalActions: 0, stackViolations: 0, stress: { hands: stressHands, actions: stressActions, matches, minimumEffectiveStack }, results }
await writeFile(`test-results/ai/${level.replaceAll(' ', '-')}.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ level, hands, elapsedSeconds: report.elapsedSeconds, results: results.map(({opponent,bbPer100,ci95,aiBusts}) => ({opponent,bbPer100,ci95,aiBusts})) }))
