import { performance } from 'node:perf_hooks'
import { writeFile } from 'node:fs/promises'
import { applyAction, chipsInPlay, legalActions, startHand } from '../src/game/engine'
import { decisionView } from '../src/game/ai/view'
import { chooseAction as legacyAction } from '../tests/benchmarks/legacy-ai'
import { OPPONENTS, referenceAction } from '../tests/benchmarks/opponents'
function seeded(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 } }
const results = []
const started = performance.now()
for (const [opponentIndex, opponent] of OPPONENTS.entries()) {
  let profit = 0, squares = 0, busts = 0, illegal = 0, decisions = 0
  const hands = Number(process.env.AUDIT_HANDS_PER_OPPONENT ?? 250)
  for (let hand = 0; hand < hands; hand++) {
    const random = seeded(20261009 + opponentIndex * 100000 + hand)
    let game = startHand({ random, dealer: hand % 2 as 0 | 1 })
    const aiRandom = seeded(hand + 1981), peerRandom = seeded(hand + 9901)
    let actions = 0
    while (!game.result) {
      const actor = game.toAct!
      const view = decisionView(game, actor)
      const action = actor === 1 ? legacyAction(view, aiRandom) : referenceAction(opponent, view, peerRandom)
      if (!legalActions(game, actor).actions.includes(action.type)) illegal++
      game = applyAction(game, actor, action)
      if (chipsInPlay(game) !== 400 || game.players.some(p => !Number.isInteger(p.stack) || p.stack < 0)) throw new Error('Chip invariant')
      if (++actions > 200) throw new Error('Nonterminating hand')
      decisions++
    }
    const netBB = (game.players[1].stack - 200) / 2
    profit += netBB; squares += netBB ** 2
    if (game.players[1].stack === 0) busts++
    if ((hand + 1) % 50 === 0) console.log(`${opponent}: ${hand + 1}/${hands}`)
  }
  const mean = profit / hands, sd = Math.sqrt(Math.max(0, (squares - hands * mean ** 2) / (hands - 1)))
  results.push({ opponent, hands, bbPer100: mean * 100, ci95: [mean * 100 - 1.96 * sd / Math.sqrt(hands) * 100, mean * 100 + 1.96 * sd / Math.sqrt(hands) * 100], aiBusts: busts, illegal, decisions })
}
const report = { baselineCommit: 'ef854282cc4cab8a246bb1a4c0a408380b8e6a3b', protocol: 'fresh 100BB stacks; alternating button; deterministic independent RNG streams; 4 independently authored peers', seed: 20261009, elapsedSeconds: (performance.now() - started) / 1000, results }
await writeFile('reports/ai-audit-baseline.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
