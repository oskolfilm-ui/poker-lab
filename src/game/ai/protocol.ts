import type { Action } from '../engine'
import type { DecisionView } from './view'
import type { Difficulty } from './levels'
import type { HeroProfile } from './profile'

// The worker API deliberately cannot accept a GameState, deck or opponent cards.
export interface AIRequest { view: DecisionView; difficulty: Difficulty; profile: HeroProfile }
export type AIResponse = { action: Action } | { error: string }
