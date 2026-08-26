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
     * All four React Compiler rules from eslint-config-next 16 are enforced.
     *
     * `refs` was the last one. It reported 55 violations, but 43 of those were
     * a single false positive shape: CrmTableWidget kept the whole `useCrmTable`
     * result in one `s` object, and because that object carries a ref, the
     * compiler inferred every `s.loading` / `s.clients` read as a ref access.
     * Naming the values individually cleared all 43 at once.
     *
     * Of the real 12, seven were the latest-ref assignment, now
     * `hooks/use-latest-ref.ts`; one was a genuine bug (a dirty-state banner
     * computed from a ref, so it did not re-render after a save); and four carry
     * a documented eslint-disable in the adaptive shell, two of them lazy
     * `useState` initialisers the rule cannot distinguish from render.
     *
     * Do not add new violations. History in
     * docs/LINT-REACT-COMPILER-BACKLOG.md.
     */
    rules: {},
  },
];
