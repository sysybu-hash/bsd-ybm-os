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
     * React Compiler rules, newly enabled by eslint-config-next 16.
     * They flag 97 pre-existing sites that this repo has always shipped:
     * the latest-ref pattern (`ref.current = cb` during render), setState
     * inside an effect for prop-sync, and `Date.now()` in useRef/useMemo
     * initialisers. None are bugs today, but adopting the rules means a
     * 93-site refactor with real regression risk — that is its own change,
     * not a rider on a security upgrade.
     *
     * Tracked in docs/LINT-REACT-COMPILER-BACKLOG.md. Do not add new
     * violations; re-enable one rule at a time as sites are migrated.
     */
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
];
