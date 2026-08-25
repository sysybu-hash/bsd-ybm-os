/**
 * eslint-config-next 16 ships a native flat config array.
 * FlatCompat (the eslintrc bridge) chokes on it — the shared config now holds
 * circular plugin references that the eslintrc validator tries to JSON.stringify.
 * Spread the flat config directly instead.
 */
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");

module.exports = [
  {
    ignores: [
      ".next/**",
      ".claude/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "scratch/**",
      "coverage/**",
    ],
  },
  ...nextCoreWebVitals,
  {
    /**
     * The last React Compiler rule still switched off. `purity`,
     * `immutability` and `set-state-in-effect` have all been migrated and are
     * enforced by eslint-config-next 16.
     *
     * `refs` covers 55 sites, effectively all of them the latest-ref pattern
     * (`onFooRef.current = onFoo` in the render body). That pattern is correct
     * under React 18 and the recommended workaround for the stale-closure
     * problem the repo actually has; the rule exists because the Compiler can
     * hoist renders, which React 19 makes real. Migrating before that move
     * would be churn against a constraint that does not yet apply.
     *
     * Tracked in docs/LINT-REACT-COMPILER-BACKLOG.md. Do not add new
     * violations.
     */
    rules: {
      "react-hooks/refs": "off",
    },
  },
];
