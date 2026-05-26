const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['<rootDir>/e2e/', '<rootDir>/.claude/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'lib/billing-calculations.ts',
    'lib/cashflow-logic.ts',
    'lib/vat-config.ts',
    'lib/finance-forecast.ts',
    'lib/tri-engine-merge.ts',
    'lib/ai-orchestrator.ts',
    'lib/api-handler.ts',
    'lib/rate-limit.ts',
    'lib/webhook-verify.ts',
    'lib/cron-guard.ts',
    'lib/launcher/**/*.ts',
    'lib/core/**/*.ts',
    '!lib/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      statements: 65,
      branches: 55,
      functions: 65,
      lines: 65,
    },
  },
}

module.exports = createJestConfig(customJestConfig)
