import { describe, expect, it } from 'vitest'
import { chooseAction, decisionView, LEVELS } from '../../src/game/ai'
import { analyzeHand, CODES, DECK, fastRank, startingStrength, texture } from '../../src/game/ai/hand'
import { buildRange } from '../../src/game/ai/ranges'
import { rangeEquity } from '../../src/game/ai/equity'
import { emptyProfile } from '../../src/game/ai/profile'
import { compareHands, shuffle, type Card } from '../../src/game/cards'
import { applyAction, chipsInPlay, legalActions, startHand, type GameState } from '../../src/game/engine'
import { seeded } from '../benchmarks/stats'

const act = (game: GameState, type: 'call' | 'check' | 'raise' | 'bet', to?: number) => applyAction(game, game.toAct!, { type, to })
function withHole(game: GameState, hole: Card[]) { game.players[game.toAct!].hole = hole; return decisionView(game, game.toAct!) }

describe('AI evaluator and hand features', () => {
  it('cross-validates 2,000 independent boards against the engine evaluator', () => {
    const random = seeded(5413)
    expect(new Set(CODES.values()).size).toBe(52)
    for (let i = 0; i < 2000; i++) {
      const cards = shuffle(DECK, random), first = cards.slice(0, 7), second = [...cards.slice(7, 9), ...cards.slice(2, 7)]
      const a = fastRank(first), b = fastRank(second)
      expect(a === b ? 'tie' : a < b ? 0 : 1).toBe(compareHands(first, second))
    }
  })
  it('handles wheels, kickers, board ties and meaningful draws', () => {
    expect(fastRank(['As','2d','3c','4h','5s'])).toBeLessThan(fastRank(['Ks','Kd','Kh','7h','5s']))
    expect(analyzeHand(['2d','3d'], ['As','Ks','Qs','Js','Ts']).boardPlays).toBe(true)
    expect(analyzeHand(['7h','8h'], ['6h','9h','Kd']).drawOuts).toBe(15)
    expect(analyzeHand(['Ah','Kh'], ['Qh','Jh','2c']).drawOuts).toBe(12)
    expect(analyzeHand(['Ah','2d'], ['3s','4c','Kd']).drawOuts).toBe(4)
    expect(analyzeHand(['Ah','2d'], ['3s','4c','5d']).drawOuts).toBe(0)
    expect(analyzeHand(['2h','3d'], ['8s','9c','Td','Jh']).drawOuts).toBe(0)
    expect(analyzeHand(['Ah','2d'], ['Ks','Kc','Kd']).premium).toBe(false)
    expect(texture(['8h','9h','Th']).wetness).toBeGreaterThan(texture(['As','7d','2c']).wetness)
    expect(startingStrength(['As','Ah'])).toBeGreaterThan(startingStrength(['Ks','Kh']))
    expect(startingStrength(['As','Ks'])).toBeGreaterThan(startingStrength(['As','Kd']))
  })
})

describe('Information boundary and range decisions', () => {
  it('does not read hidden cards/deck and is invariant to changes in them on all levels', () => {
    let game = act(act(startHand({ random: seeded(2) }), 'call'), 'check')
    const view = decisionView(game, 1)
    const changed = structuredClone(game)
    changed.players[0].hole = ['As','Ah']; changed.deck.reverse()
    expect(decisionView(changed, 1)).toEqual(view)
    for (const difficulty of LEVELS) expect(chooseAction(view, seeded(123), { difficulty })).toEqual(chooseAction(decisionView(changed, 1), seeded(123), { difficulty }))
    Object.defineProperty(game.players[0], 'hole', { get: () => { throw new Error('Hidden Hero cards accessed') } })
    Object.defineProperty(game, 'deck', { get: () => { throw new Error('Future cards accessed') } })
    expect(decisionView(game, 1)).toEqual(view)
    view.board.pop(); view.actions[0].amount = 9999
    expect(game.board).toHaveLength(3); expect(game.events.some(event => 'amount' in event && event.amount === 9999)).toBe(false)
  })
  it('weights a 4-bet range toward premium hands and excludes known cards', () => {
    let game = startHand({ dealer: 0 })
    game = act(game, 'raise', 6); game = act(game, 'raise', 24); game = act(game, 'raise', 56)
    const view = decisionView(game, 1), range = buildRange(view, true)
    const weighted = range.combos.reduce((sum, combo) => sum + startingStrength(combo.hole) * combo.weight, 0) / range.total
    expect(weighted).toBeGreaterThan(.8)
    expect(range.combos.every(combo => combo.hole.every(card => !view.hole.includes(card)))).toBe(true)
  })
  it('computes certain river wins and board ties without real deck data', () => {
    const view = { ...decisionView(startHand({ dealer: 1 }), 1), hole: ['As','Ah'] as Card[], board: ['Ac','Ad','2s','3h','4d'] as Card[], actions: [] }
    const range = buildRange(view, true)
    expect(rangeEquity(view, range, seeded(8), 128).equity).toBe(1)
    const tie = { ...view, hole: ['2d','3d'] as Card[], board: ['As','Ks','Qs','Js','Ts'] as Card[], actions: [] }
    expect(rangeEquity(tie, buildRange(tie, true), seeded(8), 128).equity).toBe(.5)
  })
  it('changes defense with sizing, position and stack instead of calling every raise', () => {
    const small = withHole(act(startHand(), 'raise', 4), ['Qh','8d'])
    const big = withHole(act(startHand(), 'raise', 32), ['Qh','8d'])
    expect(chooseAction(small, seeded(5), { difficulty: 'Expert' }).type).toBe('call')
    expect(chooseAction(big, seeded(5), { difficulty: 'Expert' }).type).toBe('fold')
    const short = withHole(startHand({ dealer: 1, stacks: [384,16] }), ['As','Kd'])
    expect(chooseAction(short, seeded(5), { difficulty: 'Expert' }).type).toBe('allin')
  })
  it('folds junk to heavy river aggression and value-bets its own nuts', () => {
    let game = act(act(startHand(), 'call'), 'check')
    game = act(act(game, 'check'), 'check'); game = act(act(game, 'check'), 'check')
    game.board = ['Ac','Ad','9s','7h','3d']
    const nuts = withHole(game, ['As','Ah'])
    expect(chooseAction(nuts, seeded(5), { difficulty: 'Expert' }).type).toBe('bet')
    game = act(game, 'bet', 30)
    const air = withHole(game, ['2c','4c'])
    expect(chooseAction(air, seeded(5), { difficulty: 'Expert' }).type).toBe('fold')
  })
  it('never folds a mathematically guaranteed split even facing a full-stack bet', () => {
    for (const board of [['As','Ks','Qs','Js','Ts'], ['As','Kd','Qh','Js','Tc'], ['Kh','Ks','Kd','Kc','As']] as Card[][]) {
      let game = act(act(startHand(), 'call'), 'check')
      game = act(act(game,'check'),'check'); game = act(act(game,'check'),'check')
      game.board = board; game.players[0].hole = ['2d','3d']; game.players[1].hole = ['4d','5d']
      game = applyAction(game,1,{type:'allin'})
      expect(chooseAction(decisionView(game,0),seeded(2),{difficulty:'Expert'}).type).toBe('call')
    }
    expect(analyzeHand(['2d','3d'],['Ah','Jh','9h','5h','4h']).lockedBoard).toBe(false)
  })
  it('check-raises for value and can semi-bluff a combination draw', () => {
    let game = act(act(startHand(), 'call'), 'check')
    game.board = ['Ad','9h','3s']; game.players[1].hole = ['As','Ah']
    game = act(act(game, 'check'), 'bet', 6)
    expect(chooseAction(decisionView(game,1), seeded(21), { difficulty: 'Expert' }).type).toBe('raise')
    let draw = act(act(startHand(), 'call'), 'check')
    draw.board = ['6h','9h','Ac']; draw.players[1].hole = ['8h','7h']
    draw = act(act(draw, 'check'), 'bet', 12)
    const action = chooseAction(decisionView(draw,1), seeded(21), { difficulty: 'Expert' })
    expect(action.type).toBe('raise')
    expect(chipsInPlay(applyAction(draw,1,action))).toBe(400)
  })
  it('retains more bluffs across barrels only with confirmed aggression evidence', () => {
    let game = act(act(startHand(), 'call'), 'check')
    game = act(act(game,'check'),'bet',4); game = act(game,'call')
    game = act(act(game,'check'),'bet',12); game = act(game,'call')
    game = act(act(game,'check'),'bet',32)
    game.board = ['Ac','9d','3s','7h','2c']; game.players[1].hole = ['Kh','Qd']
    const view = decisionView(game,1), profile = emptyProfile()
    const bluffMass = (range: ReturnType<typeof buildRange>) => range.combos.filter(combo => !analyzeHand(combo.hole,view.board).ownPair).reduce((sum,combo) => sum + combo.weight,0) / range.total
    const normal = buildRange(view,true)
    profile.metrics.aggression = { hits: 10, opportunities: 10 }
    expect(buildRange(view,true,profile)).toEqual(normal)
    profile.metrics.aggression = { hits: 900, opportunities: 1000 }
    expect(bluffMass(buildRange(view,true,profile))).toBeGreaterThan(bluffMass(normal))
  })
  it('ignores Hero model below Nemesis and adapts only after sufficient evidence', () => {
    const view = withHole(startHand({ dealer: 1 }), ['9s','2d']), profile = emptyProfile()
    profile.metrics.foldBBToSteal = { hits: 500, opportunities: 500 }
    expect(chooseAction(view, seeded(1), { difficulty: 'Expert', profile })).toEqual(chooseAction(view, seeded(1), { difficulty: 'Expert' }))
    expect(chooseAction(view, seeded(1), { difficulty: 'Nemesis', profile }).type).toBe('raise')
    expect(chooseAction(view, seeded(1), { difficulty: 'Nemesis' }).type).toBe('fold')
  })
  it('keeps all levels legal with uneven, tiny and deep stacks', () => {
    const random = seeded(6558)
    for (const difficulty of LEVELS) for (let trial = 0; trial < 50; trial++) {
      const stack = 1 + Math.floor(random() * 399)
      let game = startHand({ stacks: [stack,400-stack], dealer: trial % 2 as 0 | 1, random }), actions = 0
      while (!game.result) {
        const player = game.toAct!, action = chooseAction(decisionView(game, player), random, { difficulty })
        expect(legalActions(game, player).actions).toContain(action.type)
        game = applyAction(game, player, action)
        expect(chipsInPlay(game)).toBe(400)
        expect(++actions).toBeLessThan(100)
      }
    }
  }, 30000)
})
