import { expect, test } from '@playwright/test'
import { facingMatchAllIn } from '../fixtures/match'
import { applyAction, startHand } from '../../src/game/engine'
import { completedHand } from '../../src/history/store'

for (const winner of [0, 1] as const) {
  test(`a real call completes ${winner === 0 ? 'Hero' : 'AI'} match: one score point, realized result, automatic 200/200, reload and fresh session`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-09T00:00:00Z') })
    await page.clock.pauseAt(new Date('2026-10-09T00:00:01Z'))
    await page.addInitScript(game => {
      if (!sessionStorage.getItem('poker-lab-session-v1')) {
        sessionStorage.setItem('poker-lab-session-v1', JSON.stringify(game))
        sessionStorage.setItem('poker-lab-context-v1', JSON.stringify({ sessionId: 'results-session', matchId: 'results-match', paused: false }))
      }
    }, facingMatchAllIn(winner))
    await page.goto('./')
    await expect(page.getByTestId('result-hands')).toHaveText('0')
    await expect(page.getByTestId('match-score')).toContainText('0 : 0')
    await page.getByRole('button', { name: 'Call 198', exact: true }).click()
    const score = winner === 0 ? '1 : 0' : '0 : 1'
    await expect(page.getByTestId('match-score')).toContainText(score)
    await expect(page.locator('.match-status')).toContainText(winner === 0 ? 'Hero выиграл матч!' : 'AdaptiveAI выиграл матч!')
    await expect(page.getByTestId('total-hands')).toHaveText('1')
    await expect(page.getByTestId('session-hands')).toHaveText('1')
    await expect(page.getByTestId('result-hands')).toHaveText('1')
    await expect(page.getByTestId('result-net-bb')).toHaveText(winner === 0 ? '+100 BB' : '-100 BB')
    await expect(page.getByTestId('result-bb100')).toHaveText(winner === 0 ? '+10 000 bb/100' : '-10 000 bb/100')
    await page.clock.runFor(2999)
    await expect(page.locator('.result-net')).toBeVisible()
    await page.clock.runFor(1)
    await expect(page.locator('.hand-number')).toContainText('#002')
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('poker-lab-session-v1')!).players.map((player: { initialStack: number }) => player.initialStack))).toEqual([200, 200])
    await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
    await page.reload()
    await expect(page.getByTestId('match-score')).toContainText(score)
    await expect(page.getByTestId('result-hands')).toHaveText('1')
    await expect(page.getByTestId('total-hands')).toHaveText('1')
    // Existing score reset and new sessions must not change realized history.
    await page.getByRole('button', { name: 'Новая сессия', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Новая сессия', exact: true }).click()
    await expect(page.getByTestId('session-hands')).toHaveText('0')
    await expect(page.getByTestId('result-hands')).toHaveText('0')
    await expect(page.getByTestId('match-score')).toContainText(score)
    await page.getByRole('button', { name: 'Всё время', exact: true }).click()
    await expect(page.getByTestId('result-hands')).toHaveText('1')
    await expect(page.getByTestId('result-net-bb')).toHaveText(winner === 0 ? '+100 BB' : '-100 BB')
    await page.getByRole('button', { name: /История рук/ }).click()
    await expect(page.locator('.hand-entry')).toHaveCount(1)
  })
}

test('the sole scoreboard remains above the visible table while scrolling to Hero', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('match-score')).toHaveCount(1)
  await page.locator('.seat-hero').scrollIntoViewIfNeeded()
  await expect.poll(() => page.locator('.match-scoreboard').evaluate(el => {
    const rect = el.getBoundingClientRect()
    const hero = document.querySelector('.seat-hero')!.getBoundingClientRect()
    return rect.top >= 0 && rect.bottom <= hero.top && rect.bottom < innerHeight
  })).toBe(true)
  await expect(page.getByTestId('match-score')).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Пауза автоигры', exact: true })).toBeInViewport()
})

test('ordinary fold changes the completed-hand curve once, leaves the match score alone and survives reload', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
  await expect(page.getByTestId('result-hands')).toHaveText('0')
  await page.getByRole('button', { name: 'Fold', exact: true }).click()
  await expect(page.getByTestId('result-bb100')).toHaveText('-50 bb/100')
  await expect(page.getByTestId('result-net-bb')).toHaveText('-0,5 BB')
  await expect(page.getByTestId('match-score')).toContainText('0 : 0')
  await expect(page.getByTestId('total-hands')).toHaveText('1')
  await page.reload()
  await expect(page.getByTestId('result-hands')).toHaveText('1')
  await expect(page.getByTestId('result-bb100')).toHaveText('-50 bb/100')
  await page.getByRole('button', { name: 'Всё время', exact: true }).click()
  await expect(page.getByRole('img', { name: /График bb\/100/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('the curve and keyboard hand selection use a running average of net profit, including restored pending history', async ({ page }) => {
  const first = completedHand(applyAction(startHand({ startedAt: '2026-10-09T00:00:00Z' }), 0, { type: 'fold' }), { sessionId: 'curve-session', matchId: 'warmup-match' })
  first.endedAt = '2026-10-09T00:00:01Z'
  const game = facingMatchAllIn(0)
  game.startedAt = '2026-10-09T00:00:02Z'
  await page.addInitScript(({ game, first }) => {
    if (!sessionStorage.getItem('poker-lab-session-v1')) {
      sessionStorage.setItem('poker-lab-session-v1', JSON.stringify(game))
      sessionStorage.setItem('poker-lab-pending-v1', JSON.stringify([first, first]))
      sessionStorage.setItem('poker-lab-context-v1', JSON.stringify({ sessionId: 'curve-session', matchId: 'curve-match', paused: true }))
    }
  }, { game, first })
  await page.goto('./')
  await expect(page.getByTestId('total-hands')).toHaveText('1')
  await page.getByRole('button', { name: 'Call 198', exact: true }).click()
  await expect(page.getByTestId('total-hands')).toHaveText('2')
  await expect(page.getByTestId('result-hands')).toHaveText('2')
  await expect(page.getByTestId('result-net-bb')).toHaveText('+99,5 BB')
  await expect(page.getByTestId('result-bb100')).toHaveText('+4 975 bb/100')
  const slider = page.getByRole('slider', { name: 'Раздача на графике' })
  await slider.focus()
  await slider.press('ArrowLeft')
  await expect(page.getByTestId('result-detail')).toHaveText('Раздача 1: -0,5 BB · накопленный результат -50 bb/100')
  await slider.press('ArrowRight')
  await expect(page.getByTestId('result-detail')).toHaveText('Раздача 2: +100 BB · накопленный результат +4 975 bb/100')
  await page.reload()
  await expect(page.getByTestId('result-hands')).toHaveText('2')
  await expect(page.getByTestId('result-bb100')).toHaveText('+4 975 bb/100')
})
