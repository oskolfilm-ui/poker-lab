export interface RakeConfig { enabled: boolean; percent: number; capBB: number; noFlopNoDrop: boolean }
export const DEFAULT_RAKE: RakeConfig = { enabled: true, percent: 5, capBB: 2, noFlopNoDrop: true }
export function validRake(value: unknown): value is RakeConfig {
  if (!value || typeof value !== 'object') return false
  const config = value as RakeConfig
  return typeof config.enabled === 'boolean' && typeof config.noFlopNoDrop === 'boolean'
    && Number.isFinite(config.percent) && config.percent >= 0 && config.percent < 100
    && Number.isFinite(config.capBB) && config.capBB >= 0 && config.capBB <= 1000
}
export function calculateRake(pot: number, flopDealt: boolean, config?: RakeConfig): number {
  if (config && !validRake(config)) throw new Error('Некорректная настройка рейка.')
  if (!config?.enabled || (config.noFlopNoDrop && !flopDealt)) return 0
  // One chip is the minimum denomination; cap is expressed in 2-chip BB.
  return Math.floor(Math.min(pot * config.percent / 100, config.capBB * 2, pot) + 1e-9)
}
