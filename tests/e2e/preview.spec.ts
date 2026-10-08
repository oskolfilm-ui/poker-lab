import { expect, test } from '@playwright/test'
import { createServer, request as forwardRequest } from 'node:http'
import { connect, type Socket } from 'node:net'

// Exercise actual Vite responses through a proxy, rather than mock modules.
// The synthetic Host is intentionally outside Vite's localhost defaults.
const previewHost = 'poker-lab-preview.example'

test('embedded cloud preview loads modules, renders the table and persists a hand', async ({ page }, testInfo) => {
  const sockets = new Set<Socket>()
  const server = createServer((request, response) => {
    if (request.url === '/preview-shell') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><html><head><link rel="icon" href="/poker-lab/favicon.svg"></head><body style="margin:0"><iframe title="POKER LAB preview" src="/poker-lab/" sandbox="allow-scripts allow-same-origin allow-modals allow-downloads" style="width:100vw;height:100vh;border:0"></iframe></body></html>')
      return
    }
    const upstream = forwardRequest({
      hostname: '127.0.0.1', port: 5173, path: request.url,
      method: request.method, headers: { ...request.headers, host: previewHost },
    }, result => {
      response.writeHead(result.statusCode ?? 502, result.headers)
      result.pipe(response)
    })
    upstream.on('error', error => { response.writeHead(502); response.end(error.message) })
    request.pipe(upstream)
  })
  const track = (socket: Socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) }
  server.on('connection', track)
  // Forward Vite's HMR handshake as well as ordinary module/asset requests.
  server.on('upgrade', (request, socket, head) => {
    const upstream = connect(5173, '127.0.0.1', () => {
      const headers = { ...request.headers, host: previewHost }
      const lines = Object.entries(headers).flatMap(([key, value]) => Array.isArray(value) ? value.map(item => `${key}: ${item}`) : value === undefined ? [] : [`${key}: ${value}`])
      upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`)
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    track(upstream)
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
    socket.on('close', () => upstream.destroy())
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Preview proxy did not start')
  const origin = `http://127.0.0.1:${address.port}`
  const errors: string[] = []
  const failed: string[] = []
  const loaded: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('requestfailed', request => failed.push(`${request.url()} ${request.failure()?.errorText}`))
  page.on('response', response => {
    if (response.status() >= 400) failed.push(`${response.url()} HTTP ${response.status()}`)
    else loaded.push(new URL(response.url()).pathname)
  })
  try {
    await page.goto(`${origin}/preview-shell`)
    const app = page.frameLocator('iframe')
    await expect(app.getByRole('heading', { name: 'Покер — это решения.' })).toBeVisible()
    await expect(app.locator('.table-scene')).toBeVisible()
    await expect(app.locator('.seat-hero .playing-card')).toHaveCount(2)
    await expect(app.locator('.seat-ai .playing-card')).toHaveCount(2)
    await expect(app.getByRole('button', { name: 'Call 1', exact: true })).toBeEnabled()
    await expect(app.locator('.table-scene')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    expect(loaded).toContain('/poker-lab/src/main.tsx')
    expect(loaded).toContain('/poker-lab/src/App.tsx')
    expect(loaded).toContain('/poker-lab/src/styles.css')
    await app.locator('.table-scene').screenshot({ path: testInfo.outputPath('preview-table.png'), animations: 'disabled' })
    await app.getByRole('button', { name: 'Fold', exact: true }).click()
    await expect(app.getByRole('button', { name: 'Следующая раздача' })).toBeEnabled()
    await app.getByRole('button', { name: /История рук/ }).click()
    await expect(app.locator('.hand-entry')).toHaveCount(1)
    await page.reload()
    await app.getByRole('button', { name: /История рук/ }).click()
    await expect(app.locator('.hand-entry')).toHaveCount(1)
    expect(errors).toEqual([])
    expect(failed).toEqual([])
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
