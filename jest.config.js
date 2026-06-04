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
    'lib/core/site-url.ts',
    'lib/launcher/**/*.ts',
    'lib/field-copilot/client-step.ts',
    'lib/project-payment-milestones.ts',
    '!lib/launcher/hub-meta.ts',
    '!lib/launcher/launcher-permissions.ts',
    '!lib/launcher/launcher-icons.ts',
    '!lib/launcher/picker-catalog.ts',
    '!lib/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 60,
      functions: 75,
      lines: 75,
    },
  },
}

module.exports = createJestConfig(customJestConfig)
