import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['web/**/*', 'node_modules/**/*', 'output/**/*', 'infra/**/*']
  },
})
