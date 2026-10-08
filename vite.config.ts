import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

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
  plugins: [react()],
  server: previewServer,
  preview: previewServer,
  test: { include: ['tests/unit/**/*.test.ts'] },
})
