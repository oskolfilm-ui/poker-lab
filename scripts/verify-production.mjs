import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, stat, mkdir } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { facingMatchAllIn } from '../tests/fixtures/match.ts'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const dist = resolve(projectRoot, 'dist')
const publishedUrl = process.env.POKER_LAB_URL
if (process.argv.includes('--published')) assert(publishedUrl, 'POKER_LAB_URL is required for public-site verification.')
if (publishedUrl) assert.equal(new URL(publishedUrl).protocol, 'https:', 'Verify the public site over HTTPS.')
const output = resolve(projectRoot, publishedUrl ? 'test-results/published' : 'test-results/production')
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
}

if (!publishedUrl) assert(existsSync(resolve(dist, 'index.html')), 'Run npm run build first.')
await mkdir(output, { recursive: true })

// Serve only dist files, with no Vite transformations or SPA fallback that
// could hide a missing module. Mirror the GitHub project-site mount.
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (pathname === '/poker-lab') {
      response.writeHead(308, { Location: '/poker-lab/' }); response.end(); return
    }
    if (pathname.startsWith('/poker-lab/')) pathname = pathname.slice('/poker-lab'.length)
    const path = resolve(dist, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`)
    if (!path.startsWith(dist + sep) || !(await stat(path)).isFile()) throw new Error('Not found')
    const body = await readFile(path)
    response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' })
    response.end(body)
  } catch { response.writeHead(404); response.end('Not found') }
})
if (!publishedUrl) await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
const site = publishedUrl ?? `http://127.0.0.1:${server.address().port}/poker-lab/`
assert.equal(new URL(site).pathname, '/poker-lab/', 'Use the complete project Pages URL.')
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
let browser
let profileContext

async function visible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 15_000 })
}

try {
  if (process.env.PLAYWRIGHT_USER_DATA_DIR) {
    // Optional isolated profile with the cloud environment's trusted CA already
    // installed. HTTPS verification stays enabled, including on the public site.
    profileContext = await chromium.launchPersistentContext(process.env.PLAYWRIGHT_USER_DATA_DIR, { executablePath })
    browser = profileContext.browser()
  } else browser = await chromium.launch({ executablePath })
  const releaseResponse = await browser.newContext()
  let manifest
  const deadline = Date.now() + (publishedUrl ? 5 * 60_000 : 0)
  for (;;) {
    try {
      const release = await releaseResponse.request.get(new URL(`release.json?v=${Date.now()}`, site).href, { timeout: 15_000 })
      assert(release.ok(), 'Published release manifest is missing; this is an older deployment.')
      manifest = await release.json()
      assert.equal(typeof manifest.revision, 'string')
      assert.equal(typeof manifest.version, 'string')
      if (process.env.EXPECTED_REVISION) assert.equal(manifest.revision, process.env.EXPECTED_REVISION, 'Wrong commit deployed')
      break
    } catch (cause) {
      if (Date.now() >= deadline) throw cause
      console.log('Waiting for the expected Pages release to propagate…')
      await new Promise(resolveWait => setTimeout(resolveWait, 5000))
    }
  }
  await releaseResponse.close()
  for (const mount of ['/poker-lab/']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true })
    const page = await context.newPage()
    const failures = []
    const assets = new Set()
    page.on('pageerror', error => failures.push(error.message))
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
    page.on('requestfailed', request => failures.push(`${request.url()} ${request.failure()?.errorText}`))
    page.on('response', response => {
      const url = new URL(response.url())
      if (response.status() >= 400) failures.push(`${url.pathname}: HTTP ${response.status()}`)
      if (url.pathname.includes('/assets/')) {
        if (!url.pathname.startsWith(mount)) failures.push(`Asset escaped the site base: ${url.pathname}`)
        assets.add(url.pathname)
      }
    })
    await page.goto(`${site}?v=${manifest.revision}`)
    await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Покер — это решения.' }))
    await visible(page.locator('.table-scene'))
    await expect(page.getByTestId('match-score')).toHaveCount(1)
    await expect(page.getByTestId('match-score')).toContainText('0 : 0')
    await expect(page.locator('.footer-version')).toContainText(manifest.revision.slice(0, 7))
    await expect(page.locator('.footer-version')).toContainText(`v${manifest.version}`)
    await expect(page.getByLabel('Сложность AdaptiveAI').locator('option')).toHaveCount(5)
    const tableDifficulty = page.getByRole('combobox', { name: 'Сложность ИИ на столе', exact: true })
    await expect(tableDifficulty.locator('option')).toHaveText(['Beginner', 'Regular', 'Strong Reg', 'Expert', 'Nemesis'])
    for (const level of ['Beginner', 'Regular', 'Strong Reg', 'Expert', 'Nemesis']) {
      await tableDifficulty.selectOption(level)
      await expect(page.getByTestId('current-difficulty')).toHaveText(level)
      await expect(page.getByLabel('Сложность AdaptiveAI', { exact: true })).toHaveValue(level)
    }
    await page.evaluate(() => document.fonts.ready)
    await page.reload()
    await expect(tableDifficulty).toHaveValue('Nemesis')
    await tableDifficulty.selectOption('Strong Reg')
    await expect(page.getByTestId('current-difficulty')).toHaveText('Strong Reg')
    await expect(page.getByTestId('result-hands')).toHaveText('0')
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.locator('.seat-hero .playing-card').count(), 2)
    assert.equal(await page.locator('.seat-ai .card-back').count(), 2)
    assert(await page.getByRole('button', { name: 'Call 1', exact: true }).isEnabled())
    assert(assets.size >= 3, 'Production JS, CSS and fonts were not loaded')
    assert.equal(await page.locator('script[src*="/src/"]').count(), 0, 'Development entry leaked into dist')
    await page.screenshot({ path: resolve(output, 'github-pages.png'), fullPage: true, animations: 'disabled' })

    // Test the compiled game: check/call against the actual AI until completion.
    let finished = false
    for (let attempt = 0; attempt < 140; attempt++) {
      const next = page.getByRole('button', { name: /^(Следующая раздача|Следующий матч)$/ })
      if (await next.count() && await next.isEnabled()) { finished = true; break }
      const passive = page.getByRole('button', { name: /^(Check|Call \d+)$/ })
      if (await passive.count() && await passive.isEnabled()) await passive.click()
      else await page.waitForTimeout(150)
    }
    assert(finished, 'Production game did not complete a hand')
    const game = await page.evaluate(() => JSON.parse(sessionStorage.getItem('poker-lab-session-v1')))
    assert(game.result)
    assert.equal(game.players[0].stack + game.players[1].stack, 400)
    assert(game.result.reason === 'fold' || game.board.length === 5)
    await expect(page.getByTestId('total-hands')).toHaveText('1')
    await expect(page.getByTestId('result-hands')).toHaveText('1')
    await page.getByRole('button', { name: /История рук/ }).click()
    await visible(page.locator('.hand-entry'))
    assert.equal(await page.locator('.hand-entry').count(), 1)
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: /Экспорт TXT/ }).click()
    const download = await downloaded
    const stream = await download.createReadStream()
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const exported = Buffer.concat(chunks).toString('utf8')
    assert(exported.includes('TRAINING ONLY'))
    assert(exported.includes('compatibility is UNVERIFIED'))
    assert(exported.includes(`Total pot ${game.result.pot} | Rake 0`))
    await page.reload()
    await page.getByRole('button', { name: /История рук/ }).click()
    await visible(page.locator('.hand-entry'))
    assert.equal(await page.locator('.hand-entry').count(), 1)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Тренировка', exact: true }).click()
    await visible(page.locator('.table-scene'))
    await page.locator('.seat-hero').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('match-score')).toBeInViewport()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.deepEqual(failures, [], 'Browser errors or failed production requests')
    console.log(`PASS ${mount}: production table, AI hand, 400 chips, IndexedDB reload, TXT export, mobile layout; ${assets.size} local assets; no browser errors`)
    await context.close()
  }
  for (const winner of [0, 1]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const failures = []
    page.on('pageerror', error => failures.push(error.message))
    page.on('requestfailed', request => failures.push(`${request.url()} ${request.failure()?.errorText}`))
    await page.clock.install({ time: new Date('2026-10-09T00:00:00Z') })
    await page.clock.pauseAt(new Date('2026-10-09T00:00:01Z'))
    // Rig only the initial test state. The compiled UI and compiled engine
    // perform the actual call, showdown, persistence and automatic transition.
    await page.addInitScript(game => {
      if (!sessionStorage.getItem('poker-lab-session-v1')) {
        sessionStorage.setItem('poker-lab-session-v1', JSON.stringify(game))
        sessionStorage.setItem('poker-lab-context-v1', JSON.stringify({ sessionId: 'production-session', matchId: 'production-match', paused: false }))
      }
    }, facingMatchAllIn(winner))
    await page.goto(`${site}?v=${manifest.revision}`)
    await expect(page.getByTestId('result-hands')).toHaveText('0')
    await page.getByRole('button', { name: 'Call 198', exact: true }).click()
    const score = winner === 0 ? '1 : 0' : '0 : 1'
    await expect(page.getByTestId('match-score')).toContainText(score)
    await expect(page.locator('.match-status')).toContainText(winner === 0 ? 'Hero выиграл матч!' : 'AdaptiveAI выиграл матч!')
    await expect(page.getByTestId('result-net-bb')).toHaveText(winner === 0 ? '+100 BB' : '-100 BB')
    await expect(page.getByTestId('result-bb100')).toHaveText(winner === 0 ? '+10 000 bb/100' : '-10 000 bb/100')
    await page.screenshot({ path: resolve(output, `match-${winner === 0 ? 'hero' : 'ai'}.png`), fullPage: true })
    await page.clock.runFor(2999)
    await expect(page.locator('.result-net')).toBeVisible()
    await page.clock.runFor(1)
    await expect(page.locator('.hand-number')).toContainText('#002')
    assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('poker-lab-session-v1')).players.map(player => player.initialStack)), [200, 200])
    await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
    await page.reload()
    await expect(page.getByTestId('match-score')).toContainText(score)
    await expect(page.getByTestId('total-hands')).toHaveText('1')
    await expect(page.getByTestId('session-hands')).toHaveText('1')
    await expect(page.getByTestId('result-hands')).toHaveText('1')
    await page.getByRole('button', { name: 'Новая сессия', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Новая сессия', exact: true }).click()
    await expect(page.getByTestId('session-hands')).toHaveText('0')
    await expect(page.getByTestId('result-hands')).toHaveText('0')
    await expect(page.getByTestId('match-score')).toContainText(score)
    await page.getByRole('button', { name: 'Всё время', exact: true }).click()
    await expect(page.getByTestId('result-hands')).toHaveText('1')
    await expect(page.getByTestId('result-net-bb')).toHaveText(winner === 0 ? '+100 BB' : '-100 BB')
    // New tabs share IndexedDB but have independent sessions.
    const another = await context.newPage()
    await another.goto(`${site}?v=${manifest.revision}`)
    await expect(another.getByTestId('session-hands')).toHaveText('0')
    await expect(another.getByTestId('total-hands')).toHaveText('1')
    await expect(another.getByTestId('match-score')).toContainText(score)
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(size)
      await page.locator('.seat-hero').scrollIntoViewIfNeeded()
      await expect(page.getByTestId('match-score')).toBeInViewport()
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.getByTestId('results-chart').scrollIntoViewIfNeeded()
      await expect(page.getByRole('img', { name: /График bb\/100/ })).toBeVisible()
      await page.getByTestId('results-chart').screenshot({ path: resolve(output, `chart-${winner}-${size.width}.png`) })
      await page.locator('.seat-hero').scrollIntoViewIfNeeded()
      await page.screenshot({ path: resolve(output, `table-${winner}-${size.width}.png`) })
    }
    assert.deepEqual(failures, [], 'Errors in production match/statistics scenarios')
    console.log(`PASS ${site}: ${winner === 0 ? 'Hero' : 'AI'} actual all-in call, score ${score}, 3s restart 200/200, bb/100, reload, new session/tab, 320/390px visibility`)
    await context.close()
  }
  console.log(`Verified ${publishedUrl ? 'PUBLISHED' : 'COMPILED'} release ${manifest.version} (${manifest.revision}).`)
} finally {
  await profileContext?.close()
  await browser?.close()
  if (!publishedUrl) {
    server.closeAllConnections()
    await new Promise(resolveClose => server.close(resolveClose))
  }
}
