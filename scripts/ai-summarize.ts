import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { LEVELS } from '../src/game/ai/levels'
import { OPPONENTS } from '../tests/benchmarks/opponents'
import { summarize } from '../tests/benchmarks/stats'
const levels = ['Legacy', ...LEVELS], count = 10000, seed = 3907149137
interface PeerResult { opponent: string; hands: number; bbPer100: number; ci95: number[]; profits: number[]; aiBusts: number; fullStackWins: number; actions: number; actionCounts: Record<string, number>; eligibleAdaptationHands: number }
interface Trial { level: string; pilot: boolean; hands: number; seed: number; sourceSha256: string; illegalActions: number; stackViolations: number; stress: unknown; elapsedSeconds: number; results: PeerResult[] }
const trials: Trial[] = await Promise.all(levels.map(async level => JSON.parse(await readFile(`test-results/ai/${level.replaceAll(' ', '-')}.json`, 'utf8'))))
if (trials.some(trial => trial.pilot || trial.hands < count || trial.seed !== seed || trial.sourceSha256 !== trials[0].sourceSha256 || trial.illegalActions || trial.stackViolations)) throw new Error('Incomplete or inconsistent matrix')
for (const trial of trials) {
  if (trial.results.length !== OPPONENTS.length || trial.results.some((peer, i) => peer.opponent !== OPPONENTS[i] || peer.hands !== count / OPPONENTS.length || peer.profits.length !== peer.hands || peer.profits.some(profit => !Number.isFinite(profit)))) throw new Error('Missing or invalid raw hand results')
}
const baseline = trials[0]
const expert = trials.find(trial => trial.level === 'Expert')!, nemesis = trials.find(trial => trial.level === 'Nemesis')!
const report = { seed, handsPerLevel: count, totalPerformanceHands: count * levels.length, confidence: '95% normal intervals over duplicate-card pair blocks; paired differences on identical decks; no multiple-comparison correction',
  nemesisVsExpert: nemesis.results.map((peer, i) => ({ opponent: peer.opponent, ...summarize(peer.profits.map((profit, hand) => profit - expert.results[i].profits[hand])) })),
  trials: trials.map(trial => ({ ...trial, results: trial.results.map(({ profits, ...peer }, i) => ({ ...peer,
    improvementVsLegacy: summarize(profits.map((profit, hand) => profit - baseline.results[i].profits[hand])) })) })) }
await mkdir('reports', { recursive: true })
await writeFile('reports/ai-validation.json', JSON.stringify(report, null, 2) + '\n')
console.table(report.trials.flatMap(trial => trial.results.map(peer => ({ level: trial.level, opponent: peer.opponent, 'bb/100': peer.bbPer100.toFixed(1), '95% CI': peer.ci95.map(n => n.toFixed(1)).join(' … '), 'delta vs old': peer.improvementVsLegacy.bbPer100.toFixed(1), busts: peer.aiBusts }))))
