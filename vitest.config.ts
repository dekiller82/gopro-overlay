import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Mirrors electron.vite.config.ts's own alias so renderer-side files (which import via
    // '@shared/...', never relative paths) can be unit tested too, not just main/shared ones.
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
