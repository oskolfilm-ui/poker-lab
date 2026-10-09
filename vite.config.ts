import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
function buildRevision() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return 'local' } // Builds from source archives need no .git directory.
}
const revision = buildRevision()

// Cloud previews forward requests through a proxy with a changing hostname.
// This development server runs inside the isolated cloud workspace.
const previewServer = {
  host: '0.0.0.0',
  port: 5173,
  strictPort: true,
  allowedHosts: true as const,
}

export default defineConfig({
  // GitHub project Pages serves this application under its repository name.
  base: '/poker-lab/',
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_REVISION__: JSON.stringify(revision) },
  plugins: [react(), {
    name: 'release-manifest',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'release.json', source: JSON.stringify({ version, revision }) })
    },
  }],
  server: previewServer,
  preview: previewServer,
  test: { include: ['tests/unit/**/*.test.ts'] },
})
