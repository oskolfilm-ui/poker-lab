export const LEVELS = ['Beginner', 'Regular', 'Strong Reg', 'Expert', 'Nemesis'] as const
export type Difficulty = typeof LEVELS[number]
export const DEFAULT_DIFFICULTY: Difficulty = 'Strong Reg'
export function isDifficulty(value: unknown): value is Difficulty { return LEVELS.some(level => level === value) }
export const SETTINGS: Record<Difficulty, { samples: number; rangeAware: boolean; tactical: boolean; advanced: boolean; adaptive: boolean; open: number; threeBet: number; margin: number }> = {
  Beginner: { samples: 16, rangeAware: false, tactical: false, advanced: false, adaptive: false, open: .62, threeBet: .06, margin: .08 },
  Regular: { samples: 32, rangeAware: true, tactical: false, advanced: false, adaptive: false, open: .75, threeBet: .1, margin: .045 },
  'Strong Reg': { samples: 64, rangeAware: true, tactical: true, advanced: false, adaptive: false, open: .84, threeBet: .13, margin: .025 },
  Expert: { samples: 128, rangeAware: true, tactical: true, advanced: true, adaptive: false, open: .87, threeBet: .14, margin: .015 },
  Nemesis: { samples: 128, rangeAware: true, tactical: true, advanced: true, adaptive: true, open: .87, threeBet: .14, margin: .015 },
}
