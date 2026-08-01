import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // These suites cover pure logic only. Anything touching PostgreSQL lives
    // behind the integration suite, which needs a live DATABASE_URL.
    passWithNoTests: false,
  },
})
