import { expect, test, type Page } from '@playwright/test'

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
