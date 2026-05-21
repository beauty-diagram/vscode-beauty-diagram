import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
    alias: {
      // vscode module is injected by the host at runtime; stub it for tests.
      vscode: resolve(__dirname, 'tests/mocks/vscode.ts'),
    },
  },
})
