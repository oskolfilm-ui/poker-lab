import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, stat, mkdir } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const dist = resolve(projectRoot, 'dist')
const output = resolve(projectRoot, 'test-results/production')
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
}

assert(existsSync(resolve(dist, 'index.html')), 'Run npm run build first.')
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
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
const origin = `http://127.0.0.1:${server.address().port}`
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
let browser

async function visible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 15_000 })
}

try {
  browser = await chromium.launch({ executablePath })
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
    await page.goto(origin + mount)
    await page.getByRole('button', { name: 'Пауза автоигры', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Покер — это решения.' }))
    await visible(page.locator('.table-scene'))
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
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.deepEqual(failures, [], 'Browser errors or failed production requests')
    console.log(`PASS ${mount}: production table, AI hand, 400 chips, IndexedDB reload, TXT export, mobile layout; ${assets.size} local assets; no browser errors`)
    await context.close()
  }
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolveClose => server.close(resolveClose))
}
