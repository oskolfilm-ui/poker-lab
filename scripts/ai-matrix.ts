import { spawn } from 'node:child_process'
import { LEVELS } from '../src/game/ai/levels'

// Held-out release seed; earlier seeds were used for exploratory calibration.
const levels = ['Legacy', ...LEVELS], count = 10000, seed = 3907149137
let next = 0
async function runner() {
  while (next < levels.length) {
    const level = levels[next++]
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/ai-trials.ts', level, String(count), String(seed)], { stdio: 'inherit' })
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${level} failed with ${code}`)))
    })
  }
}
await Promise.all([runner(), runner()])
await import('./ai-summarize')
