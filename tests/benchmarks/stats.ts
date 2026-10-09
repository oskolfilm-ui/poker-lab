export function seeded(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 } }
// Avalanche neighboring hand IDs before seeding LCG streams. Raw consecutive
// seeds otherwise correlate the first shuffle draw and bias hole-card ranks.
export function mixedSeed(seed: number) {
  seed = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad)
  seed = Math.imul(seed ^ (seed >>> 15), 0x735a2d97)
  return (seed ^ (seed >>> 15)) >>> 0
}
export function summarize(profits: number[]) {
  if (!profits.length || profits.length % 2) throw new Error('Expected complete duplicate-card pairs')
  const pairs = Array.from({ length: profits.length / 2 }, (_, i) => (profits[i * 2] + profits[i * 2 + 1]) / 2)
  const mean = pairs.reduce((sum, n) => sum + n, 0) / pairs.length
  const sd = Math.sqrt(pairs.reduce((sum, n) => sum + (n - mean) ** 2, 0) / Math.max(1, pairs.length - 1))
  const margin = 1.96 * sd / Math.sqrt(pairs.length) * 100
  return { bbPer100: mean * 100, ci95: [mean * 100 - margin, mean * 100 + margin] }
}
