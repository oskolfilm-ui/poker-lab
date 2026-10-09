import { expect, test } from '@playwright/test'
import { applyAction, startHand } from '../../src/game/engine'
import { DEFAULT_RAKE } from '../../src/game/rake'
import { createDeck, type Card } from '../../src/game/cards'

test('raked all-in settles once, survives reload, exports net payouts and updates bb/100', async ({ page }) => {
  const draws: Card[] = ['2h', 'As', '3h', 'Ad', '4c', '7c', '8d', 'Jh', '5c', 'Qs', '6c', 'Kh']
  const game = applyAction(applyAction(startHand({ rakeConfig: DEFAULT_RAKE, deck: [...createDeck().filter(card => !draws.includes(card)), ...draws.reverse()] }), 0, { type: 'call' }), 1, { type: 'allin' })
  await page.addInitScript(game => {
    if (!sessionStorage.getItem('poker-lab-session-v1')) {
      sessionStorage.setItem('poker-lab-session-v1', JSON.stringify(game))
      sessionStorage.setItem('poker-lab-context-v1', JSON.stringify({ sessionId: 'rake-session', matchId: 'rake-match', paused: true }))
    }
  }, game)
  await page.goto('./')
  await page.getByRole('button', { name: 'Call 198', exact: true }).click()
  await expect(page.getByTestId('hand-rake')).toHaveText('Рейк: 4 фишек · выплата 396')
  await expect(page.getByTestId('stack-0')).toHaveText('396')
  await expect(page.getByTestId('result-bb100')).toHaveText('+9 800 bb/100')
  await expect(page.getByTestId('total-hands')).toHaveText('1')
  await expect(page.getByTestId('match-score')).toContainText('1 : 0')
  await page.reload()
  await expect(page.getByTestId('stack-0')).toHaveText('396')
  await expect(page.getByTestId('total-hands')).toHaveText('1')
  await page.getByRole('button', { name: /История рук/ }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Экспорт TXT/ }).click()
  const stream = await (await downloadPromise).createReadStream()
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  expect(text).toContain('Total pot 400 | Rake 4')
  expect(text).toContain('Hero collected 396 from pot')
})

test('settings persist, apply next hand and do not retroactively rake the current hand', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
  const rate = page.getByRole('spinbutton', { name: 'Рейк, %', exact: true })
  await expect(rate).toHaveValue('5')
  await page.getByRole('spinbutton', { name: 'Кэп, BB', exact: true }).fill('3')
  await rate.fill('10')
  await expect(page.getByLabel('Настройки рейка')).toContainText('со следующей раздачи')
  await page.reload()
  await expect(rate).toHaveValue('10')
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('poker-lab-session-v1')!).rakeConfig.percent)).toBe(5)
  await page.getByRole('button', { name: 'Fold', exact: true }).click()
  await expect(page.getByTestId('hand-rake')).toContainText('Рейк: 0')
  await page.getByRole('button', { name: 'Следующая раздача', exact: true }).click()
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('poker-lab-session-v1')!).rakeConfig)).toEqual({ ...DEFAULT_RAKE, percent: 10, capBB: 3 })
})
