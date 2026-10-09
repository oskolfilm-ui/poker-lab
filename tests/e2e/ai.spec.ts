import { expect, test, type Page } from '@playwright/test'
import { LEVELS } from '../../src/game/ai/levels'

for (const level of LEVELS) {
  test(`table dropdown selects and persists ${level}, and the actual Worker plays that strategy`, async ({ page }) => {
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage
      Object.assign(window, { difficultyRequests: [] })
      Worker.prototype.postMessage = function(message: unknown, ...args: unknown[]) {
        ;(window as unknown as { difficultyRequests: unknown[] }).difficultyRequests.push(structuredClone(message))
        return Reflect.apply(original, this, [message, ...args])
      }
    })
    await page.goto('./')
    await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
    const select = page.getByRole('combobox', { name: 'Сложность ИИ на столе', exact: true })
    await expect(select).toBeEnabled()
    await expect(select.locator('option')).toHaveText([...LEVELS])
    await select.selectOption(level)
    await expect(page.getByTestId('current-difficulty')).toHaveText(level)
    await expect(page.getByLabel('Сложность AdaptiveAI', { exact: true })).toHaveValue(level)
    await page.reload()
    await expect(select).toHaveValue(level)
    await page.getByLabel('Размер ставки в фишках').fill('4')
    await page.getByRole('button', { name: 'Raise to 4', exact: true }).click()
    await complete(page)
    const requests = await page.evaluate(() => (window as unknown as { difficultyRequests: { difficulty: string }[] }).difficultyRequests)
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every(request => request.difficulty === level)).toBe(true)
    const stacks = await page.evaluate(() => JSON.parse(sessionStorage.getItem('poker-lab-session-v1')!).players.map((player: { stack: number }) => player.stack))
    expect(stacks[0] + stacks[1]).toBe(400)
    await expect(page.getByTestId('total-hands')).toHaveText('1')
    await expect(page.getByTestId('match-score')).toContainText('0 : 0')
    await page.getByLabel('Сложность AdaptiveAI', { exact: true }).selectOption('Regular')
    await expect(select).toHaveValue('Regular')
    const control = await select.boundingBox(), seat = await page.locator('.seat-ai').boundingBox()
    expect(control!.y + control!.height).toBeLessThanOrEqual(seat!.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.table-scene').screenshot({ path: `test-results/difficulty-${level.replace(/ /g, '-')}-${test.info().project.name}.png` })
  })
}

test('switching the table dropdown while AI is thinking cancels the old level and uses the new level in this hand', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-09T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-09T00:00:01Z'))
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage
    Object.assign(window, { difficultyRequests: [] })
    Worker.prototype.postMessage = function(message: unknown, ...args: unknown[]) {
      ;(window as unknown as { difficultyRequests: { difficulty: string }[] }).difficultyRequests.push(structuredClone(message) as { difficulty: string })
      return Reflect.apply(original, this, [message, ...args])
    }
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
  await page.getByRole('button', { name: 'Call 1', exact: true }).click()
  await page.clock.runFor(500)
  await page.getByRole('combobox', { name: 'Сложность ИИ на столе', exact: true }).selectOption('Nemesis')
  await expect(page.getByTestId('current-difficulty')).toHaveText('Nemesis')
  await page.clock.runFor(1000)
  await expect.poll(() => page.evaluate(() => (window as unknown as { difficultyRequests: { difficulty: string }[] }).difficultyRequests.map(request => request.difficulty))).toEqual(['Nemesis'])
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('poker-lab-session-v1')!).events.some((event: { type: string; player?: number }) => event.type === 'action' && event.player === 1))).toBe(true)
})

async function complete(page: Page) {
  for (let step = 0; step < 120; step++) {
    const next = page.getByRole('button', { name: /^(Следующая раздача|Следующий матч)$/ })
    if (await next.count()) { await expect(next).toBeEnabled(); return }
    const passive = page.getByRole('button', { name: /^(Check|Call \d+)$/ })
    if (await passive.count() && await passive.isEnabled()) await passive.click()
    else await page.waitForTimeout(150)
  }
  throw new Error('AI hand failed to terminate')
}

test('all five difficulty settings persist and model survives session/score resets', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
  const select = page.getByLabel('Сложность AdaptiveAI')
  await expect(select).toHaveValue('Strong Reg')
  for (const level of ['Beginner','Regular','Strong Reg','Expert','Nemesis']) {
    await select.selectOption(level)
    await expect(page.getByTestId('current-difficulty')).toHaveText(level)
  }
  await page.getByRole('button', { name: 'Fold', exact: true }).click()
  await expect(page.getByTestId('profile-hands')).toHaveText('1')
  await page.reload()
  await expect(select).toHaveValue('Nemesis')
  await expect(page.getByTestId('total-hands')).toHaveText('1')
  await expect(page.getByTestId('profile-hands')).toHaveText('1')
  await page.locator('.hero-model summary').click()
  await expect(page.locator('.model-grid')).toContainText('Fold to 3-bet')
  await expect(page.locator('.hero-model')).toContainText('Недостаточно данных')
  await page.getByRole('button', { name: 'Сбросить счёт матчей', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Сбросить счёт', exact: true }).click()
  await expect(page.getByTestId('profile-hands')).toHaveText('1')
  await page.getByRole('button', { name: 'Новая сессия', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Новая сессия', exact: true }).click()
  await expect(page.getByTestId('session-hands')).toHaveText('0')
  await expect(page.getByTestId('profile-hands')).toHaveText('1')
  await expect(select).toHaveValue('Nemesis')
  await page.getByRole('button', { name: 'Fold', exact: true }).click()
  await expect(page.getByTestId('profile-hands')).toHaveText('2')
  await expect(page.getByTestId('total-hands')).toHaveText('2')
  await page.getByRole('button', { name: /История рук/ }).click()
  await expect(page.locator('.hand-entry')).toHaveCount(2)
})

test('worker receives public information only and finishes an Expert hand', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage
    ;(window as unknown as { aiRequests: unknown[] }).aiRequests = []
    Worker.prototype.postMessage = function(message: unknown, ...args: unknown[]) {
      ;(window as unknown as { aiRequests: unknown[] }).aiRequests.push(structuredClone(message))
      return Reflect.apply(original,this,[message,...args])
    }
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
  await page.getByLabel('Сложность AdaptiveAI').selectOption('Expert')
  await expect(page.getByTestId('current-difficulty')).toHaveText('Expert')
  await page.getByLabel('Размер ставки в фишках').fill('4')
  await page.getByRole('button', { name: 'Raise to 4', exact: true }).click()
  await complete(page)
  const snapshot = await page.evaluate(() => ({
    requests: (window as unknown as { aiRequests: { view: { hole: string[] }; difficulty: string }[] }).aiRequests,
    game: JSON.parse(sessionStorage.getItem('poker-lab-session-v1')!),
  }))
  expect(snapshot.requests.length).toBeGreaterThan(0)
  for (const request of snapshot.requests) {
    expect(Object.keys(request).sort()).toEqual(['difficulty','profile','view'])
    expect(request.difficulty).toBe('Expert')
    expect(request.view.hole).toEqual(snapshot.game.players[1].hole)
    expect(JSON.stringify(request)).not.toMatch(/"(deck|players|opponentHole|futureCards)"/)
  }
  expect(snapshot.game.players[0].stack + snapshot.game.players[1].stack).toBe(400)
  expect(errors).toEqual([])
  await page.screenshot({ path: `test-results/ai-expert-${test.info().project.name}.png`, fullPage: true })
})

test('expanded model stays readable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
  await page.locator('.hero-model summary').click()
  await expect(page.getByLabel('Сложность AdaptiveAI')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/ai-model-${test.info().project.name}.png`, fullPage: true })
})
