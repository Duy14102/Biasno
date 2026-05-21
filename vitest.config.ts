import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@':         resolve(__dirname, 'src/renderer'),
    },
  },
})
